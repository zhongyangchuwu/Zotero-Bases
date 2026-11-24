export type PropertyType = 'text' | 'number' | 'checkbox' | 'single-select' | 'multi-select';
export type PropertyValue = string | boolean | readonly string[] | null;

export const OPTION_COLORS = [
  'neutral',
  'green',
  'amber',
  'sky',
  'violet',
  'teal',
  'rose',
] as const;
export type OptionColorKey = (typeof OPTION_COLORS)[number];

export interface Property {
  readonly key: string;
  readonly type: PropertyType;
  readonly options?: readonly string[];
  readonly optionColors?: Readonly<Partial<Record<string, OptionColorKey>>>;
}

export type NativeValueType = 'text' | 'number' | 'date' | 'link' | 'multi' | 'boolean';

export interface NativeColumnDefinition<Key extends string = string> {
  readonly key: Key;
  readonly group: 'common' | 'more';
  readonly valueType: NativeValueType;
  readonly icon: string;
  readonly defaultWidth: number;
  readonly defaultVisible: boolean;
  readonly labels: readonly [en: string, zh: string];
  readonly field?: string;
  readonly baseMapped?: boolean;
  readonly search?: true;
  readonly grouping?: 'value' | 'month' | 'member';
}

type NativeColumnOptions = Pick<
  NativeColumnDefinition,
  'field' | 'baseMapped' | 'search' | 'grouping' | 'defaultVisible'
>;

function nativeColumn<Key extends string>(
  key: Key,
  group: NativeColumnDefinition['group'],
  valueType: NativeValueType,
  icon: string,
  defaultWidth: number,
  labels: NativeColumnDefinition['labels'],
  options?: Partial<NativeColumnOptions>,
): NativeColumnDefinition<Key> {
  return { key, group, valueType, icon, defaultWidth, labels, defaultVisible: false, ...options };
}

