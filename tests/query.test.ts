import { describe, expect, it } from 'vitest';
import type { Catalog, Column, Filter, Property, Row, View } from '../src/contracts';
import { groupRows } from '../src/grouping';
import { cellValue, dateDay, filterOperators, queryCatalog } from '../src/query';

const properties: readonly Property[] = [
  { key: 'Memo', type: 'text' },
  { key: 'Confidence', type: 'number' },
  { key: 'Reviewed', type: 'checkbox' },
  { key: 'Status', type: 'single-select', options: ['Reading', 'Done'] },
  { key: 'Method', type: 'multi-select', options: ['Transformer', 'Diffusion'] },
  { key: 'Stars', type: 'rating' },
  { key: 'Project Link', type: 'url' },
  { key: 'Code Link', type: 'url' },
  { key: 'Read On', type: 'date' },
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
    sorts: [{ column, direction }],
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
      citationKey: 'Smith2024',
      collections: ['Methods', 'Reading'],
      notesCount: '0',
      extra: 'Memo: first: review\nConfidence: +.500\nStatus: Reading\nMethod: Diffusion; Retired',
    });
    expect(cellValue(record, 'creators', properties)).toBe('L. Smith');
    expect(cellValue(record, 'tags', properties)).toEqual(['survey']);
    expect(cellValue(record, 'pdf', properties)).toBe(true);
    expect(cellValue(record, 'citationKey', properties)).toBe('Smith2024');
    expect(cellValue(record, 'collections', properties)).toEqual(['Methods', 'Reading']);
    expect(cellValue(record, 'notesCount', properties)).toBe('0');
    expect(cellValue(record, 'doi', properties)).toBeNull();
    expect(cellValue(record, 'property:Memo', properties)).toBe('first: review');
    expect(cellValue(record, 'property:Confidence', properties)).toBe('+.500');
    expect(cellValue(record, 'property:Reviewed', properties)).toBe(false);
    expect(cellValue(record, 'property:Status', properties)).toBe('Reading');
    expect(cellValue(record, 'property:Method', properties)).toEqual(['Diffusion', 'Retired']);
    expect(cellValue(record, 'property:Removed', properties)).toBeNull();
    const typed = row(38, {
      extra: 'Stars: 5\nProject Link: https://example.org/project\nRead On: 2024-02-29',
    });
    expect(cellValue(typed, 'property:Stars', properties)).toBe('5');
    expect(cellValue(typed, 'property:Project Link', properties)).toBe(
      'https://example.org/project',
    );
    expect(cellValue(typed, 'property:Read On', properties)).toBe('2024-02-29');
  });

  it('provides the operators supported by each field kind', () => {
    expect(filterOperators('title', properties)).toEqual(['contains', 'equals', 'has', 'missing']);
    expect(filterOperators('property:Memo', properties)).toEqual(
      filterOperators('title', properties),
    );
    const nativeNumbers = ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'has', 'missing'];
    for (const column of ['year', 'notesCount', 'attachmentsCount'] as const) {
      expect(filterOperators(column, properties)).toEqual(nativeNumbers);
    }
    expect(filterOperators('property:Confidence', properties)).toEqual([
      'equals',
      'gte',
      'lte',
      'has',
      'missing',
    ]);
    expect(filterOperators('property:Status', properties)).toEqual(['equals', 'has', 'missing']);
    expect(filterOperators('property:Reviewed', properties)).toEqual(
      filterOperators('pdf', properties),
    );
    for (const column of ['tags', 'collections'] as const) {
      expect(filterOperators(column, properties)).toEqual([
        'contains',
        'notContains',
        'has',
        'missing',
      ]);
    }
    expect(filterOperators('property:Method', properties)).toEqual(['contains', 'has', 'missing']);
    expect(filterOperators('doi', properties)).toEqual(filterOperators('title', properties));
    expect(filterOperators('url', properties)).toEqual(filterOperators('title', properties));
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

describe('rating, URL, and date queries', () => {
  const items: Catalog = {
    rows: [
      row(1, { extra: 'Stars: 5\nProject Link: https://z.example/Code\nRead On: 2024-03-01' }),
      row(2, { extra: 'Stars: 1\nProject Link: https://a.example/Home\nRead On: 2023-12-31' }),
      row(3, { extra: 'Stars: 03\nProject Link: javascript:void(0)\nRead On: 2024-02-30' }),
      row(4, { extra: 'Stars: 3\nRead On: 2024-02-29' }),
      row(5, { extra: 'Stars: 5\nRead On: 2024-01-31' }),
      row(6, { extra: 'Read On: 2024-02-29T00:00:00Z' }),
    ],
    tags: new Set(),
  };

  function checkFilters(
    column: Column,
    cases: readonly (readonly [Filter['operator'], string, readonly number[]])[],
  ) {
    expect(filterOperators(column, properties)).toEqual(cases.map(([operator]) => operator));
    for (const [operator, value, ids] of cases) {
      const result = queryCatalog(items, view([{ column, operator, value }]), properties, 'en');
      expect(result.invalid).toEqual([]);
      expect(result.rows.map(({ id }) => id)).toEqual(ids);
    }
  }

  it('validates rating filter operands and keeps malformed ratings out of comparisons', () => {
    const column = 'property:Stars';
    checkFilters(column, [
      ['equals', '5', [1, 5]],
      ['notEquals', '5', [2, 4]],
      ['gte', '3', [1, 4, 5]],
      ['lte', '3', [2, 4]],
      ['has', '', [1, 2, 4, 5]],
      ['missing', '', [3, 6]],
    ]);
    const invalid = view([
      { column, operator: 'equals', value: '05' },
      { column, operator: 'lte', value: '6' },
      { column, operator: 'lt', value: '3' },
    ]);
    expect(queryCatalog(items, invalid, properties, 'en').invalid).toEqual([0, 1, 2]);
  });

  it('matches URL text without treating missing or rejected URLs as text', () => {
    checkFilters('property:Project Link', [
      ['contains', 'code', [1]],
      ['notContains', 'CODE', [2]],
      ['has', '', [1, 2]],
      ['missing', '', [3, 4, 5, 6]],
    ]);
  });

  it('uses strict calendar days in comparisons, not native partial dates and timestamps', () => {
    const column = 'property:Read On';
    checkFilters(column, [
      ['equals', '2024-02-29', [4]],
      ['before', '2024-02-29', [2, 5]],
      ['after', '2024-02-29', [1]],
      ['has', '', [1, 2, 4, 5]],
      ['missing', '', [3, 6]],
    ]);
    const invalid = view([
      { column, operator: 'equals', value: '2024-02-30' },
      { column, operator: 'after', value: '2024-02' },
      { column, operator: 'before', value: '2024-02-29T00:00:00Z' },
    ]);
    expect(queryCatalog(items, invalid, properties, 'en').invalid).toEqual([0, 1, 2]);
  });

  it('orders rating numerically, date chronologically, and URL as text with missing last', () => {
    const sorted: View = {
      ...view([], 'property:Stars', 'desc'),
      sorts: [
        { column: 'property:Stars', direction: 'desc' },
        { column: 'property:Read On', direction: 'asc' },
      ],
    };
    const sortCases: readonly (readonly [View, readonly number[]])[] = [
      [sorted, [5, 1, 4, 2, 3, 6]],
      [view([], 'property:Read On', 'desc'), [1, 4, 5, 2, 3, 6]],
      [view([], 'property:Project Link'), [2, 1, 3, 4, 5, 6]],
      [view([], 'property:Project Link', 'desc'), [1, 2, 3, 4, 5, 6]],
    ];
    for (const [view, ids] of sortCases)
      expect(queryCatalog(items, view, properties, 'en').rows.map(({ id }) => id)).toEqual(ids);
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

  it('uses source calendar days and does not guess missing or impossible days', () => {
    const items: Catalog = {
      rows: [
        row(1, { date: '2024-02-29 February 29th, 2024' }),
        row(2, { date: '2024-02-29T23:59:00-02:00' }),
        row(3, { date: '2024-03-01 00:00:00' }),
        row(4, { date: '2024-02-00 February 2024' }),
        row(5, { date: '2024-02-30' }),
        row(6, { date: '2024-03-01 08:70:00' }),
        row(7, { date: '2024-02' }),
        row(8, { date: '02/29/2024' }),
        row(9),
      ],
      tags: new Set(),
    };
    for (const [operator, value, ids] of [
      ['equals', '2024-02-29', [1, 2]],
      ['before', '2024-03-01', [1, 2]],
      ['after', '2024-02-29', [3]],
      ['has', '', [1, 2, 3, 4, 5, 6, 7, 8]],
      ['missing', '', [9]],
    ] as const) {
      const result = queryCatalog(
        items,
        view([{ column: 'date', operator, value }]),
        properties,
        'en',
      );
      expect(result.invalid).toEqual([]);
      expect(result.rows.map(({ id }) => id)).toEqual(ids);
    }
    const invalid = view([
      { column: 'date', operator: 'equals', value: '2024-02' },
      { column: 'date', operator: 'before', value: '2024-02-29T00:00:00Z' },
    ]);
    expect(queryCatalog(items, invalid, properties, 'en').invalid).toEqual([0, 1]);
    expect(dateDay('2024-02-29T23:59:00-02:00')).toBe('2024-02-29');
    expect(dateDay('1900-02-29')).toBeUndefined();
    expect(dateDay('2000-02-29')).toBe('2000-02-29');
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

  it('compares native counts strictly and distinguishes zero from an unset cell', () => {
    const items: Catalog = {
      rows: [
        row(1, { notesCount: '0', attachmentsCount: '10' }),
        row(2, { notesCount: '2', attachmentsCount: '2' }),
        row(3, { notesCount: '10', attachmentsCount: '0' }),
        row(4),
      ],
      tags: new Set(),
    };
    for (const [operator, value, ids] of [
      ['equals', '0', [1]],
      ['notEquals', '2', [1, 3]],
      ['gt', '2', [3]],
      ['gte', '2', [2, 3]],
      ['lt', '2', [1]],
      ['lte', '2', [1, 2]],
      ['has', '', [1, 2, 3]],
      ['missing', '', [4]],
    ] as const) {
      const result = queryCatalog(
        items,
        view([{ column: 'notesCount', operator, value }]),
        properties,
        'en',
      );
      expect(result.invalid).toEqual([]);
      expect(result.rows.map(({ id }) => id)).toEqual(ids);
    }
    const result = queryCatalog(
      items,
      view([
        { column: 'attachmentsCount', operator: 'lte', value: '2' },
        { column: 'attachmentsCount', operator: 'gt', value: '2x' },
        { column: 'property:Confidence', operator: 'lt', value: '3' },
      ]),
      properties,
      'en',
    );
    expect(result.invalid).toEqual([1, 2]);
    expect(result.rows.map(({ id }) => id)).toEqual([2, 3]);
  });

  it('filters collection members and nonmembers by exact catalog names', () => {
    const items: Catalog = {
      rows: [
        row(1, { collections: ['Reading List', 'Methods'] }),
        row(2, { collections: ['Reading'] }),
        row(3, { collections: [] }),
        row(4),
      ],
      tags: new Set(['Tag only']),
      collections: new Set(['Reading List', 'Methods', 'Reading', 'Elsewhere']),
    };
    for (const [operator, value, ids] of [
      ['contains', 'Reading List', [1]],
      ['contains', 'Reading', [2]],
      ['contains', 'Elsewhere', []],
      ['notContains', 'Reading List', [2, 3, 4]],
      ['has', '', [1, 2]],
      ['missing', '', [3, 4]],
    ] as const) {
      const result = queryCatalog(
        items,
        view([{ column: 'collections', operator, value }]),
        properties,
        'en',
      );
      expect(result.invalid).toEqual([]);
      expect(result.rows.map(({ id }) => id)).toEqual(ids);
    }
    const invalid = view([
      { column: 'collections', operator: 'contains', value: 'reading list' },
      { column: 'collections', operator: 'notContains', value: 'Tag only' },
      { column: 'collections', operator: 'contains', value: '' },
    ]);
    expect(queryCatalog(items, invalid, properties, 'en').invalid).toEqual([0, 1, 2]);
  });

  it('filters links as text without needing them to be visible', () => {
    const items: Catalog = {
      rows: [
        row(1, { doi: '10.1000/DOI', url: 'https://example.org/article' }),
        row(2, { doi: '10.1001/DOI' }),
        row(3, { doi: '10.1000/DOI' }),
      ],
      tags: new Set(),
    };
    const filtered = view([
      { column: 'doi', operator: 'equals', value: '10.1000/doi' },
      { column: 'url', operator: 'contains', value: 'EXAMPLE.ORG' },
    ]);
    expect(queryCatalog(items, filtered, properties, 'en').rows.map(({ id }) => id)).toEqual([1]);
  });
});

describe('catalog search', () => {
  it('searches the whole catalog and the complete creator list before sorting', () => {
    const large: Catalog = {
      rows: Array.from({ length: 70 }, (_, index) =>
        row(index + 1, {
          title: index === 64 ? 'Target paper' : `Other paper ${index + 1}`,
          creators:
            index === 64
              ? Array.from({ length: 20 }, (_, author) => `Author ${author + 1}`).join('; ')
              : '',
        }),
      ),
      tags: new Set(),
    };
    expect(
      queryCatalog(large, view(), properties, 'en-US', 'author 20').rows.map(({ id }) => id),
    ).toEqual([65]);
  });

  it('matches case-folded tokens across native fields and ignores unrelated fields', () => {
    const items: Catalog = {
      rows: [
        row(1, {
          title: 'Cafe\u0301 studies',
          creators: 'Ada Lovelace',
          source: 'Science Journal',
          year: '2024',
          tags: ['Deep Learning'],
          type: 'journalArticle',
          added: '2025-01-01',
          pdf: true,
        }),
        row(2, { title: 'Café studies', creators: 'Grace Hopper', year: '2020' }),
      ],
      tags: new Set(['Deep Learning']),
    };
    expect(
      queryCatalog(items, view(), properties, 'en-US', 'café').rows.map(({ id }) => id),
    ).toEqual([1, 2]);
    for (const search of ['ADA', 'science', '2024', 'learning']) {
      expect(
        queryCatalog(items, view(), properties, 'en-US', search).rows.map(({ id }) => id),
      ).toEqual([1]);
    }
    expect(
      queryCatalog(items, view(), properties, 'en-US', '  CAFÉ \t ada  2024\n learning ').rows.map(
        ({ id }) => id,
      ),
    ).toEqual([1]);
    for (const search of ['journalArticle', '2025-01-01']) {
      expect(queryCatalog(items, view(), properties, 'en-US', search).rows).toEqual([]);
    }
    expect(
      queryCatalog(items, view(), properties, 'en-US', ' \t\n ').rows.map(({ id }) => id),
    ).toEqual([1, 2]);
  });

  it('searches flagged native fields when hidden and other native fields when visible', () => {
    const items: Catalog = {
      rows: [
        row(1, {
          title: 'Research',
          citationKey: 'Smith2024',
          doi: '10.1000/Sample',
          journalAbbreviation: 'Nat. Phys.',
          publisher: 'Science Press',
          collections: ['Methods', 'Reading List'],
          pages: '115–120',
          url: 'https://example.org',
          pdf: true,
        }),
        row(2, { title: 'Research', collections: ['Methods'], pages: '128', pdf: false }),
      ],
      tags: new Set(),
    };
    for (const term of ['smith2024', '10.1000/sample', 'phys.', 'press', 'reading']) {
      expect(queryCatalog(items, view(), properties, 'en', term).rows.map(({ id }) => id)).toEqual([
        1,
      ]);
    }
    const visible: View = { ...view(), columns: ['title', 'citationKey', 'pages', 'url', 'pdf'] };
    for (const term of ['115–120', 'example.org', 'yes']) {
      expect(queryCatalog(items, view(), properties, 'en', term).rows).toEqual([]);
      expect(queryCatalog(items, visible, properties, 'en', term).rows.map(({ id }) => id)).toEqual(
        [1],
      );
    }
    const result = queryCatalog(
      items,
      visible,
      properties,
      'en',
      'research smith2024 methods 115–120',
    );
    expect(result.rows.map(({ id }) => id)).toEqual([1]);
  });

  it('searches visible non-URL custom values, including options and localized checkboxes', () => {
    const visible: View = {
      ...view(),
      columns: [
        'title',
        'property:Memo',
        'property:Method',
        'property:Reviewed',
        'property:Removed',
      ],
    };
    expect(queryCatalog(catalog, view(), properties, 'en-US', 'equation').rows).toEqual([]);
    for (const search of ['equation', 'transformer', 'diffusion', 'yes', 'true']) {
      expect(queryCatalog(catalog, visible, properties, 'en-US', search).rows[0]?.id).toBe(1);
    }
    expect(
      queryCatalog(catalog, visible, properties, 'en-US', 'equation diffusion').rows.map(
        ({ id }) => id,
      ),
    ).toEqual([1]);
    expect(
      queryCatalog(catalog, visible, properties, 'zh-CN', '是').rows.map(({ id }) => id),
    ).toEqual([1]);
    expect(
      queryCatalog(catalog, visible, properties, 'zh-CN', '否').rows.map(({ id }) => id),
    ).toEqual([3, 2]);
  });

  it('searches every custom URL even when its column and its row are off screen', () => {
    const items: Catalog = {
      rows: [
        ...Array.from({ length: 319 }, (_, index) => row(index + 1)),
        row(320, {
          title: 'Research',
          extra:
            'Project Link: https://example.org/ResearchRepo\nCode Link: http://example.org/submission\nMemo: hidden-note\nRead On: 2024-02-29',
        }),
        row(321, {
          extra:
            'Project Link: javascript:ResearchRepo\nCode Link: https:///example.org/submission',
        }),
      ],
      tags: new Set(),
    };
    const search = (term: string, visible = view()) =>
      queryCatalog(items, visible, properties, 'en', term).rows.map(({ id }) => id);
    expect(search('researchrepo submission')).toEqual([320]);
    expect(search('researchrepo')).toEqual([320]);
    expect(search('submission')).toEqual([320]);
    expect(search('hidden-note')).toEqual([]);
    expect(search('2024-02-29')).toEqual([]);
    expect(search('hidden-note', { ...view(), columns: ['property:Memo'] })).toEqual([320]);
  });

  it('ANDs search with valid saved filters, preserves invalid indices and typed sorting', () => {
    const items: Catalog = {
      rows: [
        row(1, { title: 'Target', extra: 'Confidence: 10\nStatus: Reading' }),
        row(2, { title: 'Target', extra: 'Confidence: 2\nStatus: Reading' }),
        row(3, { title: 'Target', extra: 'Confidence: 1\nStatus: Done' }),
        row(4, { title: 'Other', extra: 'Confidence: 0\nStatus: Reading' }),
      ],
      tags: new Set(),
    };
    const result = queryCatalog(
      items,
      view(
        [
          { column: 'property:Removed', operator: 'has', value: '' },
          { column: 'property:Status', operator: 'equals', value: 'Reading' },
        ],
        'property:Confidence',
      ),
      properties,
      'en-US',
      'target',
    );
    expect(result.invalid).toEqual([0]);
    expect(result.rows.map(({ id }) => id)).toEqual([2, 1]);
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

  it('orders by two available keys and skips a removed key ahead of them', () => {
    const items: Catalog = {
      rows: [
        row(1, { title: 'Alpha' }),
        row(2, { title: 'Zulu', year: '2024' }),
        row(3, { title: 'Alpha', year: '2024' }),
        row(4, { title: 'Alpha', year: '2023' }),
        row(5, { title: 'Bravo' }),
        row(6, { title: 'alpha', year: '2024' }),
      ],
      tags: new Set(),
    };
    const sorted: View = {
      ...view(),
      sorts: [
        { column: 'property:Removed', direction: 'asc' },
        { column: 'year', direction: 'asc' },
        { column: 'title', direction: 'desc' },
      ],
    };
    expect(queryCatalog(items, sorted, properties, 'en').rows.map(({ id }) => id)).toEqual([
      4, 2, 3, 6, 5, 1,
    ]);
    expect(queryCatalog(items, { ...sorted, sorts: [] }, properties, 'en').rows).toBe(items.rows);
  });

  it('combines chronological native dates and numeric counts with stable ties and blanks last', () => {
    const items: Catalog = {
      rows: [
        row(1, { dateModified: '2024-04-01T23:00:00+03:00', notesCount: '2' }),
        row(2, { dateModified: '2024-04-01 20:00:00', notesCount: '10' }),
        row(3, { dateModified: '2024-04-01T21:00:00-03:00', notesCount: '0' }),
        row(4, { dateModified: '2024-04-01T20:00:00Z', notesCount: '2' }),
        row(5, { dateModified: '2024-04', notesCount: '0' }),
        row(6, { notesCount: '10' }),
        row(7, { dateModified: '2024-04-01T20:00:00.001Z' }),
        row(8, { dateModified: '2024-04-01T20:00:00Z' }),
      ],
      tags: new Set(),
    };
    const descending: View = {
      ...view(),
      sorts: [
        { column: 'dateModified', direction: 'desc' },
        { column: 'notesCount', direction: 'desc' },
      ],
    };
    expect(queryCatalog(items, descending, properties, 'en').rows.map(({ id }) => id)).toEqual([
      3, 7, 2, 1, 4, 8, 6, 5,
    ]);
    const ascending: View = {
      ...descending,
      sorts: [
        { column: 'dateModified', direction: 'asc' },
        { column: 'notesCount', direction: 'asc' },
      ],
    };
    expect(queryCatalog(items, ascending, properties, 'en').rows.map(({ id }) => id)).toEqual([
      1, 4, 2, 8, 7, 3, 5, 6,
    ]);
  });

  it('uses three keys, keeps blanks last independently, and preserves order within groups', () => {
    const items: Catalog = {
      rows: [
        row(1, { title: 'Bravo', year: '2024', type: 'journal', extra: 'Confidence: 2' }),
        row(2, { title: 'Zulu', type: 'book', extra: 'Confidence: 9' }),
        row(3, { title: 'Alpha', year: '2024', type: 'journal' }),
        row(4, { title: 'Charlie', year: '2024', type: 'book', extra: 'Confidence: 10' }),
        row(5, { title: 'alpha', year: '2024', type: 'journal', extra: 'Confidence: 2' }),
        row(6, { title: 'Alpha', year: '2024', type: 'book', extra: 'Confidence: 2.0' }),
        row(7, { title: 'Alpha', type: 'book', extra: 'Confidence: 1' }),
        row(8, { title: 'X-ray', year: '2020', type: 'journal', extra: 'Confidence: 30' }),
        row(9, { title: 'Bravo', year: '2024', type: 'book', extra: 'Confidence: malformed' }),
        row(10, { year: '2024', type: 'journal', extra: 'Confidence: 2' }),
      ],
      tags: new Set(),
    };
    const sorted: View = {
      ...view(),
      sorts: [
        { column: 'year', direction: 'desc' },
        { column: 'property:Confidence', direction: 'desc' },
        { column: 'title', direction: 'asc' },
      ],
    };
    const { rows } = queryCatalog(items, sorted, properties, 'en');
    expect(rows.map(({ id }) => id)).toEqual([4, 5, 6, 1, 10, 3, 9, 8, 2, 7]);
    const groups = groupRows(
      rows,
      { column: 'type', direction: 'asc' },
      properties,
      items.tags,
      'en',
    );
    expect(groups?.map(({ value, rows }) => [value, rows.map(({ id }) => id)])).toEqual([
      ['book', [4, 6, 9, 2, 7]],
      ['journal', [5, 1, 10, 3, 8]],
    ]);
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
