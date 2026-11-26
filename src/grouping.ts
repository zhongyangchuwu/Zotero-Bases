import {
  isNativeColumn,
  NATIVE_COLUMN_BY_KEY,
  type Grouping,
  type Property,
  type Row,
} from './contracts';
import { readProperty } from './extra';
import { dateMonth } from './query';

type GroupValue = string | boolean | null;

export interface RowGroup {
  readonly value: GroupValue;
  readonly rows: readonly Row[];
}

export function isGroupProperty({ type }: Property): boolean {
  return type === 'single-select' || type === 'checkbox' || type === 'rating' || type === 'date';
}

/** Partition already filtered and sorted rows, or return undefined for an unavailable dependency. */
export function groupRows(
  rows: readonly Row[],
  group: Grouping,
  properties: readonly Property[],
  tags: ReadonlySet<string>,
  locale: string,
  collections?: ReadonlySet<string>,
): RowGroup[] | undefined {
  let key: (row: Row) => GroupValue;
  const { column } = group;
  if (column === 'tags') {
    const { tag } = group;
    if (!tags.has(tag)) return undefined;
    key = (row) => row.tags.includes(tag);
  } else if (column === 'collections') {
    const { collection } = group;
    if (!collection || !collections?.has(collection)) return undefined;
    key = (row) => Array.isArray(row.collections) && row.collections.includes(collection);
  } else if (isNativeColumn(column)) {
    const { grouping } = NATIVE_COLUMN_BY_KEY[column];
    if (grouping === 'value') {
      key = (row) => {
        const value = row[column];
        return typeof value === 'string'
          ? value || null
          : typeof value === 'boolean'
            ? value
            : null;
      };
    } else if (grouping === 'month') {
      key = (row) => {
        const value = row[column];
        return typeof value === 'string' ? (dateMonth(value) ?? null) : null;
      };
    } else return undefined;
  } else {
    const name = column.slice('property:'.length);
    const property = properties.find(({ key }) => key === name);
    if (!property || !isGroupProperty(property)) return undefined;
    if (property.type === 'date') {
      key = (row) => {
        const value = readProperty(row.extra, property);
        return typeof value === 'string' ? value.slice(0, 7) : null;
      };
    } else {
      key = (row) => {
        const value = readProperty(row.extra, property);
        return typeof value === 'string' || typeof value === 'boolean' ? value : null;
      };
    }
  }

  const buckets = new Map<GroupValue, Row[]>();
  for (const row of rows) {
    const value = key(row);
    const bucket = buckets.get(value);
    if (bucket) bucket.push(row);
    else buckets.set(value, [row]);
  }
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const direction = group.direction === 'asc' ? 1 : -1;
  return Array.from(buckets, ([value, rows]) => ({ value, rows })).sort(
    ({ value: left }, { value: right }) => {
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return (
        direction *
        (typeof left === 'boolean'
          ? Number(left) - Number(right)
          : collator.compare(left, String(right)))
      );
    },
  );
}
