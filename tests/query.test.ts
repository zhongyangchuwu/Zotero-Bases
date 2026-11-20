import { describe, expect, it } from 'vitest';
import type { Catalog, Column, Filter, Property, Row, View } from '../src/contracts';
import { cellValue, filterOperators, queryCatalog } from '../src/query';

const properties: readonly Property[] = [
  { key: 'Memo', type: 'text' },
  { key: 'Confidence', type: 'number' },
  { key: 'Reviewed', type: 'checkbox' },
  { key: 'Status', type: 'single-select', options: ['Reading', 'Done'] },
  { key: 'Method', type: 'multi-select', options: ['Transformer', 'Diffusion'] },
];

function row(id: number, fields: Partial<Omit<Row, 'id'>> = {}): Row {
  return {
    id,
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
    ...fields,
  };
}

function view(
  filters: readonly Filter[] = [],
  column: Column = 'title',
  direction: 'asc' | 'desc' = 'asc',
): View {
  return {
    id: 'view',
    name: 'View',
    scope: 'current',
    columns: ['title'],
    sort: { column, direction },
    filters,
  };
}

const catalog: Catalog = {
  rows: [
    row(1, {
      title: 'Cafe\u0301 2',
      creators: 'L. Smith',
      year: '2024',
      source: 'Science',
      type: 'journalArticle',
      pdf: true,
      tags: ['survey'],
      added: '2024-02-29 13:00:00',
      extra:
        'Memo: Includes Equation 3\nConfidence: 0.010\nReviewed: true\nStatus: Reading\nMethod: Transformer; Diffusion',
    }),
    row(2, {
      title: 'Café 10',
      year: '2020',
      tags: ['survey'],
      added: '2024-02-29 01:00:00',
      extra: 'Confidence: 0.1\nStatus: Done\nMethod: Diffusion',
    }),
    row(3, {
      title: 'Café 3',
      year: '2019',
      pdf: true,
      tags: ['article'],
      added: '2024-03-01 00:00:00',
      extra: 'Status: Reading\nMethod: Retired',
    }),
  ],
  tags: new Set(['survey', 'article', 'elsewhere']),
};

describe('cells and filter forms', () => {
  it('reads native cells and typed Extra cells without exposing orphan columns', () => {
    const record = row(37, {
      creators: 'L. Smith',
      tags: ['survey'],
      pdf: true,
      extra: 'Memo: first: review\nConfidence: +.500\nStatus: Reading\nMethod: Diffusion; Retired',
    });
    expect(cellValue(record, 'creators', properties)).toBe('L. Smith');
    expect(cellValue(record, 'tags', properties)).toEqual(['survey']);
    expect(cellValue(record, 'pdf', properties)).toBe(true);
    expect(cellValue(record, 'property:Memo', properties)).toBe('first: review');
    expect(cellValue(record, 'property:Confidence', properties)).toBe('+.500');
    expect(cellValue(record, 'property:Reviewed', properties)).toBe(false);
    expect(cellValue(record, 'property:Status', properties)).toBe('Reading');
    expect(cellValue(record, 'property:Method', properties)).toEqual(['Diffusion', 'Retired']);
    expect(cellValue(record, 'property:Removed', properties)).toBeNull();
  });

  it('provides the operators supported by each field kind', () => {
    expect(filterOperators('title', properties)).toEqual(['contains', 'equals', 'has', 'missing']);
    expect(filterOperators('property:Memo', properties)).toEqual(
      filterOperators('title', properties),
    );
    expect(filterOperators('year', properties)).toEqual(['equals', 'gte', 'lte', 'has', 'missing']);
    expect(filterOperators('property:Confidence', properties)).toEqual(
      filterOperators('year', properties),
    );
    expect(filterOperators('property:Status', properties)).toEqual(['equals', 'has', 'missing']);
    expect(filterOperators('property:Reviewed', properties)).toEqual(
      filterOperators('pdf', properties),
    );
    expect(filterOperators('tags', properties)).toEqual(['contains', 'has', 'missing']);
    expect(filterOperators('property:Method', properties)).toEqual(
      filterOperators('tags', properties),
    );
    expect(filterOperators('added', properties)).toEqual([
      'equals',
      'before',
      'after',
      'has',
      'missing',
    ]);
    expect(filterOperators('property:Removed', properties)).toEqual([]);
  });
});

