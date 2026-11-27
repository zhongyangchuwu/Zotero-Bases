import { describe, expect, it } from 'vitest';
import { boardLanes } from '../src/board-model';
import { DEFAULT_COLUMNS, type Property } from '../src/contracts';
import { createStarterDefaults, createViewDefaults } from '../src/view-defaults';

const tableSorts = [
  { column: 'added', direction: 'desc' },
  { column: 'title', direction: 'asc' },
];

describe('new view defaults', () => {
  it('uses the current scope and density with recency sorts for a new table', () => {
    expect(
      createViewDefaults(
        { name: 'New table', id: 'new', scope: 'group:42', layout: 'table', density: 'wrap' },
        [{ key: 'Existing rating', type: 'rating' }],
      ),
    ).toEqual({
      id: 'new',
      name: 'New table',
      scope: 'group:42',
      columns: DEFAULT_COLUMNS,
      sorts: tableSorts,
      filters: [],
      layout: 'table',
      density: 'wrap',
      frozenCount: 1,
    });
  });

  it('finds the first current lane field and includes the current rating in ordinary Board cards', () => {
    const properties: readonly Property[] = [
      { key: 'Review note', type: 'text' },
      { key: 'Status of reading', type: 'single-select', options: ['Done'] },
      { key: 'Importance', type: 'rating' },
    ];
    const board = createViewDefaults(
      { name: 'My board', id: 'new', scope: 'user', layout: 'board', density: 'comfortable' },
      properties,
    );
    expect(board).toMatchObject({
      layout: 'board',
      sorts: [{ column: 'title', direction: 'asc' }],
      board: {
        laneField: 'property:Status of reading',
        cardFields: ['creators', 'year', 'property:Importance', 'tags', 'pdf'],
        hideEmptyLanes: false,
        collapsedLanes: [],
      },
    });
  });

  it.each([
    [
      'en',
      'All Literature',
      'Reading Board',
      'Reading Stage',
      'Rating',
      'Code / Home',
      ['To Read', 'Reading', 'Deep Read', 'Done'],
    ],
    [
      'zh-CN',
      '全部文献',
      '阅读看板',
      '阅读阶段',
      '评分',
      '代码/主页',
      ['待读', '在读', '精读', '已读'],
    ],
  ] as const)(
    'builds the complete %s starter workspace',
    (language, tableName, boardName, stage, rating, code, options) => {
      const scope = 'group:42/READING1';
      const { properties, views, active } = createStarterDefaults(language, 'comfortable', scope);
      const [table, board] = views;
      const [toRead, reading, deepRead, done] = options;
      expect(properties).toEqual([
        {
          key: stage,
          type: 'single-select',
          options,
          optionColors: {
            [toRead]: 'neutral',
            [reading]: 'amber',
            [deepRead]: 'sky',
            [done]: 'green',
          },
        },
        { key: rating, type: 'rating' },
        { key: code, type: 'url' },
      ]);
      expect(active).toBe('starter-literature');
      expect(views).toHaveLength(2);
      expect(table).toEqual({
        id: active,
        name: tableName,
        scope,
        layout: 'table',
        columns: [
          'title',
          'creators',
          'year',
          'source',
          `property:${stage}`,
          `property:${rating}`,
          'tags',
          'pdf',
          'added',
        ],
        columnWidths: {
          title: 260,
          creators: 124,
          year: 84,
          source: 124,
          tags: 108,
          pdf: 96,
          added: 132,
        },
        filters: [],
        sorts: tableSorts,
        density: 'comfortable',
        frozenCount: 1,
      });
      expect(board).toMatchObject({
        id: 'starter-reading-board',
        name: boardName,
        scope,
        layout: 'board',
        filters: [],
        sorts: [
          { column: `property:${rating}`, direction: 'desc' },
          { column: 'added', direction: 'desc' },
        ],
        board: {
          laneField: `property:${stage}`,
          cardFields: ['creators', 'year', `property:${rating}`, 'tags', 'pdf'],
          hideEmptyLanes: false,
          collapsedLanes: [],
        },
      });
      expect(boardLanes([], properties[0]!, board!.board!).map(({ value }) => value)).toEqual([
        null,
        ...options,
      ]);
    },
  );
});
