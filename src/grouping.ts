import type { Grouping, Property, Row } from './contracts';
import { readProperty } from './extra';

type GroupValue = string | boolean | null;

export interface RowGroup {
  readonly value: GroupValue;
  readonly rows: readonly Row[];
}

export function isGroupProperty({ type }: Property): boolean {
  return type === 'single-select' || type === 'checkbox';
}

/** Partition already filtered and sorted rows, or return undefined for an unavailable dependency. */
export function groupRows(
  rows: readonly Row[],
  group: Grouping,
  properties: readonly Property[],
  tags: ReadonlySet<string>,
  locale: string,
): RowGroup[] | undefined {
  let key: (row: Row) => GroupValue;
  if (group.column === 'tags') {
    const { tag } = group;
    if (!tags.has(tag)) return undefined;
    key = (row) => row.tags.includes(tag);
  } else if (group.column === 'year' || group.column === 'type') {
    const { column } = group;
    key = (row) => row[column] || null;
  } else {
    const name = group.column.slice('property:'.length);
    const property = properties.find(({ key }) => key === name);
    if (!property || !isGroupProperty(property)) return undefined;
    key = (row) => {
      const value = readProperty(row.extra, property);
      return typeof value === 'string' || typeof value === 'boolean' ? value : null;
    };
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
