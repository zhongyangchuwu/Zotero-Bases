import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, NATIVE_COLUMNS } from './contracts';
import type {
  Column,
  ConfigChange,
  Density,
  Filter,
  Grouping,
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

function grouping(value: unknown): Grouping | undefined {
  if (!object(value) || !isDirection(value.direction)) return undefined;
  const { column, direction } = value;
  if (column === 'tags')
    return typeof value.tag === 'string' && value.tag.trim()
      ? { column, tag: value.tag, direction }
      : undefined;
  if (column === 'year' || column === 'type') return { column, direction };
  if (typeof column === 'string' && /^property:.+/u.test(column))
    return { column: column as `property:${string}`, direction };
  return undefined;
}

function isDirection(value: unknown): value is Grouping['direction'] {
  return value === 'asc' || value === 'desc';
}

function validSort(value: unknown): value is View['sort'] {
  return object(value) && column(value.column) && isDirection(value.direction);
}

function validDensity(value: unknown): value is Density {
  return value === 'compact' || value === 'comfortable' || value === 'wrap';
}

function validColumnWidths(value: unknown): value is NonNullable<View['columnWidths']> {
  return (
    object(value) &&
    Object.entries(value).every(
      ([key, width]) =>
        column(key) &&
        typeof width === 'number' &&
        Number.isFinite(width) &&
        width >= MIN_COLUMN_WIDTH &&
        width <= MAX_COLUMN_WIDTH,
    )
  );
}

function view(value: unknown, strict = false): View | undefined {
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
  const { sort } = value;
  const group = grouping(value.group);
  const density = validDensity(value.density) ? value.density : undefined;
  const columnWidths = validColumnWidths(value.columnWidths) ? value.columnWidths : undefined;
  if (
    strict &&
    (!Array.isArray(value.columns) ||
      !value.columns.every(column) ||
      !validSort(sort) ||
      !Array.isArray(value.filters) ||
      !value.filters.every(filter) ||
      (value.group !== undefined && !group) ||
      (value.density !== undefined && !density) ||
      (value.columnWidths !== undefined && !columnWidths))
  )
    return undefined;
  return {
    id: value.id,
    name: value.name,
    scope: value.scope,
    columns: Array.isArray(value.columns) ? value.columns.filter(column) : NATIVE_COLUMNS,
    sort: validSort(sort)
      ? { column: sort.column, direction: sort.direction }
      : { column: 'title', direction: 'asc' },
    filters: Array.isArray(value.filters)
      ? value.filters
          .filter(filter)
          .map(({ column, operator, value }) => ({ column, operator, value }))
      : [],
    ...(group ? { group } : {}),
    ...(density ? { density } : {}),
    ...(columnWidths ? { columnWidths } : {}),
  };
}

function keyID(key: string): string {
  return key.trim().normalize('NFC').toLowerCase();
}

function propertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && Object.hasOwn(propertyTypes, value);
}

function property(raw: unknown, validate: Validate): Property | undefined {
  if (!object(raw)) return undefined;
  const { key, type, options } = raw;
  if (
    typeof key !== 'string' ||
    !propertyType(type) ||
    (options !== undefined &&
      (!Array.isArray(options) || !options.every((option) => typeof option === 'string')))
  )
    return undefined;
  try {
    return validate({ key, type, options });
  } catch {
    return undefined;
  }
}

/** A malformed remote record must not be applied as a partial library configuration. */
export function decodeSyncSnapshot(value: unknown, validate: Validate) {
  if (
    !object(value) ||
    !Array.isArray(value.schema) ||
    !Array.isArray(value.views) ||
    !value.views.length
  )
    return undefined;
  const schema: Property[] = [];
  const keys = new Set<string>();
  for (const raw of value.schema) {
    const decoded = property(raw, validate);
    if (!decoded || keys.has(keyID(decoded.key))) return undefined;
    keys.add(keyID(decoded.key));
    schema.push(decoded);
  }
  const views: View[] = [];
  const ids = new Set<string>();
  for (const raw of value.views) {
    const decoded = view(raw, true);
    if (!decoded || ids.has(decoded.id)) return undefined;
    ids.add(decoded.id);
    views.push(decoded);
  }
  return { schema, views };
}

export function createConfig(
  prefs: Prefs,
  initialScope: () => string,
  validate: Validate,
  { initializeDefault = true } = {},
) {
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
  if (initializeDefault && prefs.get(VIEWS_PREF, true) === undefined)
    prefs.set(VIEWS_PREF, JSON.stringify(views([], null)), true);

  function readProperties(): readonly Property[] {
    const rawSchema = parse(prefs.get(SCHEMA_PREF, true));
    const properties = new Map<string, Property>();
    if (Array.isArray(rawSchema)) {
      for (const raw of rawSchema) {
        const decoded = property(raw, validate);
        if (decoded) properties.set(keyID(decoded.key), decoded);
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
    applySync(snapshot: {
      readonly schema: readonly Property[];
      readonly views: readonly View[];
    }): void {
      const saved = parse(prefs.get(VIEWS_PREF, true));
      prefs.set(SCHEMA_PREF, JSON.stringify(snapshot.schema), true);
      prefs.set(
        VIEWS_PREF,
        JSON.stringify(views(snapshot.views, object(saved) ? saved.active : undefined)),
        true,
      );
    },
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
