import { defaultBoardSettings } from './board-model';
import {
  DEFAULT_COLUMNS,
  type Density,
  type Preferences,
  type Property,
  type SortRule,
  type View,
  type ViewLayout,
} from './contracts';
import type { Language } from './i18n';

const TABLE_SORTS: readonly SortRule[] = [
  { column: 'added', direction: 'desc' },
  { column: 'title', direction: 'asc' },
];
const BOARD_SORTS: readonly SortRule[] = [{ column: 'title', direction: 'asc' }];

export function createViewDefaults(
  {
    id,
    name,
    scope,
    layout,
    density,
    columns = DEFAULT_COLUMNS,
    sorts = layout === 'board' ? BOARD_SORTS : TABLE_SORTS,
  }: Pick<View, 'id' | 'name' | 'scope'> &
    Partial<Pick<View, 'columns' | 'sorts'>> & { layout: ViewLayout; density: Density },
  properties: readonly Property[],
): View {
  return {
    id,
    name,
    scope,
    columns,
    sorts,
    filters: [],
    layout,
    density,
    frozenCount: 1,
    ...(layout === 'board' && { board: defaultBoardSettings(properties) }),
  };
}

const STARTER_LABELS = {
  'zh-CN': {
    table: '全部文献',
    board: '阅读看板',
    stage: '阅读阶段',
    rating: '评分',
    code: '代码/主页',
    stages: ['待读', '在读', '精读', '已读'],
  },
  en: {
    table: 'All Literature',
    board: 'Reading Board',
    stage: 'Reading Stage',
    rating: 'Rating',
    code: 'Code / Home',
    stages: ['To Read', 'Reading', 'Deep Read', 'Done'],
  },
} as const;

// Leave room for the checkbox and column menu at 1920px with 150% UI scaling.
const STARTER_TABLE_WIDTHS: NonNullable<View['columnWidths']> = {
  title: 260,
  creators: 124,
  year: 84,
  source: 124,
  tags: 108,
  pdf: 96,
  added: 132,
};

export function createStarterDefaults(
  language: Language,
  density: Density,
  scope: string,
): Preferences {
  const { table, board, stage, rating, code, stages } = STARTER_LABELS[language];
  const [toRead, reading, deepRead, done] = stages;
  const properties: readonly Property[] = [
    {
      key: stage,
      type: 'single-select',
      options: stages,
      optionColors: { [toRead]: 'neutral', [reading]: 'amber', [deepRead]: 'sky', [done]: 'green' },
    },
    { key: rating, type: 'rating' },
    { key: code, type: 'url' },
  ];
  const literature: View = {
    ...createViewDefaults(
      {
        id: 'starter-literature',
        name: table,
        scope,
        layout: 'table',
        density,
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
      },
      properties,
    ),
    columnWidths: STARTER_TABLE_WIDTHS,
  };
  const readingBoard = createViewDefaults(
    {
      id: 'starter-reading-board',
      name: board,
      scope,
      layout: 'board',
      density,
      sorts: [
        { column: `property:${rating}`, direction: 'desc' },
        { column: 'added', direction: 'desc' },
      ],
    },
    properties,
  );
  return { properties, views: [literature, readingBoard], active: literature.id };
}
