import { describe, expect, it } from 'vitest';
import type { Property, Row } from '../src/contracts';
import { groupRows } from '../src/grouping';

const base: Omit<Row, 'id'> = {
  writable: true,
  title: '',
  creators: '',
  year: '',
  source: '',
  type: '',
  tags: [],
  pdf: false,
  added: '',
  extra: '',
};
const properties: readonly Property[] = [
  { key: 'Status', type: 'single-select', options: ['Done', 'Reading'] },
  { key: 'Reviewed', type: 'checkbox' },
  { key: 'Memo', type: 'text' },
];
const tags = new Set(['reading', 'elsewhere']);

function row(id: number, fields: Partial<Omit<Row, 'id'>>): Row {
  return { ...base, id, ...fields };
}

describe('groupRows', () => {
  it('sorts buckets while preserving the incoming item order and puts missing values last', () => {
    const rows = [
      row(4, { year: '2024', type: 'Book' }),
      row(2, {}),
      row(3, { year: '2022', type: 'Article' }),
      row(1, { year: '2024', type: 'Book' }),
    ];
    const asc = groupRows(rows, { column: 'year', direction: 'asc' }, properties, tags, 'en');
    expect(asc).toEqual([
      { value: '2022', rows: [rows[2]] },
      { value: '2024', rows: [rows[0], rows[3]] },
      { value: null, rows: [rows[1]] },
    ]);
    const desc = groupRows(rows, { column: 'year', direction: 'desc' }, properties, tags, 'en');
    expect(desc?.map(({ value }) => value)).toEqual(['2024', '2022', null]);
    const types = groupRows(rows, { column: 'type', direction: 'asc' }, properties, tags, 'en');
    expect(types?.map(({ value }) => value)).toEqual(['Article', 'Book', null]);
  });

  it('uses schema-aware select and checkbox values', () => {
    const rows = [
      row(1, { extra: 'Status: Reading\nReviewed: true' }),
      row(2, { extra: 'Status: Done' }),
      row(3, {}),
    ];
    const status = groupRows(
      rows,
      { column: 'property:Status', direction: 'asc' },
      properties,
      tags,
      'en',
    );
    expect(status?.map(({ value }) => value)).toEqual(['Done', 'Reading', null]);
    const reviewed = groupRows(
      rows,
      { column: 'property:Reviewed', direction: 'desc' },
      properties,
      tags,
      'en',
    );
    expect(reviewed).toEqual([
      { value: true, rows: [rows[0]] },
      { value: false, rows: rows.slice(1) },
    ]);
  });

  it('partitions exact presence of one catalog tag and rejects unavailable dependencies', () => {
    const rows = [row(1, { tags: ['other', 'reading'] }), row(2, { tags: ['Reading'] })];
    const tagged = groupRows(
      rows,
      { column: 'tags', tag: 'reading', direction: 'asc' },
      properties,
      tags,
      'en',
    );
    expect(tagged).toEqual([
      { value: false, rows: [rows[1]] },
      { value: true, rows: [rows[0]] },
    ]);
    expect(
      groupRows(
        rows,
        { column: 'tags', tag: 'elsewhere', direction: 'asc' },
        properties,
        tags,
        'en',
      ),
    ).toEqual([{ value: false, rows }]);
    expect(
      groupRows(rows, { column: 'tags', tag: 'removed', direction: 'asc' }, properties, tags, 'en'),
    ).toBeUndefined();
    expect(
      groupRows(rows, { column: 'property:Memo', direction: 'asc' }, properties, tags, 'en'),
    ).toBeUndefined();
    expect(
      groupRows(rows, { column: 'property:Removed', direction: 'asc' }, properties, tags, 'en'),
    ).toBeUndefined();
  });
});