describe('catalog filtering', () => {
  it('reports only invalid rules while AND-ing valid rules, including hidden columns', () => {
    const result = queryCatalog(
      catalog,
      view([
        { column: 'property:Status', operator: 'equals', value: 'Reading' },
        { column: 'property:Removed', operator: 'has', value: '' },
        { column: 'tags', operator: 'contains', value: 'removed-tag' },
        { column: 'property:Status', operator: 'equals', value: 'Removed' },
        { column: 'property:Method', operator: 'contains', value: 'Retired' },
        { column: 'property:Confidence', operator: 'contains', value: '0.01' },
        { column: 'property:Confidence', operator: 'gte', value: 'NaN' },
        { column: 'pdf', operator: 'equals', value: 'yes' },
        { column: 'title', operator: 'has', value: 'incompatible operand' },
        { column: 'tags', operator: 'contains', value: 'survey' },
      ]),
      properties,
      'en-US',
    );
    expect(result.invalid).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.rows.map(({ id }) => id)).toEqual([1]);
  });

  it('does not confuse a valid no-match rule with an invalid rule', () => {
    const noMatch: readonly Filter[] = [
      { column: 'tags', operator: 'contains', value: 'elsewhere' },
      { column: 'title', operator: 'equals', value: 'absent title' },
      { column: 'year', operator: 'gte', value: '3000' },
    ];
    for (const rule of noMatch) {
      expect(queryCatalog(catalog, view([rule]), properties, 'en-US')).toEqual({
        rows: [],
        invalid: [],
      });
    }
    const removed = queryCatalog(
      { rows: [], tags: new Set(['elsewhere']) },
      view([{ column: 'tags', operator: 'contains', value: 'Elsewhere' }]),
      properties,
      'en-US',
    );
    expect(removed).toEqual({ rows: [], invalid: [0] });
  });

  it('matches text with canonical and case equivalence and option labels exactly', () => {
    const result = queryCatalog(
      catalog,
      view([
        { column: 'title', operator: 'contains', value: 'CAFÉ' },
        { column: 'property:Memo', operator: 'contains', value: 'equation 3' },
        { column: 'property:Method', operator: 'contains', value: 'Diffusion' },
        { column: 'property:Status', operator: 'equals', value: 'reading' },
      ]),
      properties,
      'en-US',
    );
    expect(result.rows.map(({ id }) => id)).toEqual([1]);
    expect(result.invalid).toEqual([3]);
  });

  it('treats unchecked flags and empty cells as missing', () => {
    const unchecked = view([
      { column: 'property:Reviewed', operator: 'equals', value: 'false' },
      { column: 'pdf', operator: 'missing', value: '' },
      { column: 'property:Memo', operator: 'missing', value: '' },
    ]);
    expect(queryCatalog(catalog, unchecked, properties, 'en-US').rows.map(({ id }) => id)).toEqual([
      2,
    ]);
    const checked = view([
      { column: 'property:Reviewed', operator: 'has', value: '' },
      { column: 'pdf', operator: 'equals', value: 'true' },
    ]);
    expect(queryCatalog(catalog, checked, properties, 'en-US').rows.map(({ id }) => id)).toEqual([
      1,
    ]);
  });

  it('compares dates by calendar day, ignoring an impossible date rule', () => {
    const sameDay = queryCatalog(
      catalog,
      view(
        [
          { column: 'added', operator: 'equals', value: '2024-02-29' },
          { column: 'added', operator: 'before', value: '2023-02-29' },
          { column: 'added', operator: 'before', value: '2024-03-01' },
        ],
        'added',
      ),
      properties,
      'en-US',
    );
    expect(sameDay.invalid).toEqual([1]);
    expect(sameDay.rows.map(({ id }) => id)).toEqual([2, 1]);
    const after = view([{ column: 'added', operator: 'after', value: '2024-02-29' }]);
    expect(queryCatalog(catalog, after, properties, 'en-US').rows.map(({ id }) => id)).toEqual([3]);
  });

  it('compares decimal filters exactly, including beyond safe integer precision', () => {
    const numbers: Catalog = {
      rows: [
        row(1, { extra: 'Confidence: 9007199254740992' }),
        row(2, { extra: 'Confidence: 9007199254740993.000' }),
        row(3, { extra: 'Confidence: 9007199254740994e0' }),
      ],
      tags: new Set(),
    };
    const equal = view([
      { column: 'property:Confidence', operator: 'equals', value: '9.007199254740993e+15' },
    ]);
    expect(queryCatalog(numbers, equal, properties, 'en-US').rows.map(({ id }) => id)).toEqual([2]);
    const between = view([
      { column: 'property:Confidence', operator: 'gte', value: '9007199254740992.1' },
      { column: 'property:Confidence', operator: 'lte', value: '9007199254740993.0' },
    ]);
    expect(queryCatalog(numbers, between, properties, 'en-US').rows.map(({ id }) => id)).toEqual([
      2,
    ]);
  });
});

describe('catalog sorting', () => {
  it('uses locale and natural text order, with stable ties and no input mutation', () => {
    const titles: Catalog = {
      rows: [
        row(1, { title: 'Äpple' }),
        row(2, { title: 'Zebra 10' }),
        row(3, { title: 'zebra 2' }),
        row(4, { title: 'Zebra 2' }),
        row(5, { title: 'Apple' }),
      ],
      tags: new Set(),
    };
    expect(queryCatalog(titles, view(), properties, 'sv').rows.map(({ id }) => id)).toEqual([
      5, 3, 4, 2, 1,
    ]);
    expect(titles.rows.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5]);
    expect(queryCatalog(titles, view([], 'property:Removed'), properties, 'sv').rows).toEqual(
      titles.rows,
    );
  });

  it('sorts numeric cells exactly in both directions while keeping blanks last', () => {
    const numbers: Catalog = {
      rows: [
        row(1),
        row(2, { extra: 'Confidence: 9007199254740993' }),
        row(3, { extra: 'Confidence: -0.01' }),
        row(4, { extra: 'Confidence: 9007199254740992' }),
        row(5, { extra: 'Confidence: -0' }),
        row(6, { extra: 'Confidence: 1e-400' }),
        row(7, { extra: 'Confidence: malformed' }),
        row(8, { extra: 'Confidence: 10' }),
        row(9, { extra: 'Confidence: 2' }),
        row(10, { extra: 'Confidence: 4.50' }),
      ],
      tags: new Set(),
    };
    const ascending = queryCatalog(numbers, view([], 'property:Confidence'), properties, 'en-US');
    const descending = queryCatalog(
      numbers,
      view([], 'property:Confidence', 'desc'),
      properties,
      'en-US',
    );
    expect(ascending.rows.map(({ id }) => id)).toEqual([3, 5, 6, 9, 10, 8, 4, 2, 1, 7]);
    expect(descending.rows.map(({ id }) => id)).toEqual([2, 4, 8, 10, 9, 6, 5, 3, 1, 7]);
  });
});
