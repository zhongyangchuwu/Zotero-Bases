import {
  isNativeColumn,
  NATIVE_COLUMN_BY_KEY,
  NATIVE_COLUMN_DEFINITIONS,
  type Catalog,
  type Column,
  type Filter,
  type NativeColumn,
  type NativeValueType,
  type Operator,
  type Property,
  type PropertyType,
  type PropertyValue,
  type Row,
  type View,
} from './contracts';
import { isDecimal, readProperty } from './extra';
import { isGregorianDay, isISODate, isRating } from './property-values';

type Kind = PropertyType | 'multi' | 'native-date';
type ValueSource = NativeColumn | Property;

interface ColumnInfo {
  readonly kind: Kind;
  readonly source: ValueSource;
  readonly operators: readonly Operator[];
}

export interface QueryResult {
  readonly rows: readonly Row[];
  readonly invalid: readonly number[];
}

const DATE_OPERATORS: readonly Operator[] = ['equals', 'before', 'after', 'has', 'missing'];
const OPERATORS: Readonly<Record<Kind, readonly Operator[]>> = {
  text: ['contains', 'equals', 'has', 'missing'],
  number: ['equals', 'gte', 'lte', 'has', 'missing'],
  rating: ['equals', 'notEquals', 'gte', 'lte', 'has', 'missing'],
  url: ['contains', 'notContains', 'has', 'missing'],
  checkbox: ['equals', 'has', 'missing'],
  'single-select': ['equals', 'has', 'missing'],
  'multi-select': ['contains', 'has', 'missing'],
  multi: ['contains', 'notContains', 'has', 'missing'],
  date: DATE_OPERATORS,
  'native-date': DATE_OPERATORS,
};
const NATIVE_NUMERIC_OPERATORS: readonly Operator[] = [
  'equals',
  'notEquals',
  'gt',
  'gte',
  'lt',
  'lte',
  'has',
  'missing',
];
const NATIVE_KINDS: Readonly<Record<NativeValueType, Kind>> = {
  text: 'text',
  number: 'number',
  date: 'native-date',
  link: 'text',
  multi: 'multi',
  boolean: 'checkbox',
};

function propertyIn(column: Column, properties: readonly Property[]): Property | undefined {
  if (!column.startsWith('property:')) return undefined;
  const key = column.slice('property:'.length);
  return properties.find((property) => property.key === key);
}

function columnInfo(column: Column, properties: readonly Property[]): ColumnInfo | undefined {
  if (isNativeColumn(column)) {
    const kind = NATIVE_KINDS[NATIVE_COLUMN_BY_KEY[column].valueType];
    const operators = kind === 'number' ? NATIVE_NUMERIC_OPERATORS : OPERATORS[kind];
    return { kind, source: column, operators };
  }
  const property = propertyIn(column, properties);
  return property && { kind: property.type, source: property, operators: OPERATORS[property.type] };
}

function valueIn(row: Row, source: ValueSource | undefined): PropertyValue {
  if (typeof source === 'string') return row[source] ?? null;
  return source ? readProperty(row.extra, source) : null;
}

export function cellValue(
  row: Row,
  column: Column,
  properties: readonly Property[],
): PropertyValue {
  return valueIn(row, isNativeColumn(column) ? column : propertyIn(column, properties));
}

export function filterOperators(
  column: Column,
  properties: readonly Property[],
): readonly Operator[] {
  return columnInfo(column, properties)?.operators ?? [];
}

interface Decimal {
  readonly sign: -1 | 0 | 1;
  readonly position: bigint;
  readonly digits: string;
}

function decimal(value: string): Decimal | null {
  if (!isDecimal(value)) return null;
  const [coefficient = '', exponent = '0'] = value.split(/[eE]/);
  const unsigned = coefficient.replace(/^[+-]/, '');
  const point = unsigned.indexOf('.');
  const allDigits = unsigned.replace('.', '');
  const significant = allDigits.replace(/^0+/, '');
  if (!significant) return { sign: 0, position: 0n, digits: '' };
  // Magnitude orders by decimal position, then significant digits, without rounding.
  const position = (point < 0 ? unsigned.length : point) - (allDigits.length - significant.length);
  return {
    sign: coefficient.startsWith('-') ? -1 : 1,
    position: BigInt(position) + BigInt(exponent),
    digits: significant.replace(/0+$/, ''),
  };
}

function compareDecimal(left: Decimal, right: Decimal): number {
  if (left.sign !== right.sign) return left.sign - right.sign;
  if (left.position !== right.position)
    return left.position < right.position ? -left.sign : left.sign;
  if (left.digits === right.digits) return 0;
  return left.digits < right.digits ? -left.sign : left.sign;
}