// Column IDs are persisted; keep `added` as the ID for Zotero's dateAdded.
export const NATIVE_COLUMN_DEFINITIONS = [
  nativeColumn('title', 'common', 'text', 'title', 360, ['Title', '标题'], {
    defaultVisible: true,
    search: true,
    field: 'title',
    baseMapped: true,
  }),
  nativeColumn('creators', 'common', 'text', 'creators', 180, ['Authors', '作者'], {
    defaultVisible: true,
    search: true,
  }),
  nativeColumn('year', 'common', 'number', 'calendar', 126, ['Year', '年份'], {
    defaultVisible: true,
    search: true,
    grouping: 'value',
  }),
  nativeColumn('source', 'common', 'text', 'book', 168, ['Publication', '期刊／来源'], {
    defaultVisible: true,
    search: true,
  }),
  nativeColumn('type', 'common', 'text', 'type', 112, ['Item type', '条目类型'], {
    defaultVisible: true,
    grouping: 'value',
  }),
  nativeColumn('tags', 'common', 'multi', 'tags', 185, ['Tags', '标签'], {
    defaultVisible: true,
    search: true,
    grouping: 'member',
  }),
  nativeColumn('pdf', 'common', 'boolean', 'pdf', 104, ['PDF', 'PDF'], { defaultVisible: true }),
  nativeColumn('added', 'common', 'date', 'calendar', 112, ['Date added', '添加时间'], {
    defaultVisible: true,
    grouping: 'month',
  }),
  nativeColumn('citationKey', 'common', 'text', 'citation', 178, ['Citation Key', '引用关键词'], {
    field: 'citationKey',
    search: true,
  }),
  nativeColumn('collections', 'common', 'multi', 'collections', 208, ['Collections', '所属分类'], {
    search: true,
    grouping: 'member',
  }),
  nativeColumn('date', 'common', 'date', 'calendar', 122, ['Date', '完整日期'], {
    field: 'date',
    baseMapped: true,
    grouping: 'month',
  }),
  nativeColumn('dateModified', 'common', 'date', 'calendar', 128, ['Date Modified', '修改日期'], {
    grouping: 'month',
  }),
  nativeColumn('lastRead', 'common', 'date', 'calendar', 118, ['Last Read', '最后阅读时间'], {
    grouping: 'month',
  }),
  nativeColumn('notesCount', 'common', 'number', 'notes', 152, ['Notes', '笔记数'], {
    grouping: 'value',
  }),
  nativeColumn(
    'attachmentsCount',
    'common',
    'number',
    'attachments',
    120,
    ['Attachments', '附件数'],
    { grouping: 'value' },
  ),
  nativeColumn('doi', 'common', 'link', 'link', 220, ['DOI', 'DOI'], {
    field: 'DOI',
    search: true,
  }),
  nativeColumn('url', 'common', 'link', 'link', 220, ['URL', '网址'], { field: 'url' }),
  nativeColumn('journalAbbreviation', 'common', 'text', 'book', 150, ['Journal Abbr', '刊名简称'], {
    field: 'journalAbbreviation',
    search: true,
  }),
  nativeColumn('publisher', 'common', 'text', 'book', 168, ['Publisher', '出版社'], {
    field: 'publisher',
    baseMapped: true,
    search: true,
  }),
  nativeColumn('shortTitle', 'common', 'text', 'title', 206, ['Short Title', '短标题'], {
    field: 'shortTitle',
  }),
  nativeColumn('volume', 'more', 'text', 'text', 84, ['Volume', '卷次'], { field: 'volume' }),
  nativeColumn('issue', 'more', 'text', 'text', 84, ['Issue', '期号'], { field: 'issue' }),
  nativeColumn('pages', 'more', 'text', 'text', 104, ['Pages', '页码'], { field: 'pages' }),
  nativeColumn('language', 'more', 'text', 'text', 104, ['Language', '语言'], {
    field: 'language',
  }),
  nativeColumn('series', 'more', 'text', 'book', 148, ['Series', '系列'], { field: 'series' }),
  nativeColumn('seriesTitle', 'more', 'text', 'book', 160, ['Series Title', '系列标题'], {
    field: 'seriesTitle',
  }),
  nativeColumn('callNumber', 'more', 'text', 'text', 134, ['Call Number', '索书号'], {
    field: 'callNumber',
  }),
  nativeColumn('place', 'more', 'text', 'text', 124, ['Place', '地点'], {
    field: 'place',
    baseMapped: true,
  }),
  nativeColumn('edition', 'more', 'text', 'text', 96, ['Edition', '版次'], { field: 'edition' }),
  nativeColumn('accessDate', 'more', 'date', 'calendar', 122, ['Access Date', '访问时间'], {
    field: 'accessDate',
    grouping: 'month',
  }),
  nativeColumn('archive', 'more', 'text', 'collections', 146, ['Archive', '档案'], {
    field: 'archive',
  }),
  nativeColumn('archiveLocation', 'more', 'text', 'text', 152, ['Archive Location', '档案编号'], {
    field: 'archiveLocation',
  }),
  nativeColumn('rights', 'more', 'text', 'text', 132, ['Rights', '版权'], { field: 'rights' }),
] as const;

export type NativeColumn = (typeof NATIVE_COLUMN_DEFINITIONS)[number]['key'];
export const NATIVE_COLUMN_BY_KEY = Object.fromEntries(
  NATIVE_COLUMN_DEFINITIONS.map((definition) => [definition.key, definition]),
) as Readonly<Record<NativeColumn, NativeColumnDefinition<NativeColumn>>>;
export const NATIVE_COLUMNS: readonly NativeColumn[] = NATIVE_COLUMN_DEFINITIONS.map(
  ({ key }) => key,
);
export const DEFAULT_COLUMNS: readonly NativeColumn[] = NATIVE_COLUMN_DEFINITIONS.filter(
  ({ defaultVisible }) => defaultVisible,
).map(({ key }) => key);

