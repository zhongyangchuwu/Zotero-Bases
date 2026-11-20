import { NATIVE_COLUMNS } from './contracts';
import type {
  Column,
  ConfigChange,
  Filter,
  Preferences,
  Property,
  PropertyType,
  View,
} from './contracts';
import { readProperty, writeProperty } from './extra';

export const SCHEMA_PREF = 'extensions.zotero-bases.schema.v1';
export const VIEWS_PREF = 'extensions.zotero-bases.views.v1';

export interface Prefs {
  get(name: string, global: true): unknown;
  set(name: string, value: string, global: true): void;
  registerObserver(name: string, listener: () => void, global: true): symbol;
  unregisterObserver(id: symbol): void;
}

type Validate = (property: Property) => Property;
type SchemaChange = Exclude<ConfigChange, { kind: 'views' }>;
type ExtraEdit = (extra: string) => string;

const propertyTypes: Record<PropertyType, true> = {
  text: true,
  number: true,
  checkbox: true,
  'single-select': true,
  'multi-select': true,
};
const operators: readonly string[] = [
  'contains',
  'equals',
  'gte',
  'lte',
  'has',
  'missing',
  'before',
  'after',
];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parse(raw: unknown): unknown {
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function column(value: unknown): value is Column {
  return (
    typeof value === 'string' &&
    (NATIVE_COLUMNS.some((name) => name === value) || /^property:.+/u.test(value))
  );
}

function filter(value: unknown): value is Filter {
  return (
    object(value) &&
    column(value.column) &&
    typeof value.operator === 'string' &&
    operators.includes(value.operator) &&
    typeof value.value === 'string'
  );
}

function view(value: unknown): View | undefined {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    typeof value.scope !== 'string' ||
    !value.scope
  ) {
    return undefined;
  }
  const sort = value.sort;
  return {
    id: value.id,
    name: value.name,
    scope: value.scope,
    columns: Array.isArray(value.columns) ? value.columns.filter(column) : NATIVE_COLUMNS,
    sort:
      object(sort) && column(sort.column) && (sort.direction === 'asc' || sort.direction === 'desc')
        ? { column: sort.column, direction: sort.direction }
        : { column: 'title', direction: 'asc' },
    filters: Array.isArray(value.filters) ? value.filters.filter(filter) : [],
  };
}

function keyID(key: string): string {
  return key.trim().normalize('NFC').toLowerCase();
}

function propertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && Object.hasOwn(propertyTypes, value);
}

export function createConfig(prefs: Prefs, initialScope: () => string, validate: Validate) {
  function views(value: unknown, active: unknown): Pick<Preferences, 'views' | 'active'> {
    const byID = new Map<string, View>();
    if (Array.isArray(value)) {
      for (const raw of value) {
        const decoded = view(raw);
        if (decoded) byID.set(decoded.id, decoded);
      }
    }
    if (!byID.size) {
      byID.set('default', {
        id: 'default',
        name: 'Default',
        scope: initialScope(),
        columns: NATIVE_COLUMNS,
        sort: { column: 'title', direction: 'asc' },
        filters: [],
      });
    }
    const list = [...byID.values()];
    return {
      views: list,
      active: typeof active === 'string' && byID.has(active) ? active : list[0]!.id,
    };
  }

  function writeViews(settings: Pick<Preferences, 'views' | 'active'>): void {
    prefs.set(VIEWS_PREF, JSON.stringify(views(settings.views, settings.active)), true);
  }

  // Persist the first scope once; later windows share the same saved default.
  if (prefs.get(VIEWS_PREF, true) === undefined)
    prefs.set(VIEWS_PREF, JSON.stringify(views([], null)), true);

  function readProperties(): readonly Property[] {
    const rawSchema = parse(prefs.get(SCHEMA_PREF, true));
    const properties = new Map<string, Property>();
    if (Array.isArray(rawSchema)) {
      for (const raw of rawSchema) {
        if (!object(raw)) continue;
        const { key, type, options } = raw;
        if (
          typeof key !== 'string' ||
          !propertyType(type) ||
          (options !== undefined &&
            (!Array.isArray(options) || !options.every((option) => typeof option === 'string')))
        ) {
          continue;
        }
        try {
          const property = validate({ key, type, options });
          properties.set(keyID(property.key), property);
        } catch {
          // A malformed or newly reserved definition must not authorize an Extra write.
        }
      }
    }
    return [...properties.values()];
  }

  return {
    readProperties,
    settings(): Preferences {
      const saved = parse(prefs.get(VIEWS_PREF, true));
      return {
        properties: readProperties(),
        ...(object(saved) ? views(saved.views, saved.active) : views([], null)),
      };
    },
    writeViews,
    writeSchema(properties: readonly Property[]): void {
      prefs.set(SCHEMA_PREF, JSON.stringify(properties), true);
    },
  };
}

export function changeSchema(
  properties: readonly Property[],
  change: SchemaChange,
  validate: Validate,
): { properties: readonly Property[]; edit?: ExtraEdit } {
  const key = keyID(change.kind === 'define' ? change.property.key : change.key);
  const index = properties.findIndex((property) => keyID(property.key) === key);
  const previous = properties[index];
  if (change.kind === 'define') {
    const property = validate(change.property);
    if (!previous) return { properties: [...properties, property] };
    if (property.type !== previous.type) throw new Error('Property type cannot change');
    return {
      properties: properties.map((current, i) =>
        i === index ? { ...property, key: previous.key } : current,
      ),
    };
  }
  if (!previous) throw new Error('Property no longer exists');
  if (change.kind === 'delete-property') {
    return {
      properties: properties.filter((_, i) => i !== index),
      ...(change.clean && { edit: (extra: string) => writeProperty(extra, previous, null) }),
    };
  }

  const option = (change.kind === 'rename-option' ? change.previous : change.option)
    .trim()
    .normalize('NFC');
  const optionIndex = previous.options?.indexOf(option) ?? -1;
  if (optionIndex < 0 || !previous.options) throw new Error('Option no longer exists');
  const options = [...previous.options];
  if (change.kind === 'rename-option') options[optionIndex] = change.next;
  else options.splice(optionIndex, 1);
  const updated = validate({ ...previous, options });
  const next = change.kind === 'rename-option' ? updated.options![optionIndex]! : null;
  const edit: ExtraEdit = (extra) => {
    const value = readProperty(extra, previous);
    if (Array.isArray(value) && value.includes(option)) {
      const replaced =
        next === null
          ? value.filter((part) => part !== option)
          : value.map((part) => (part === option ? next : part));
      return writeProperty(extra, updated, replaced);
    }
    return value === option ? writeProperty(extra, updated, next) : extra;
  };
  return {
    properties: properties.map((current, i) => (i === index ? updated : current)),
    ...((change.kind === 'rename-option' ? next !== option : change.clean) && { edit }),
  };
}