const DATE_PARTS = /^(\d{4})-(\d{2})(?:-(\d{2})(.*))?$/;
const DATE_TIME =
  /^[ T]((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?)(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/i;
const SQL_TIME_PREFIX = /^ +\d{1,2}:/;

/** Normalize sortable Zotero/ISO dates without inferring a day for partial dates. */
function normalizeDate(value: string, precision: 'month' | 'day' | 'instant'): string | undefined {
  const text = value.trim();
  const parts = DATE_PARTS.exec(text);
  if (!parts) return undefined;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  if (!year || month < 1 || month > 12) return undefined;

  // A multipart date is a sortable prefix, then a space and the user's original text.
  // A malformed SQL time is not a multipart date.
  const suffix = parts[4] ?? '';
  const time = suffix ? DATE_TIME.exec(suffix) : null;
  if (suffix && !time && (!suffix.startsWith(' ') || SQL_TIME_PREFIX.test(suffix)))
    return undefined;

  const day = Number(parts[3] ?? '00');
  if (!day) return precision === 'month' && !time ? text.slice(0, 7) : undefined;
  if (!isGregorianDay(year, month, day)) return undefined;
  if (precision === 'month') return text.slice(0, 7);
  const calendarDay = text.slice(0, 10);
  // Zotero SQL times have no explicit offset; compare them as UTC, not machine-local time.
  return precision === 'instant' && time
    ? `${calendarDay}T${time[1]}${time[2]?.toUpperCase() ?? 'Z'}`
    : calendarDay;
}

/** Day in the original calendar, even when a timestamp's offset crosses midnight in UTC. */
export function dateDay(value: string): string | undefined {
  return normalizeDate(value, 'day');
}

/** An explicit year and month are sufficient for month grouping, but not day comparison. */
export function dateMonth(value: string): string | undefined {
  return normalizeDate(value, 'month');
}

function compileFilter(
  { operator, value }: Filter,
  info: ColumnInfo,
  catalog: Catalog,
  locale: string,
): ((value: PropertyValue) => boolean) | undefined {
  if (!info.operators.includes(operator)) return undefined;
  if (operator === 'has' || operator === 'missing') {
    if (value !== '') return undefined;
    return (actual) => {
      const present = !!actual && (!Array.isArray(actual) || actual.length > 0);
      return operator === 'has' ? present : !present;
    };
  }
  switch (info.kind) {
    case 'checkbox':
      if (value !== 'true' && value !== 'false') return undefined;
      return (actual) => actual === (value === 'true');
    case 'date':
    case 'native-date': {
      const custom = info.kind === 'date';
      if (custom ? !isISODate(value) : dateDay(value) !== value) return undefined;
      return (actual) => {
        if (typeof actual !== 'string') return false;
        const day = custom ? actual : dateDay(actual);
        return (
          day !== undefined &&
          (operator === 'equals'
            ? day === value
            : operator === 'before'
              ? day < value
              : day > value)
        );
      };
    }
    case 'rating': {
      if (!isRating(value)) return undefined;
      const target = Number(value);
      return (actual) => {
        if (typeof actual !== 'string') return false;
        const rating = Number(actual);
        switch (operator) {
          case 'equals':
            return rating === target;
          case 'notEquals':
            return rating !== target;
          case 'gte':
            return rating >= target;
          case 'lte':
            return rating <= target;
        }
        return false;
      };
    }
    case 'number': {
      const target = decimal(value.trim());
      if (target === null) return undefined;
      return (actual) => {
        const number = typeof actual === 'string' ? decimal(actual) : null;
        if (number === null) return false;
        const order = compareDecimal(number, target);
        switch (operator) {
          case 'equals':
            return order === 0;
          case 'notEquals':
            return order !== 0;
          case 'gt':
            return order > 0;
          case 'gte':
            return order >= 0;
          case 'lt':
            return order < 0;
          case 'lte':
            return order <= 0;
        }
        return false;
      };
    }
    case 'url':
    case 'text': {
      const target = value.trim().normalize('NFC').toLocaleLowerCase(locale);
      if (!target) return undefined;
      return (actual) => {
        if (typeof actual !== 'string') return false;
        const text = actual.normalize('NFC').toLocaleLowerCase(locale);
        if (operator === 'equals') return text === target;
        return text.includes(target) === (operator === 'contains');
      };
    }
    case 'single-select':
    case 'multi-select': {
      const target = value.trim().normalize('NFC');
      const options = typeof info.source === 'string' ? undefined : info.source.options;
      if (!options?.includes(target)) return undefined;
      return (actual) => actual === target || (Array.isArray(actual) && actual.includes(target));
    }
    case 'multi': {
      const members = info.source === 'tags' ? catalog.tags : catalog.collections;
      if (!value || !members?.has(value)) return undefined;
      return (actual) =>
        (Array.isArray(actual) && actual.includes(value)) === (operator === 'contains');
    }
  }
}

type SortKey = Decimal | string | number | boolean | null;

function sortKey(value: PropertyValue, kind: Kind): SortKey {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value.length ? value.join('; ') : null;
  if (!value) return null;
  if (kind === 'number') return decimal(value);
  if (kind === 'rating') return Number(value);
  if (kind === 'date' || kind === 'native-date') {
    const normalized = kind === 'date' ? value : normalizeDate(value, 'instant');
    if (!normalized) return null;
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return value;
}

function compareSortKeys(
  left: SortKey,
  right: SortKey,
  direction: number,
  compareText: (left: string, right: string) => number,
): number {
  // Missing values stay last; two missing values still allow the next rule to break the tie.
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  if (typeof left === 'string' && typeof right === 'string')
    return direction * compareText(left, right);
  if (typeof left === 'number' && typeof right === 'number') return direction * (left - right);
  if (typeof left === 'boolean' && typeof right === 'boolean')
    return direction * (Number(left) - Number(right));
  if (typeof left === 'object' && typeof right === 'object')
    return direction * compareDecimal(left, right);
  return 0;
}

function compileSearch(
  search: string,
  view: View,
  properties: readonly Property[],
  locale: string,
): ((row: Row) => boolean) | undefined {
  const text = search.trim().normalize('NFC').toLocaleLowerCase(locale);
  if (!text) return undefined;
  const terms = [...new Set(text.split(/\s+/))];
  const matched = terms.map(() => false);
  const searchable = new Set<Column>();
  for (const { key, search } of NATIVE_COLUMN_DEFINITIONS) if (search) searchable.add(key);
  for (const column of view.columns) searchable.add(column);
  const sources: ValueSource[] = [];
  for (const column of searchable) {
    const source = isNativeColumn(column) ? column : propertyIn(column, properties);
    if (source) sources.push(source);
  }
  for (const property of properties) {
    if (property.type === 'url' && !searchable.has(`property:${property.key}`))
      sources.push(property);
  }
  const chinese = locale.toLowerCase().startsWith('zh');
  let remaining = 0;
  const matchText = (value: string): void => {
    if (!value || !remaining) return;
    const folded = value.normalize('NFC').toLocaleLowerCase(locale);
    for (let index = 0; index < terms.length; index++) {
      if (!matched[index] && folded.includes(terms[index]!)) {
        matched[index] = true;
        remaining--;
      }
    }
  };
  const matchValue = (value: PropertyValue): void => {
    if (typeof value === 'string') matchText(value);
    else if (typeof value === 'boolean') {
      matchText(value ? 'true' : 'false');
      matchText(chinese ? (value ? '是' : '否') : value ? 'yes' : 'no');
    } else if (value) {
      for (const item of value) {
        matchText(item);
        if (!remaining) break;
      }
    }
  };
  return (row) => {
    matched.fill(false);
    remaining = terms.length;
    for (const source of sources) {
      matchValue(valueIn(row, source));
      if (!remaining) return true;
    }
    return false;
  };
}

export function queryCatalog(
  catalog: Catalog,
  view: View,
  properties: readonly Property[],
  locale: string,
  search = '',
): QueryResult {
  const invalid: number[] = [];
  const checks: ((row: Row) => boolean)[] = [];
  for (const [index, filter] of view.filters.entries()) {
    const info = columnInfo(filter.column, properties);
    const matches = info && compileFilter(filter, info, catalog, locale);
    if (info && matches) checks.push((row) => matches(valueIn(row, info.source)));
    else invalid.push(index);
  }

  const matchesSearch = compileSearch(search, view, properties, locale);
  const rows =
    checks.length || matchesSearch
      ? catalog.rows.filter(
          (row) => checks.every((check) => check(row)) && (!matchesSearch || matchesSearch(row)),
        )
      : catalog.rows;
  if (rows.length < 2 || !view.sorts.length) return { rows, invalid };

  // Read and normalize each key once per row, outside the comparator.
  const sorts = view.sorts.flatMap(({ column, direction }) => {
    const info = columnInfo(column, properties);
    if (!info) return [];
    return [
      {
        direction: direction === 'desc' ? -1 : 1,
        keys: rows.map((row) => sortKey(valueIn(row, info.source), info.kind)),
      },
    ];
  });
  if (!sorts.length) return { rows, invalid };

  const compareText = new Intl.Collator(locale, { sensitivity: 'base', numeric: true }).compare;
  const order = rows.map((_, index) => index);
  order.sort((left, right) => {
    for (let index = 0; index < sorts.length; index++) {
      const { keys, direction } = sorts[index]!;
      const compared = compareSortKeys(keys[left]!, keys[right]!, direction, compareText);
      if (compared) return compared;
    }
    // Array sort is stable when all keys tie.
    return 0;
  });
  return { rows: order.map((index) => rows[index]!), invalid };
}