export function isNativeColumn(value: unknown): value is NativeColumn {
  return typeof value === 'string' && Object.hasOwn(NATIVE_COLUMN_BY_KEY, value);
}
export type Column = NativeColumn | `property:${string}`;
export type Density = 'compact' | 'comfortable' | 'wrap';
export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 1600;
export type Direction = 'asc' | 'desc';
export type SortRule = { readonly column: Column; readonly direction: Direction };
export type Operator =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'notContains'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'has'
  | 'missing'
  | 'before'
  | 'after';

export interface Filter {
  readonly column: Column;
  readonly operator: Operator;
  readonly value: string;
}

export type Grouping =
  | {
      readonly column: Exclude<NativeColumn, 'tags' | 'collections'> | `property:${string}`;
      readonly direction: Direction;
    }
  | { readonly column: 'tags'; readonly tag: string; readonly direction: Direction }
  | { readonly column: 'collections'; readonly collection: string; readonly direction: Direction };

export interface View {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly columns: readonly Column[];
  readonly sorts: readonly SortRule[];
  readonly filters: readonly Filter[];
  readonly group?: Grouping;
  readonly density?: Density;
  readonly columnWidths?: Readonly<Partial<Record<Column, number>>>;
}

export interface Scope {
  readonly id: string;
  readonly label: string;
}

export interface Row
  extends Readonly<Partial<Record<Exclude<NativeColumn, 'tags' | 'pdf' | 'collections'>, string>>> {
  readonly id: number;
  readonly writable: boolean;
  readonly title: string;
  readonly creators: string;
  readonly year: string;
  readonly source: string;
  readonly type: string;
  readonly tags: readonly string[];
  readonly pdf: boolean;
  readonly added: string;
  readonly collections?: readonly string[];
  readonly extra: string;
}

export interface Catalog {
  readonly rows: readonly Row[];
  readonly tags: ReadonlySet<string>;
  readonly collections?: ReadonlySet<string>;
}

export interface Preferences {
  readonly properties: readonly Property[];
  readonly views: readonly View[];
  readonly active: string;
}

export type ConfigChange =
  | { readonly kind: 'views'; readonly views: readonly View[]; readonly active: string }
  | { readonly kind: 'define'; readonly property: Property }
  | {
      readonly kind: 'rename-option';
      readonly key: string;
      readonly previous: string;
      readonly next: string;
    }
  | {
      readonly kind: 'delete-option';
      readonly key: string;
      readonly option: string;
      readonly clean: boolean;
    }
  | {
      readonly kind: 'set-option-color';
      readonly key: string;
      readonly option: string;
      readonly color: OptionColorKey | undefined;
    }
  | { readonly kind: 'delete-property'; readonly key: string; readonly clean: boolean };

export interface MutationResult {
  readonly changed: number;
  readonly skipped: number;
}

export type BulkChange =
  | { readonly kind: 'property'; readonly key: string; readonly value: PropertyValue }
  | { readonly kind: 'tag'; readonly tag: string; readonly add: boolean };

export type BulkResult = MutationResult & { readonly readOnly: number };

/** All DOM is created in the owning document; raw Zotero objects remain in the host. */
export interface WorkspaceHost {
  settings(): Preferences;
  change(change: ConfigChange): Promise<MutationResult>;
  scopes(): readonly Scope[];
  initialScope(): string;
  load(scope: string): Promise<Catalog>;
  setProperty(id: number, key: string, value: PropertyValue): Promise<void>;
  changeTag(id: number, tag: string, add: boolean): Promise<void>;
  bulk(ids: readonly number[], change: BulkChange): Promise<BulkResult>;
  suggestPropertyKey(key: string, existing: readonly Property[]): string | undefined;
  openItem(id: number, pdf: boolean): Promise<void>;
  subscribe(listener: (kind: 'data' | 'settings') => void): () => void;
}
