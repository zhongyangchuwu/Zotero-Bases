import type {
  Catalog,
  Column,
  Filter,
  Operator,
  Property,
  PropertyType,
  PropertyValue,
  Row,
  View,
} from './contracts';
import { isDecimal, readProperty } from './extra';

type Kind = PropertyType | 'tags' | 'date';

interface ColumnInfo {
  readonly kind: Kind;
  readonly property?: Property;
}

export interface QueryResult {
  readonly rows: readonly Row[];
  readonly invalid: readonly number[];
}

const OPERATORS: Readonly<Record<Kind, readonly Operator[]>> = {
  text: ['contains', 'equals', 'has', 'missing'],
  number: ['equals', 'gte', 'lte', 'has', 'missing'],
  checkbox: ['equals', 'has', 'missing'],
  'single-select': ['equals', 'has', 'missing'],
  'multi-select': ['contains', 'has', 'missing'],
  tags: ['contains', 'has', 'missing'],
  date: ['equals', 'before', 'after', 'has', 'missing'],
};

function propertyIn(column: Column, properties: readonly Property[]): Property | undefined {
  if (!column.startsWith('property:')) return undefined;
  const key = column.slice('property:'.length);
  return properties.find((property) => property.key === key);
}

function columnInfo(column: Column, properties: readonly Property[]): ColumnInfo | undefined {
  switch (column) {
    case 'title':
    case 'creators':
    case 'source':
    case 'type':
      return { kind: 'text' };
    case 'year':
      return { kind: 'number' };
    case 'added':
      return { kind: 'date' };
    case 'pdf':
      return { kind: 'checkbox' };
    case 'tags':
      return { kind: 'tags' };
    default: {
      const property = propertyIn(column, properties);
      return property ? { kind: property.type, property } : undefined;
    }
  }
}

function valueIn(row: Row, column: Column, property: Property | undefined): PropertyValue {
  switch (column) {
    case 'title':
    case 'creators':
    case 'year':
    case 'source':
    case 'type':
    case 'tags':
    case 'pdf':
    case 'added':
      return row[column];
    default:
      return property ? readProperty(row.extra, property) : null;
  }
}

export function cellValue(
  row: Row,
  column: Column,
  properties: readonly Property[],
): PropertyValue {
  return valueIn(row, column, propertyIn(column, properties));
}

export function filterOperators(
  column: Column,
  properties: readonly Property[],
): readonly Operator[] {
  const info = columnInfo(column, properties);
  return info ? OPERATORS[info.kind] : [];
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

function isCalendarDay(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  if (year === 0 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= (month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31);
}

function compileFilter(
  filter: Filter,
  info: ColumnInfo | undefined,
  tags: ReadonlySet<string>,
  locale: string,
): ((value: PropertyValue) => boolean) | undefined {
  const { operator, value } = filter;
  if (!info || !OPERATORS[info.kind].includes(operator)) return undefined;
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
      if (!isCalendarDay(value)) return undefined;
      return (actual) => {
        if (typeof actual !== 'string') return false;
        const day = actual.slice(0, 10);
        return (
          isCalendarDay(day) &&
          (operator === 'equals'
            ? day === value
            : operator === 'before'
              ? day < value
              : day > value)
        );
      };
    case 'number': {
      const target = decimal(value.trim());
      if (target === null) return undefined;
      return (actual) => {
        const number = typeof actual === 'string' ? decimal(actual) : null;
        if (number === null) return false;
        const order = compareDecimal(number, target);
        return operator === 'equals' ? order === 0 : operator === 'gte' ? order >= 0 : order <= 0;
      };
    }
    case 'text': {
      const target = value.trim().normalize('NFC').toLocaleLowerCase(locale);
      if (!target) return undefined;
      return (actual) => {
        if (typeof actual !== 'string') return false;
        const text = actual.normalize('NFC').toLocaleLowerCase(locale);
        return operator === 'contains' ? text.includes(target) : text === target;
      };
    }
    case 'single-select':
    case 'multi-select': {
      const target = value.trim().normalize('NFC');
      if (!info.property?.options?.includes(target)) return undefined;
      return (actual) => actual === target || (Array.isArray(actual) && actual.includes(target));
    }
    case 'tags':
      if (!tags.has(value)) return undefined;
      return (actual) => Array.isArray(actual) && actual.includes(value);
  }
}

type SortKey = Decimal | string | boolean | null;

function sortKey(value: PropertyValue, kind: Kind): SortKey {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value.length ? value.join('; ') : null;
  if (!value) return null;
  if (kind === 'number') return decimal(value);
  if (kind === 'date' && !isCalendarDay(value.slice(0, 10))) return null;
  return value;
}

function compileSearch(
  search: string,
  view: View,
  properties: readonly Property[],
  locale: string,
): ((row: Row) => boolean) | undefined {
  const text = search.trim().normalize('NFC').toLocaleLowerCase(locale);
  if (!text) return undefined;
  const terms = text.split(/\s+/);
  const matched = terms.map(() => false);
  const visibleProperties: Property[] = [];
  for (const column of view.columns) {
    const property = propertyIn(column, properties);
    if (property) visibleProperties.push(property);
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
      for (const item of value) matchText(item);
    }
  };
  return (row) => {
    matched.fill(false);
    remaining = terms.length;
    matchText(row.title);
    matchText(row.creators);
    matchText(row.source);
    matchText(row.year);
    for (const tag of row.tags) matchText(tag);
    for (const property of visibleProperties) {
      if (!remaining) break;
      matchValue(readProperty(row.extra, property));
    }
    return remaining === 0;
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
    const matches = compileFilter(filter, info, catalog.tags, locale);
    if (matches) checks.push((row) => matches(valueIn(row, filter.column, info?.property)));
    else invalid.push(index);
  }

  const matchesSearch = compileSearch(search, view, properties, locale);
  const rows =
    checks.length || matchesSearch
      ? catalog.rows.filter(
          (row) => checks.every((check) => check(row)) && (!matchesSearch || matchesSearch(row)),
        )
      : catalog.rows;
  const sort = columnInfo(view.sort.column, properties);
  if (!sort || rows.length < 2) return { rows, invalid };

  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const direction = view.sort.direction === 'desc' ? -1 : 1;
  const sorted = rows.map((row) => ({
    row,
    key: sortKey(valueIn(row, view.sort.column, sort.property), sort.kind),
  }));
  sorted.sort(({ key: left }, { key: right }) => {
    // Blank values stay last in either direction, and equal keys keep catalog order.
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    if (typeof left === 'string' && typeof right === 'string') {
      const order =
        sort.kind === 'date'
          ? left < right
            ? -1
            : left > right
              ? 1
              : 0
          : collator.compare(left, right);
      return direction * order;
    }
    if (typeof left === 'boolean' && typeof right === 'boolean')
      return direction * (Number(left) - Number(right));
    if (typeof left === 'object' && typeof right === 'object')
      return direction * compareDecimal(left, right);
    return 0;
  });
  return { rows: sorted.map(({ row }) => row), invalid };
}
