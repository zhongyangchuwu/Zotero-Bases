import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  NATIVE_COLUMN_BY_KEY,
  NATIVE_COLUMN_DEFINITIONS,
  NATIVE_COLUMNS,
  isNativeColumn,
  type BoardSettings,
  type BulkChange,
  type Catalog,
  type Column,
  type ConfigChange,
  type Direction,
  type Filter,
  type Density,
  type Grouping,
  type MutationResult,
  type Operator,
  type OptionColorKey,
  type Preferences,
  type Property,
  type PropertyType,
  type PropertyValue,
  type Row,
  type SortRule,
  type View,
  type TagColorRule,
  type WorkspaceHost,
  type ViewLayout,
} from './contracts';
import { createBoard } from './board';
import { createBoardCards } from './board-cards';
import { boardCardsCSS } from './board-cards.css';
import { boardCSS } from './board.css';
import {
  boardCardFields,
  boardLaneProperty,
  boardLanes,
  defaultBoardSettings,
  laneProperties,
} from './board-model';
import { createCellRenderers, optionTone } from './cell-renderers';
import { scopeCustomCSS } from './custom-css';
import { createFieldIcon } from './field-icons';
import { frozenColumns, horizontalReveal, type FrozenColumns } from './frozen-columns';
import {
  DEFAULT_GLOBAL_PREFERENCES,
  resolveLanguage,
  type GlobalPreferences,
  type GlobalPreferenceStore,
} from './global-preferences';
import { groupRows, isGroupProperty, type RowGroup } from './grouping';
import { messages, type Language } from './i18n';
import { createInlineCalendar } from './inline-calendar';
import { createPopover } from './popover';
import { popoverCSS } from './popover.css';
import { isISODate, webURL } from './property-values';
import { cellValue, filterOperators, queryCatalog, type QueryResult } from './query';
import type { SyncPort } from './sync';
import { mountSyncBadge } from './sync-controls';
import { workspaceCSS } from './workspace.css';
import { TableKeys, type TableCommand } from './table-keys';
import { resolveTagColors } from './tag-colors';
import { createViewDefaults } from './view-defaults';
import { flattenRows, VirtualLayout, type VirtualRow } from './virtual-layout';

const OVERSCAN = 170;
const FALLBACK_VIEWPORT_HEIGHT = 680;
const SEARCH_DELAY = 140;
const SELECT_COLUMN_WIDTH = 36;
const COLUMN_ACTION_WIDTH = 40;
const PALETTE = ['amber', 'red', 'green', 'sky', 'violet', 'rose', 'orange', 'neutral'] as const;
const RATING_VALUES = ['1', '2', '3', '4', '5'] as const;
const GRID_CONTROLS = '.zb-link-control, .zb-url-edit, [data-rating]';
const EDITABLE_KEYS = 'input:not([type=checkbox]), textarea, select, [contenteditable], .zb-editor';

const PROPERTY_TYPES: readonly PropertyType[] = [
  'text',
  'number',
  'checkbox',
  'single-select',
  'multi-select',
  'rating',
  'url',
  'date',
];
const words = {
  views: ['Views', '视图'],
  defaultView: ['Default', '默认视图'],
  newView: ['New view', '新建视图'],
  newTable: ['New table view', '新建表格视图'],
  newBoard: ['New board view', '新建看板视图'],
  switchToTable: ['Switch to table view', '切换为表格视图'],
  switchToBoard: ['Switch to board view', '切换为看板视图'],
  lanes: ['Lanes', '泳道'],
  laneField: ['Lane field', '泳道字段'],
  cardFields: ['Card fields', '卡片字段'],
  searchCardFields: ['Search card fields', '搜索卡片字段'],
  noCardFieldMatches: ['No matching card fields', '没有匹配的卡片字段'],
  hideEmptyLanes: ['Hide empty lanes', '隐藏空泳道'],
  expandLanes: ['Expand all lanes', '展开全部泳道'],
  collapseLanes: ['Collapse all lanes', '折叠全部泳道'],
  copyView: ['Copy view', '复制视图'],
  renameView: ['Rename view', '重命名视图'],
  deleteView: ['Delete view', '删除视图'],
  viewActions: ['View actions', '视图操作'],
  viewSettings: ['View settings', '视图设置'],
  viewName: ['View name', '视图名称'],
  copySuffix: ['copy', '副本'],
  popOut: ['Open in new window', '在新窗口打开'],
  settings: ['Zotero Bases settings', 'Zotero Bases 设置'],
  scope: ['Scope', '范围'],
  allLibraries: ['All libraries', '全部文库'],
  columns: ['Columns', '列'],
  showColumns: ['Show columns', '显示列'],
  searchColumns: ['Search columns', '搜索列'],
  commonColumns: ['Common columns', '常用列'],
  customColumns: ['Custom properties', '自定义属性'],
  moreColumns: ['More Zotero columns', '更多 Zotero 列'],
  noColumnMatches: ['No matching columns', '没有匹配的列'],
  noCustomColumns: ['No custom properties', '尚无自定义属性'],
  sort: ['Sort', '排序'],
  sortField: ['Sort field', '排序字段'],
  addSort: ['Add sort', '添加排序'],
  clearSort: ['Clear sorting', '清空排序'],
  removeSort: ['Remove sort', '移除排序'],
  moveUp: ['Move up', '上移'],
  moveDown: ['Move down', '下移'],
  moveLeft: ['Move left', '向左移动'],
  moveRight: ['Move right', '向右移动'],
  resetOrder: ['Restore default column order', '恢复默认列序'],
  freezeThrough: ['Freeze through this column', '冻结到此列'],
  unfreezeColumns: ['Unfreeze columns', '取消冻结'],
  resetWidth: ['Restore default width', '恢复默认列宽'],
  hideColumn: ['Hide this column', '隐藏此列'],
  columnMenu: ['Column actions', '列操作'],
  sortAsc: ['Sort ascending', '升序排列'],
  sortDesc: ['Sort descending', '降序排列'],
  secondarySort: ['Add as secondary sort', '添加为次级排序'],
  toggleSort: ['Reverse sort direction', '切换排序方向'],
  editProperty: ['Edit property', '编辑属性'],
  direction: ['Sort direction', '排序方向'],
  resizeColumn: ['Resize column', '调整列宽'],
  density: ['Row density', '行密度'],
  compact: ['Compact', '紧凑'],
  comfortable: ['Comfortable', '标准'],
  wrap: ['Wrap', '展开换行'],
  search: ['Search this scope', '在当前范围内搜索'],
  clearSearch: ['Clear search', '清空搜索'],
  asc: ['Ascending', '升序'],
  desc: ['Descending', '降序'],
  grouping: ['Grouping', '分组'],
  groupBy: ['Group by', '分组字段'],
  noGrouping: ['No grouping', '不分组'],
  groupDirection: ['Group direction', '分组顺序'],
  groupTag: ['Tag to group by', '用于分组的标签'],
  chooseTag: ['Choose an existing tag', '选择现有标签'],
  groupCollection: ['Collection to group by', '用于分组的分类'],
  invalidGrouping: ['Unavailable grouping is ignored.', '已忽略失效分组。'],
  clearGrouping: ['Clear grouping', '清除分组'],
  missingGroup: ['No value', '未设置'],
  withTag: ['With tag', '有标签'],
  withoutTag: ['Without tag', '无标签'],
  inCollection: ['In collection', '属于分类'],
  outsideCollection: ['Not in collection', '不属于分类'],
  openPDF: ['Open PDF', '打开 PDF'],
  openAttachment: ['Open attachment', '打开附件'],
  openLink: ['Open external link', '打开外部链接'],
  copyDOI: ['Copy DOI', '复制 DOI'],
  filters: ['Filters', '筛选'],
  filterAnd: ['Match all conditions', '符合所有条件'],
  filterColumn: ['Filter field', '筛选字段'],
  filterOperator: ['Filter condition', '筛选条件'],
  filterValue: ['Filter value', '筛选值'],
  addFilter: ['Add condition', '添加条件'],
  removeFilter: ['Remove condition', '移除条件'],
  chooseValue: ['Choose a value', '选择值'],
  contains: ['Contains', '包含'],
  equals: ['Equals', '等于'],
  notEquals: ['Does not equal', '不等于'],
  notContains: ['Does not contain', '不包含'],
  gt: ['Greater than', '大于'],
  lt: ['Less than', '小于'],
  belongs: ['Belongs to', '属于'],
  notBelongs: ['Does not belong to', '不属于'],
  gte: ['At least', '大于或等于'],
  lte: ['At most', '小于或等于'],
  has: ['Is not empty', '不为空'],
  missing: ['Is empty', '为空'],
  before: ['Before', '早于'],
  after: ['After', '晚于'],
  invalidFilters: ['Unavailable filters are ignored', '已忽略失效条件'],
  removeInvalid: ['Remove unavailable filters', '移除失效条件'],
  unavailable: ['Unavailable', '不可用'],
  properties: ['Properties', '属性'],
  propertyKey: ['Property key', '属性键'],
  propertyType: ['Property type', '属性类型'],
  propertyOptions: ['Options (one per line)', '选项（每行一个）'],
  reservedKey: ['This key is reserved by Zotero.', '这是 Zotero 保留字段。'],
  useKey: ['Use', '改用'],
  addProperty: ['Add property', '添加属性'],
  addOption: ['Add option', '添加选项'],
  newOption: ['New option', '新选项'],
  optionName: ['Option name', '选项名称'],
  renameOption: ['Rename option', '重命名选项'],
  optionColor: ['Option color', '选项配色'],
  automaticColor: ['Automatic color', '自动配色'],
  neutral: ['Gray', '灰色'],
  green: ['Green', '绿色'],
  amber: ['Yellow', '黄色'],
  sky: ['Blue', '蓝色'],
  violet: ['Violet', '紫色'],
  rose: ['Magenta', '品红色'],
  red: ['Red', '红色'],
  orange: ['Orange', '橙色'],
  deleteProperty: ['Delete property', '删除属性'],
  deleteOption: ['Delete option', '删除选项'],
  definitionOnly: ['Remove definition only', '仅移除定义'],
  deleteClean: ['Remove definition and clear values', '移除定义并清理旧值'],
  cancel: ['Cancel', '取消'],
  text: ['Text', '文本'],
  number: ['Number', '数值'],
  checkbox: ['Checkbox', '复选框'],
  'single-select': ['Single-select', '单选'],
  'multi-select': ['Multi-select', '多选'],
  rating: ['Rating', '评分'],
  url: ['URL', '链接'],
  date: ['Date', '日期'],
  clearRating: ['Clear rating', '清空评分'],
  previousMonth: ['Previous month', '上个月'],
  nextMonth: ['Next month', '下个月'],
  today: ['Today', '今天'],
  invalidDate: ['Enter a valid date in YYYY-MM-DD format.', '请输入有效的日期（YYYY-MM-DD）。'],
  invalidURL: ['Enter a valid HTTP or HTTPS link.', '请输入有效的 HTTP 或 HTTPS 链接。'],
  yes: ['Yes', '是'],
  no: ['No', '否'],
  clear: ['Clear', '清空'],
  done: ['Done', '完成'],
  edit: ['Edit', '编辑'],
  readOnly: ['Read-only', '只读'],
  open: ['Open', '打开'],
  locate: ['Locate in Zotero', '在 Zotero 中定位'],
  openRow: ['Double-click to open PDF or locate in Zotero', '双击打开 PDF 或在 Zotero 中定位'],
  untitled: ['Untitled', '无标题'],
  tagName: ['New or existing tag', '新建或现有标签'],
  addTag: ['Add tag', '添加标签'],
  removeTag: ['Remove tag', '移除标签'],
  tagColors: ['Tag colors', '标签配色'],
  tagColorTarget: ['Match by', '匹配方式'],
  exactTag: ['Exact tag', '精确标签'],
  tagPrefix: ['Tag prefix', '标签前缀'],
  tagColorName: ['Tag or prefix', '标签或前缀'],
  resetTagColor: ['Use inherited color', '恢复继承颜色'],
  tagColorPriority: [
    'Zotero colors take priority, then exact tags, then the longest matching prefix.',
    '优先使用 Zotero 原生颜色，其次是精确标签，再按最长匹配前缀取色。',
  ],
  table: ['Items', '条目'],
  loading: ['Loading items…', '正在加载条目…'],
  selectAll: ['Select all matching items', '选择所有匹配条目'],
  selectItem: ['Select item', '选择条目'],
  clearSelection: ['Clear selection', '清除选中项'],
  bulkEdit: ['Bulk edit', '批量编辑'],
  bulkProperty: ['Bulk property', '批量编辑的属性'],
  bulkValue: ['Bulk value', '批量设置的值'],
  bulkSet: ['Set value', '设置值'],
  bulkClear: ['Clear property values', '清除属性值'],
  bulkTag: ['Bulk tag', '批量编辑的标签'],
  noItems: ['No matching items', '没有匹配条目'],
  noColumns: ['No visible columns. Choose columns above.', '没有可见列，请在上方选择要显示的列。'],
  loadError: ['Items could not be loaded.', '无法加载条目。'],
  retry: ['Retry', '重试'],
  actionError: ['Could not save this change.', '无法保存此项更改。'],
  propertyError: [
    'Could not save. Check that the key or option name is valid and not already in use.',
    '无法保存。请检查属性键或选项名是否有效，以及是否已被使用。',
  ],
  openError: ['Could not open this item.', '无法打开该条目。'],
} as const;

let nextId = 0;

function same(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function isSelectProperty(type: PropertyType): boolean {
  return type === 'single-select' || type === 'multi-select';
}

function named(element: HTMLElement, label: string): void {
  element.setAttribute('aria-label', label);
  element.title = label;
}

interface WorkspaceOptions {
  language: Language;
  popOut?: () => void;
  sync?: SyncPort;
  global?: GlobalPreferenceStore;
  openPreferences?: () => void;
  linkActions?: { open(url: string): void; copy(text: string): void };
}

type ActiveCell = { key: string; column: Column };

interface WorkspaceState {
  viewID: string;
  scope: string;
  catalog?: Catalog;
  search: string;
  selected: Set<number>;
  selectionAnchor?: number;
  foldedGroups: Set<RowGroup['value']>;
  activeCell?: ActiveCell;
  scroll: { key?: string; offset: number; left: number };
  focus?: 'search' | 'grid';
}

export function mountWorkspace(
  root: HTMLElement,
  host: WorkspaceHost,
  options: WorkspaceOptions,
): () => void {
  const preferences = options.global;
  let globals = preferences?.read() ?? DEFAULT_GLOBAL_PREFERENCES;
  let language = resolveLanguage(globals.language, options.language);
  let surface = mountWorkspaceSurface(root, host, { ...options, language }, globals);
  const unsubscribe = preferences?.subscribe((next) => {
    globals = next;
    const locale = resolveLanguage(next.language, options.language);
    if (locale === language) {
      surface.applyGlobals(next);
      return;
    }
    const state = surface.snapshot();
    surface.dispose();
    language = locale;
    surface = mountWorkspaceSurface(root, host, { ...options, language }, globals, state);
  });
  return () => {
    unsubscribe?.();
    surface.dispose();
  };
}

function mountWorkspaceSurface(
  root: HTMLElement,
  host: WorkspaceHost,
  options: WorkspaceOptions,
  globals: GlobalPreferences,
  state?: WorkspaceState,
) {
  const doc = root.ownerDocument;
  const window = doc.defaultView;
  const narrowWindow = options.popOut ? undefined : window?.matchMedia?.('(max-width: 72rem)');
  const zh = options.language === 'zh-CN';
  const t = messages(words, options.language);
  const mountId = `zb-${++nextId}`;
  let preferences = host.settings();
  let tagColor = resolveTagColors(preferences.tagColors);
  const savedView = preferences.views.find((view) => view.id === preferences.active);
  const restored =
    state && state.viewID === savedView?.id && state.scope === savedView.scope ? state : undefined;
  let initialScroll = restored?.scroll;
  let pendingViews = 0;
  let disposed = false;
  let loadTicket = 0;
  let catalog = restored?.catalog;
  let loadedScope = restored?.scope;
  let result: QueryResult | undefined;
  let groups: readonly RowGroup[] | undefined;
  const foldedGroups = restored?.foldedGroups ?? new Set<RowGroup['value']>();
  let choosingGroupMember: 'tags' | 'collections' | undefined;
  const selected = restored?.selected ?? new Set<number>();
  let selectionAnchor = restored?.selectionAnchor;
  let bulkPending = false;
  const layout = new VirtualLayout();
  const tableKeys = new TableKeys();
  let entries: readonly VirtualRow[] = [];
  const mounted = new Map<string, HTMLTableRowElement>();
  let frozen: FrozenColumns = { count: 0, width: 0, offsets: [] };
  let tableBody:
    | {
        body: HTMLTableSectionElement;
        leading: HTMLTableRowElement;
        trailing: HTMLTableRowElement;
        columns: readonly Column[];
        headers: HTMLCollectionOf<HTMLTableCellElement>;
      }
    | undefined;
  let activeCell = restored?.activeCell;
  let paintedCell: HTMLTableCellElement | undefined;
  let restoreGridFocus = false;
  let virtualFrame: number | undefined;
  let resetMeasurements = false;
  let widthAnchor: { index: number; within: number; atEnd: boolean } | undefined;
  let rowGeometryDirty = true;
  let measuredEm = 0;
  let searchTerm = restored?.search.trim() ?? '';
  let searchTimer: number | undefined;
  let composingSearch = false;
  let fitFrame: number | undefined;
  let renameViewId: string | undefined;
  let deleteChoice: { key: string; option?: string } | undefined;
  let closeEditor: ((restore: boolean) => void) | undefined;
  let recycleEditor: (() => void) | undefined;
  let editorKey: ((event: KeyboardEvent) => boolean) | undefined;
  let updateEditorColors: (() => void) | undefined;
  let positionEditor: (() => void) | undefined;
  let renderedCardFields: readonly Column[] = [];
  let cardRevision = 0;
  const pendingRenders = new Map<HTMLElement, EventListener>();
  const cells = createCellRenderers(doc, {
    text: t,
    authorFormat: () => globals.authorFormat,
    columnName,
    open: openRow,
    tagColor: (row, label) => tagColor(row, label),
    linkActions: options.linkActions,
    toggle(row, property, checked) {
      saveCell(host.setProperty(row.id, property.key, checked ? true : null));
    },
    rate: rateRow,
    edit(row, column, property, value, cell, opener) {
      if (column === 'tags') editTags(row, cell, opener);
      else if (property && isSelectProperty(property.type))
        editChoices(row, property, value, cell, opener);
      else if (property)
        editScalar(row, property, typeof value === 'string' ? value : '', cell, opener);
    },
  });

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = '',
    text = '',
  ): HTMLElementTagNameMap[K] {
    const node = doc.createElementNS(
      'http://www.w3.org/1999/xhtml',
      tag,
    ) as HTMLElementTagNameMap[K];
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(
    label: string,
    run: () => void,
    className = '',
    labelOverride?: string,
  ): HTMLButtonElement {
    const node = element('button', className, label);
    node.type = 'button';
    if (labelOverride) named(node, labelOverride);
    node.addEventListener('click', run);
    return node;
  }

  function option(value: string, label: string): HTMLOptionElement {
    const node = element('option', '', label);
    node.value = value;
    return node;
  }

  function select(
    label: string,
    items: readonly (readonly [string, string])[],
    value: string,
  ): HTMLSelectElement {
    const node = element('select');
    named(node, label);
    for (const [id, caption] of items) node.append(option(id, caption));
    node.value = value;
    return node;
  }

  function withChevron(field: HTMLSelectElement): HTMLSpanElement {
    const wrapper = element('span', 'zb-select-chevron');
    wrapper.append(field);
    return wrapper;
  }

  function input(label: string, value = ''): HTMLInputElement {
    const node = element('input');
    named(node, label);
    node.value = value;
    return node;
  }

  function focusKey(node: HTMLElement, key: string): void {
    node.dataset.focus = key;
  }

  function preserveFocus(region: HTMLElement, render: () => void, pane = region): void {
    const focused = doc.activeElement;
    const key = focused && region.contains(focused) ? focused.getAttribute('data-focus') : null;
    render();
    if (key) {
      for (const node of region.querySelectorAll<HTMLElement>('[data-focus]')) {
        if (node.dataset.focus === key && !node.matches(':disabled')) {
          node.focus({ preventScroll: true });
          return;
        }
      }
      if (popovers.isOpen(pane)) firstControl(pane)?.focus({ preventScroll: true });
    }
  }

  // Settings notifications can arrive while a user is still typing. Keep that element
  // mounted until its edit commits or is cancelled, then render the newest settings.
  function renderRegion(region: HTMLElement, draw: () => void): void {
    const focused = doc.activeElement;
    const pending = pendingRenders.get(region);
    if (pending) {
      region.removeEventListener('focusout', pending);
      pendingRenders.delete(region);
    }
    if (focused?.hasAttribute('data-keep-focus') && region.contains(focused)) {
      const afterBlur: EventListener = (event) => {
        if (event.target !== focused) return;
        region.removeEventListener('focusout', afterBlur);
        void Promise.resolve().then(() => {
          if (disposed || pendingRenders.get(region) !== afterBlur) return;
          pendingRenders.delete(region);
          renderRegion(region, draw);
        });
      };
      pendingRenders.set(region, afterBlur);
      region.addEventListener('focusout', afterBlur);
      return;
    }
    preserveFocus(region, draw);
  }

  const style = element('style');
  style.textContent = workspaceCSS + popoverCSS + boardCSS + boardCardsCSS;
  const customStyle = element('style');
  const surface = element('section', 'zb-workspace');
  surface.tabIndex = -1;
  surface.lang = options.language;
  const popovers = createPopover(surface);
  const headerMenu = createPane(t('columnMenu'), 'zb-view-action-list');
  const tagColorPane = createPane(t('tagColors'));
  let columnsFromTail = false;
  let moreColumnsOpen = false;

  function createPane(label: string, className = ''): HTMLDivElement {
    const pane = element('div', `zb-pane ${className}`.trim());
    pane.setAttribute('aria-label', label);
    return pane;
  }

  function firstControl(pane: HTMLElement): HTMLElement | null {
    return pane.querySelector('button:not(:disabled), select:not(:disabled), input:not(:disabled)');
  }

  function openPane(anchor: HTMLElement, pane: HTMLElement): void {
    if (pane === columnPane && !popovers.isOpen(columnPane)) {
      columnSearch.value = '';
      moreColumnsOpen = false;
      renderColumns();
    }
    popovers.open(anchor, pane, { initialFocus: () => firstControl(pane) });
  }

  function tool(label: string, pane: HTMLElement, caption = label, className = 'zb-tool') {
    const trigger = button(caption, () => openPane(trigger, pane), className, label);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'dialog');
    return trigger;
  }
  const top = element('div', 'zb-bar zb-top');
  const viewControls = element('div', 'zb-tabs');
  const tabs = element('div', 'zb-tablist');
  tabs.setAttribute('role', 'tablist');
  named(tabs, t('views'));
  const actions = createPane(t('viewActions'), 'zb-view-action-list');
  const viewActionsTrigger = tool(t('viewActions'), actions, '⋯', 'zb-tool-icon');
  const renameSlot = element('div');
  renameSlot.hidden = true;
  const newViewPane = createPane(t('newView'), 'zb-view-action-list');
  const addViewButton = tool(t('newView'), newViewPane, '+', 'zb-tool-icon');
  const viewAction = (label: string, run: () => void, className?: string) =>
    button(
      label,
      () => {
        popovers.close(true);
        run();
      },
      className,
    );
  newViewPane.append(
    viewAction(t('newTable'), () => createView(false, 'table')),
    viewAction(t('newBoard'), () => createView(false, 'board')),
  );
  const layoutAction = viewAction(t('switchToBoard'), switchLayout);
  const copyViewButton = viewAction(t('copyView'), () => createView(true));
  const renameViewButton = viewAction(t('renameView'), startViewRename);
  const deleteViewButton = viewAction(t('deleteView'), deleteView, 'zb-danger');
  actions.append(
    viewAction(t('viewSettings'), showColumns),
    layoutAction,
    copyViewButton,
    renameViewButton,
    deleteViewButton,
  );
  viewControls.append(tabs, addViewButton, viewActionsTrigger, renameSlot);
  top.append(viewControls);
  const disposeSync =
    options.sync && options.openPreferences
      ? mountSyncBadge(top, options.sync, options.language, options.openPreferences)
      : undefined;
  if (options.popOut)
    top.append(button('↗', options.popOut, 'zb-popout zb-tool-icon', t('popOut')));
  if (options.openPreferences)
    top.append(button('⚙', options.openPreferences, 'zb-settings zb-tool-icon', t('settings')));
  const panel = element('div', 'zb-panel');
  panel.id = `${mountId}-panel`;
  panel.setAttribute('role', 'tabpanel');
  const toolbar = element('div', 'zb-bar zb-toolbar');
  const scopeSlot = element('label', 'zb-line');
  const sortPane = createPane(t('sort'));
  const filterPane = createPane(t('filters'));
  const groupPane = createPane(t('grouping'));
  const lanePane = createPane(t('lanes'));
  const columnPane = createPane(t('columns'), 'zb-column-pane');
  const columnSearch = input(t('searchColumns'));
  columnSearch.type = 'search';
  columnSearch.className = 'zb-column-search';
  columnSearch.placeholder = t('searchColumns');
  const columnList = element('div', 'zb-pane-list');
  columnPane.append(columnSearch, columnList);
  columnSearch.addEventListener('input', renderColumns);
  const propertyPane = createPane(t('properties'));
  const sortTool = tool(t('sort'), sortPane);
  const filterTool = tool(t('filters'), filterPane);
  const groupTool = tool(t('grouping'), groupPane);
  const laneTool = tool(t('lanes'), lanePane);
  const columnTool = tool(t('columns'), columnPane);
  columnTool.addEventListener('click', () => {
    columnsFromTail = false;
  });
  const propertyTool = tool(t('properties'), propertyPane);
  const density = select(
    t('density'),
    [
      ['compact', t('compact')],
      ['comfortable', t('comfortable')],
      ['wrap', t('wrap')],
    ],
    activeView().density ?? 'compact',
  );
  density.addEventListener('change', () => updateView({ density: density.value as Density }));
  const densityControl = withChevron(density);
  const searchField = element('div', 'zb-search');
  searchField.id = `${mountId}-search`;
  const searchToggle = button(
    '',
    () => {
      if (searchField.hidden) focusSearch();
      else closeSearch();
    },
    'zb-tool-icon zb-search-toggle',
    t('search'),
  );
  searchToggle.hidden = true;
  searchToggle.setAttribute('aria-controls', searchField.id);
  searchToggle.setAttribute('aria-expanded', 'false');
  searchToggle.toggleAttribute('data-filtering', !!searchTerm);
  const search = input(t('search'), restored?.search);
  search.setAttribute('role', 'searchbox');
  search.placeholder = t('search');
  const clearSearchButton = button(
    '×',
    () => {
      search.focus();
      clearSearch();
    },
    'zb-tool-icon',
    t('clearSearch'),
  );
  clearSearchButton.hidden = !search.value;
  searchField.append(search, clearSearchButton);
  top.append(searchToggle);
  const propertyList = element('div');
  const warning = element('div', 'zb-warning zb-line');
  const filterWarning = element('span', 'zb-line');
  const filterWarningText = element('span');
  filterWarningText.setAttribute('role', 'status');
  filterWarning.append(filterWarningText, button(t('removeInvalid'), removeInvalidFilters));
  const groupWarning = element('span', 'zb-line');
  const groupWarningText = element('span');
  groupWarningText.setAttribute('role', 'status');
  groupWarning.append(
    groupWarningText,
    button(t('clearGrouping'), () => setGrouping(undefined)),
  );
  warning.append(filterWarning, groupWarning);
  warning.hidden = true;
  const status = element('p', 'zb-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const retry = button(t('retry'), () => refresh());
  retry.hidden = true;
  toolbar.append(
    scopeSlot,
    sortTool,
    filterTool,
    groupTool,
    laneTool,
    columnTool,
    propertyTool,
    densityControl,
    retry,
    searchField,
  );
  const bulkBar = element('section', 'zb-bulk zb-line');
  named(bulkBar, t('bulkEdit'));
  bulkBar.hidden = true;
  const selectionCount = element('strong');
  selectionCount.setAttribute('aria-live', 'polite');
  const bulkActions = element('fieldset', 'zb-line');
  const [bulkPropertyForm, renderBulkProperty] = buildBulkPropertyForm();
  bulkActions.append(bulkPropertyForm, buildBulkTagForm());
  bulkBar.append(selectionCount, button(t('clearSelection'), clearSelection), bulkActions);
  const tableWrap = element('div', 'zb-table-wrap');
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute('aria-label', t('table'));
  const boardRoot = element('div', 'zb-board');
  const board = createBoard(boardRoot, {
    language: options.language,
    card: (row, card) => boardCards.render(card, row, renderedCardFields, preferences.properties),
    toggle: toggleLane,
    async write(row, property, value) {
      showStatus('');
      try {
        await host.setProperty(row.id, property.key, value);
      } catch (error) {
        showStatus(t('actionError'), true);
        refresh();
        throw error;
      }
    },
    open: openRow,
    properties() {
      openPane(propertyTool, propertyPane);
    },
  });
  const boardCards = createBoardCards(doc, {
    text: t,
    columnName,
    authorFormat: () => globals.authorFormat,
    tagColor: (row, label) => tagColor(row, label),
    linkActions: options.linkActions,
    open: openRow,
    rate(row, property, value) {
      void board.rate(row, property, value).catch(() => {});
    },
  });
  const count = element('div', 'zb-table-status');
  const tagValues = element('datalist');
  tagValues.id = `${mountId}-filter-tags`;
  count.setAttribute('aria-live', 'polite');
  const rowProbe = element('span', 'zb-row-probe');
  rowProbe.setAttribute('aria-hidden', 'true');
  panel.append(toolbar, warning, bulkBar, status, tableWrap, boardRoot, count);
  surface.append(top, panel, tagValues, rowProbe);
  root.append(style, customStyle, surface);
  updateAppearance();
  syncSearchMode();
  narrowWindow?.addEventListener('change', syncSearchMode);
  syncLayout();
  syncDensity();
  search.addEventListener('compositionstart', () => {
    composingSearch = true;
    window?.clearTimeout(searchTimer);
  });
  search.addEventListener('compositionend', () => {
    composingSearch = false;
    queueSearch();
  });
  search.addEventListener('input', queueSearch);
  surface.addEventListener('keydown', captureKeys, true);
  tableWrap.addEventListener('scroll', () => {
    updateFrozenShadow();
    scheduleWindow();
  });
  tableWrap.addEventListener('focusin', gridFocus);
  tableWrap.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !tableWrap.contains(event.relatedTarget as Node)) {
      restoreGridFocus = false;
    }
  });
  tableWrap.addEventListener('click', gridClick, true);
  const resizeObserver =
    window?.ResizeObserver &&
    new window.ResizeObserver((changes) => {
      if (changes.some(({ target }) => target === rowProbe)) rowGeometryDirty = true;
      updateFrozenColumns();
      scheduleWindow();
    });
  resizeObserver?.observe(tableWrap);
  resizeObserver?.observe(rowProbe);
  surface.addEventListener('pointerdown', dismissSearchOutside);
  if (narrowWindow) surface.addEventListener('focusin', dismissSearchOutside);

  function ownsSearch(target: Node | null): boolean {
    return searchToggle.contains(target) || searchField.contains(target);
  }

  function dismissSearchOutside(event: Event): void {
    if (!searchToggle.hidden && !searchField.hidden && !ownsSearch(event.target as Node))
      closeSearch(false);
  }

  function setSearchExpanded(expanded: boolean): void {
    searchField.hidden = !expanded;
    searchToggle.setAttribute('aria-expanded', String(expanded));
  }

  function syncSearchMode(): void {
    const compact = narrowWindow?.matches === true;
    if (searchToggle.hidden === !compact) return;
    const focused = doc.activeElement;
    surface.toggleAttribute('data-compact-search', compact);
    searchToggle.hidden = !compact;
    setSearchExpanded(!compact || searchField.contains(focused));
    if (!compact && focused === searchToggle) focusSearch();
  }

  function focusSearch(): void {
    if (!searchToggle.hidden) setSearchExpanded(true);
    search.focus({ preventScroll: true });
  }

  function closeSearch(restore = true): void {
    if (searchToggle.hidden || searchField.hidden) return;
    setSearchExpanded(false);
    if (restore) searchToggle.focus({ preventScroll: true });
  }

  function updateAppearance(): void {
    surface.dataset.appearance = globals.appearance;
    surface.dataset.authorFormat = globals.authorFormat;
    customStyle.textContent = globals.customCSS ? scopeCustomCSS(globals.customCSS, doc) : '';
  }

  function applyGlobals(next: GlobalPreferences): void {
    const previous = globals;
    globals = next;
    if (previous.appearance !== next.appearance) surface.dataset.appearance = next.appearance;
    if (previous.customCSS !== next.customCSS)
      customStyle.textContent = next.customCSS ? scopeCustomCSS(next.customCSS, doc) : '';
    if (previous.authorFormat !== next.authorFormat) {
      surface.dataset.authorFormat = next.authorFormat;
      recycleEditor?.();
      resetMeasurements = true;
      if (isBoard()) {
        cardRevision++;
        renderBoard();
      } else renderTable();
    } else if (previous.appearance !== next.appearance || previous.customCSS !== next.customCSS) {
      widthGeometryChanged();
    }
  }

  function queueSearch(): void {
    clearSearchButton.hidden = !search.value;
    if (composingSearch) return;
    window?.clearTimeout(searchTimer);
    if (window) searchTimer = window.setTimeout(applySearch, SEARCH_DELAY);
    else applySearch();
  }

  function applySearch(): void {
    const term = search.value.trim();
    if (term === searchTerm) return;
    searchTerm = term;
    searchToggle.toggleAttribute('data-filtering', !!term);
    evaluate(true);
  }

  function clearSearch(): void {
    window?.clearTimeout(searchTimer);
    search.value = '';
    clearSearchButton.hidden = true;
    applySearch();
  }

  function captureKeys(event: KeyboardEvent): void {
    const target = event.target as Element | null;
    if (
      event.defaultPrevented ||
      !target?.closest ||
      event.isComposing ||
      event.keyCode === 229 ||
      composingSearch ||
      event.altKey ||
      event.shiftKey
    )
      return;

    if (event.ctrlKey || event.metaKey) {
      const focused = doc.activeElement;
      if (
        event.ctrlKey === event.metaKey ||
        event.key.toLowerCase() !== 'f' ||
        event.repeat ||
        !focused ||
        !surface.contains(focused) ||
        popovers.isOpen() ||
        (target !== search && target.closest(EDITABLE_KEYS)) ||
        (focused !== search && focused.closest(EDITABLE_KEYS))
      )
        return;
      focusSearch();
      search.select();
    } else if (popovers.isOpen()) {
      if (event.key !== 'Escape' || event.repeat) return;
      if (!popovers.isOpen(columnPane) || !columnSearch.value) {
        popovers.consumeEscape(event);
        return;
      }
      columnSearch.value = '';
      moreColumnsOpen = false;
      renderColumns();
      columnSearch.focus({ preventScroll: true });
    } else if (!handleWorkspaceKey(event, target)) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function handleWorkspaceKey(event: KeyboardEvent, target: Element): boolean {
    if (target.closest('.zb-editor')) {
      if (event.key === 'Escape' && !event.repeat && closeEditor) {
        closeEditor(true);
        return true;
      }
      if (event.key === 'Enter' && event.repeat) return false;
      return editorKey?.(event) ?? false;
    }
    if (tabs.contains(target) && moveViewTab(target, event.key)) return true;
    const boardLayout = isBoard();
    if (boardLayout && board.key(event)) return true;
    const command = tableKeys.handle(event);
    if (!command) return false;
    if (command === 'escape') return escapeWorkspace(target);
    if (boardLayout || (target !== tableWrap && !target.closest('tbody tr[data-row-key]')))
      return false;
    const control = target.closest(`button, input[type=checkbox], a[href], ${EDITABLE_KEYS}`);
    if (
      control &&
      (command === 'activate' ||
        typeof command !== 'string' ||
        !control.classList.contains('zb-group-toggle'))
    )
      return false;
    return runGridCommand(command);
  }

  function escapeWorkspace(target: Element): boolean {
    const inSearch = ownsSearch(target);
    if (!inSearch && target.closest(EDITABLE_KEYS)) return false;
    if (search.value) {
      clearSearch();
      return true;
    }
    if (inSearch && !searchToggle.hidden && !searchField.hidden) {
      closeSearch();
      return true;
    }
    const focused = doc.activeElement as HTMLElement | null;
    const inTable =
      !tableWrap.hidden && tableWrap.contains(target) && focused && tableWrap.contains(focused);
    if (selected.size && (inSearch || inTable)) {
      clearSelection();
      return true;
    }
    if (!inTable) return false;
    restoreGridFocus = false;
    focused.blur();
    return true;
  }

  function syncDensity(): void {
    const index = layout.indexAt(tableWrap.scrollTop);
    const distance = index < 0 ? 0 : tableWrap.scrollTop - layout.offset(index);
    const current = activeView().density ?? 'compact';
    density.value = current;
    if (surface.dataset.density !== current) {
      surface.dataset.density = current;
      rowGeometryDirty = true;
    }
    fitPills();
    layout.setDensity(current);
    if (tableBody) renderWindow(index < 0 ? 0 : layout.offset(index) + distance);
  }

  function fitPills(): void {
    if (!window || fitFrame !== undefined) return;
    fitFrame = window.requestAnimationFrame(() => {
      fitFrame = undefined;
      const table = tableWrap.querySelector('table');
      if (table) cells.fitPills(table);
    });
  }

  function activeView(): View {
    return preferences.views.find((view) => view.id === preferences.active)!;
  }

  function isBoard(view = activeView()): boolean {
    return view.layout === 'board';
  }

  function currentBoard(): BoardSettings {
    return activeView().board ?? defaultBoardSettings(preferences.properties);
  }

  function updateBoard(change: Partial<BoardSettings>): void {
    updateView({ board: { ...currentBoard(), ...change } });
  }

  function switchLayout(): void {
    const view = activeView();
    if (isBoard(view)) updateView({ layout: 'table' });
    else updateView({ layout: 'board', board: currentBoard() });
  }

  function syncLayout(): void {
    const enabled = isBoard();
    surface.dataset.layout = enabled ? 'board' : 'table';
    layoutAction.textContent = t(enabled ? 'switchToTable' : 'switchToBoard');
    const fields = t(enabled ? 'cardFields' : 'columns');
    const fieldSearch = t(enabled ? 'searchCardFields' : 'searchColumns');
    columnTool.textContent = fields;
    named(columnTool, fields);
    columnPane.setAttribute('aria-label', fields);
    named(columnSearch, fieldSearch);
    columnSearch.placeholder = fieldSearch;
    groupTool.hidden = enabled;
    laneTool.hidden = !enabled;
    densityControl.hidden = enabled;
    tableWrap.hidden = enabled;
    boardRoot.hidden = !enabled;
  }

  function showStatus(message: string, error = false): void {
    if (disposed) return;
    status.hidden = !message;
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function scopedName(label: string, context: string): string {
    return `${label} · ${context}`;
  }

  function propertyFor(column: Column): Property | undefined {
    if (!column.startsWith('property:')) return undefined;
    const key = column.slice('property:'.length);
    return preferences.properties.find((property) => property.key === key);
  }

  function defaultColumnWidth(column: Column): number {
    if (isNativeColumn(column)) return NATIVE_COLUMN_BY_KEY[column].defaultWidth;
    switch (propertyFor(column)?.type) {
      case 'rating':
      case 'single-select':
        return 120;
      case 'date':
        return 112;
      case 'url':
        return 160;
      default:
        return 140;
    }
  }

  function allColumns(): Column[] {
    return [
      ...NATIVE_COLUMNS,
      ...preferences.properties.map((property): Column => `property:${property.key}`),
    ];
  }

  function columnName(column: Column): string {
    return isNativeColumn(column)
      ? NATIVE_COLUMN_BY_KEY[column].labels[zh ? 1 : 0]
      : column.slice('property:'.length);
  }

  function columnItems(): [Column, string][] {
    return allColumns().map((column) => [column, columnName(column)]);
  }

  function applySettings(incoming: Preferences, keepFilterInput = false): void {
    const old = preferences;
    const previousView = activeView();
    const changedProperties = !same(old.properties, incoming.properties);
    const changedViews = old.active !== incoming.active || !same(old.views, incoming.views);
    const changedTagColors = !same(old.tagColors, incoming.tagColors);
    if (!changedProperties && !changedViews && !changedTagColors) return;
    preferences = {
      properties: changedProperties ? incoming.properties : old.properties,
      views: changedViews ? incoming.views : old.views,
      active: incoming.active,
      tagColors: changedTagColors ? incoming.tagColors : old.tagColors,
    };
    if (changedTagColors) {
      tagColor = resolveTagColors(preferences.tagColors);
      if (popovers.isOpen(tagColorPane)) refreshTagColorPane();
      if (isBoard()) {
        cardRevision++;
        if (!changedProperties && !changedViews) renderBoard();
      } else repaintPills('tags');
    }
    if (!changedProperties && !changedViews) return;
    if (changedProperties && closeEditor) {
      repaintPills('options');
      updateEditorColors?.();
    }
    const view = activeView();
    const boardLayout = isBoard(view);
    const changedLayout = isBoard(previousView) !== boardLayout;
    const changedBoard = boardLayout && !same(previousView.board, view.board);
    const changedBoardFields =
      changedBoard &&
      (previousView.board?.laneField !== view.board?.laneField ||
        !same(previousView.board?.cardFields, view.board?.cardFields));
    const changedActive = previousView.id !== view.id;
    const changedScope = previousView.scope !== view.scope;
    const changedColumns = !same(previousView.columns, view.columns);
    const changedSort = !same(previousView.sorts, view.sorts);
    const changedFilters = !same(previousView.filters, view.filters);
    const changedGrouping = !same(previousView.group, view.group);
    const changedDensity = previousView.density !== view.density;
    const changedWidths = !same(previousView.columnWidths, view.columnWidths);
    if (changedActive || changedScope || changedGrouping) choosingGroupMember = undefined;
    if (
      changedActive ||
      changedScope ||
      previousView.group?.column !== view.group?.column ||
      (previousView.group?.column === 'tags' &&
        view.group?.column === 'tags' &&
        previousView.group.tag !== view.group.tag) ||
      (previousView.group?.column === 'collections' &&
        view.group?.column === 'collections' &&
        previousView.group.collection !== view.group.collection)
    ) {
      foldedGroups.clear();
    }
    if (changedActive || changedScope || changedFilters || changedLayout) clearSelection();
    if ((changedActive || changedScope || changedLayout) && isBoard(previousView)) board.clear();
    if (changedLayout) {
      popovers.close(false);
      syncLayout();
    }
    if (changedActive) {
      stopViewRename();
      popovers.close(false);
    }
    if (!boardLayout) {
      if (changedActive || changedDensity || changedLayout) syncDensity();
      if (changedActive || changedWidths) updateTableWidths();
      if (previousView.frozenCount !== view.frozenCount) updateFrozenColumns();
    }
    if (changedViews) renderTabs();
    if (changedScope || changedActive) renderScope();
    if (changedProperties) {
      renderProperties();
      renderBulkProperty();
      updatePropertyHint();
    }
    if (changedProperties || changedBoardFields) cardRevision++;
    if (changedColumns || changedProperties || changedActive || changedLayout || changedBoardFields)
      renderColumns();
    if (boardLayout && (changedBoard || changedProperties || changedActive || changedLayout))
      renderLanes();
    if (changedSort || changedProperties || changedActive) renderSort();
    if (changedColumns || changedProperties) resetMeasurements = true;
    if (changedProperties || changedActive || (changedFilters && !keepFilterInput)) renderFilters();
    if (changedProperties || changedActive || changedScope || changedGrouping) renderGrouping();
    const reset =
      changedActive ||
      changedScope ||
      changedSort ||
      changedFilters ||
      changedGrouping ||
      changedLayout;
    if (changedActive || changedScope || changedColumns || changedLayout) recycleEditor?.();
    if (changedActive || changedScope) activeCell = undefined;
    if (reset) tableWrap.scrollTop = 0;
    if (changedScope) {
      refresh();
    } else if (
      changedActive ||
      changedProperties ||
      changedColumns ||
      changedSort ||
      changedFilters ||
      changedGrouping ||
      changedLayout ||
      changedBoardFields
    ) {
      evaluate(reset);
    } else if (boardLayout && (changedBoard || changedTagColors)) {
      renderBoard();
    }
  }

  function syncSettings(): void {
    if (disposed) return;
    const current = host.settings();
    applySettings(
      pendingViews ? { ...current, views: preferences.views, active: preferences.active } : current,
    );
  }

  function saveViews(views: readonly View[], active: string, keepFilterInput = false): void {
    pendingViews++;
    applySettings({ ...preferences, views, active }, keepFilterInput);
    void host
      .change({ kind: 'views', views, active })
      .catch(() => {
        showStatus(t('actionError'), true);
      })
      .finally(() => {
        pendingViews--;
        if (!pendingViews) syncSettings();
      });
  }

  function updateView(change: Partial<View>, keepFilterInput = false): void {
    const id = preferences.active;
    saveViews(
      preferences.views.map((view) => (view.id === id ? { ...view, ...change } : view)),
      id,
      keepFilterInput,
    );
  }

  function selectView(id: string): void {
    if (id !== preferences.active) saveViews(preferences.views, id);
  }

  function displayViewName(view: View): string {
    return view.id === 'default' && view.name === words.defaultView[0]
      ? t('defaultView')
      : view.name;
  }

  function createView(copy: boolean, viewLayout: ViewLayout = 'table'): void {
    const source = activeView();
    const name = copy ? `${displayViewName(source)} (${t('copySuffix')})` : t('newView');
    let unique = name;
    for (
      let suffix = 2;
      preferences.views.some((view) => displayViewName(view) === unique);
      suffix++
    ) {
      unique = `${name} ${suffix}`;
    }
    let id: string;
    do {
      id = `view-${Date.now().toString(36)}-${++nextId}`;
    } while (preferences.views.some((view) => view.id === id));
    const view: View = copy
      ? { ...source, name: unique, id }
      : createViewDefaults(
          {
            name: unique,
            id,
            scope: host.initialScope(),
            layout: viewLayout,
            density: globals.defaultDensity,
          },
          preferences.properties,
        );
    saveViews([...preferences.views, view], id);
  }

  function deleteView(): void {
    const { views, active } = preferences;
    if (views.length < 2) return;
    const index = views.findIndex((view) => view.id === active);
    const remaining = views.filter((view) => view.id !== active);
    saveViews(remaining, remaining[Math.min(index, remaining.length - 1)]!.id);
  }

  function stopViewRename(): void {
    renameViewId = undefined;
    renameSlot.replaceChildren();
    renameSlot.hidden = true;
  }

  function startViewRename(): void {
    const view = activeView();
    if (renameViewId === view.id) {
      renameSlot.querySelector('input')?.focus();
      return;
    }
    renameViewId = view.id;
    const name = displayViewName(view);
    const field = input(t('viewName'), name);
    renameSlot.hidden = false;
    renameSlot.replaceChildren(field);
    editByEnterOrBlur(field, (value, refocus) => {
      if (renameViewId !== view.id) return;
      stopViewRename();
      if (value?.trim() && value.trim() !== name) updateView({ name: value.trim() });
      if (refocus) viewActionsTrigger.focus();
    });
    field.focus();
    field.select();
  }

  function moveViewTab(tab: Element, key: string): boolean {
    if (!tab.matches('[role=tab]')) return false;
    const views = preferences.views;
    const index = views.findIndex(({ id }) => id === (tab as HTMLElement).dataset.focus);
    if (index < 0) return false;
    let target: number;
    if (key === 'ArrowRight') target = (index + 1) % views.length;
    else if (key === 'ArrowLeft') target = (index + views.length - 1) % views.length;
    else if (key === 'Home') target = 0;
    else if (key === 'End') target = views.length - 1;
    else return false;
    selectView(views[target]!.id);
    (tabs.children[target] as HTMLElement).focus();
    return true;
  }

  function renderTabs(): void {
    const views = preferences.views;
    preserveFocus(tabs, () => {
      tabs.replaceChildren(
        ...views.map((view, index) => {
          const tab = button(displayViewName(view), () => selectView(view.id));
          const selected = view.id === preferences.active;
          tab.id = `${mountId}-tab-${index}`;
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-controls', panel.id);
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
          focusKey(tab, view.id);
          if (selected) panel.setAttribute('aria-labelledby', tab.id);
          return tab;
        }),
      );
    });
    deleteViewButton.disabled = views.length === 1;
  }

  function showColumns(): void {
    columnTool.click();
  }

  function renderScope(): void {
    const scope = activeView().scope;
    const items = host
      .scopes()
      .map(({ id, label }): [string, string] => [id, id === 'all' ? t('allLibraries') : label]);
    if (!items.some(([id]) => id === scope)) items.push([scope, t('unavailable')]);
    const current = scopeSlot.querySelector('select');
    if (
      current?.value === scope &&
      current.length === items.length &&
      items.every(
        ([id, label], index) =>
          current.options[index]?.value === id && current.options[index]?.text === label,
      )
    )
      return;
    preserveFocus(scopeSlot, () => {
      const field = select(t('scope'), items, scope);
      focusKey(field, 'scope');
      field.addEventListener('change', () => updateView({ scope: field.value }));
      scopeSlot.replaceChildren(element('span', '', t('scope')), withChevron(field));
    });
  }

  function availableColumn(column: Column): boolean {
    return !column.startsWith('property:') || !!propertyFor(column);
  }

  function visibleColumns(): Column[] {
    return activeView().columns.filter(availableColumn);
  }

  // Leave unavailable definitions in their existing slots in case they are restored.
  function reorderColumns(visible: readonly Column[]): void {
    let index = 0;
    updateView({
      columns: activeView().columns.map((column) =>
        availableColumn(column) ? visible[index++]! : column,
      ),
    });
  }

  function moveColumn(column: Column, to: number): void {
    const columns = visibleColumns();
    const from = columns.indexOf(column);
    if (from < 0 || to < 0 || to >= columns.length || to === from) return;
    columns.splice(from, 1);
    columns.splice(to, 0, column);
    reorderColumns(columns);
  }

  function showColumn(column: Column, show: boolean): void {
    const columns = activeView().columns;
    if (columns.includes(column) === show || (!show && visibleColumns().length <= 1)) return;
    updateView({
      columns: show ? [...columns, column] : columns.filter((entry) => entry !== column),
    });
  }

  function reorderCardFields(visible: readonly Column[]): void {
    const settings = currentBoard();
    const editable = new Set(boardCardFields(settings, preferences.properties));
    let index = 0;
    updateBoard({
      cardFields: settings.cardFields.map((column) =>
        editable.has(column) ? visible[index++]! : column,
      ),
    });
  }

  function renderLanes(): void {
    preserveFocus(lanePane, () => {
      const settings = currentBoard();
      const properties = laneProperties(preferences.properties);
      const property = boardLaneProperty(settings, preferences.properties);
      const fields = properties.map(({ key }) => [`property:${key}`, key] as const);
      const picker = select(t('laneField'), fields, property ? `property:${property.key}` : '');
      picker.disabled = !fields.length;
      focusKey(picker, 'lane-field');
      picker.addEventListener('change', () => {
        const field = fields.find(([key]) => key === picker.value)?.[0];
        if (field) updateBoard({ laneField: field, collapsedLanes: [] });
      });
      const hide = input(t('hideEmptyLanes'));
      hide.type = 'checkbox';
      hide.checked = settings.hideEmptyLanes;
      focusKey(hide, 'hide-empty');
      hide.addEventListener('change', () => updateBoard({ hideEmptyLanes: hide.checked }));
      const hideLabel = element('label', 'zb-line');
      hideLabel.append(hide, t('hideEmptyLanes'));
      const expand = button(t('expandLanes'), () => updateBoard({ collapsedLanes: [] }));
      const collapse = button(t('collapseLanes'), () => {
        if (!property) return;
        const lanes = boardLanes(result?.rows ?? [], property, {
          ...settings,
          hideEmptyLanes: false,
        });
        updateBoard({ collapsedLanes: lanes.map(({ id }) => id) });
      });
      expand.disabled = !property;
      collapse.disabled = !property;
      focusKey(expand, 'expand-lanes');
      focusKey(collapse, 'collapse-lanes');
      const controls = element('div', 'zb-line');
      controls.append(expand, collapse);
      lanePane.replaceChildren(withChevron(picker), hideLabel, controls);
    });
  }

  function toggleLane(id: string): void {
    const { collapsedLanes } = currentBoard();
    updateBoard({
      collapsedLanes: collapsedLanes.includes(id)
        ? collapsedLanes.filter((lane) => lane !== id)
        : [...collapsedLanes, id],
    });
  }

  function moveButton(
    label: string,
    arrow: string,
    context: string,
    enabled: boolean,
    run: () => void,
  ): HTMLButtonElement {
    const control = button(arrow, run, 'zb-order-button', scopedName(label, context));
    control.disabled = !enabled;
    return control;
  }

  function renderColumns(): void {
    preserveFocus(
      columnList,
      () => {
        const boardLayout = isBoard();
        const settings = boardLayout ? currentBoard() : undefined;
        const lane = settings && boardLaneProperty(settings, preferences.properties);
        const visible = settings
          ? boardCardFields(settings, preferences.properties)
          : visibleColumns();
        const defaults = allColumns().filter(
          (column) => !settings || (column !== 'title' && column !== `property:${lane?.key}`),
        );
        const reorder = settings ? reorderCardFields : reorderColumns;
        const move = (column: Column, index: number, to: number) => {
          if (!settings) {
            moveColumn(column, to);
            return;
          }
          const fields = [...visible];
          fields.splice(index, 1);
          fields.splice(to, 0, column);
          reorderCardFields(fields);
        };
        const ordered = new Map(visible.map((column, index) => [column, index]));
        const term = columnSearch.value.trim().normalize('NFC').toLowerCase();
        const matches = (label: string) => label.normalize('NFC').toLowerCase().includes(term);
        const byGroup: Record<'common' | 'custom' | 'more', Column[]> = {
          common: [],
          custom: [],
          more: [],
        };
        for (const column of [...visible, ...defaults.filter((key) => !ordered.has(key))]) {
          const definition = isNativeColumn(column) ? NATIVE_COLUMN_BY_KEY[column] : undefined;
          if (term && !matches(column) && !definition?.labels.some(matches)) continue;
          byGroup[definition?.group ?? 'custom'].push(column);
        }
        const sections: HTMLElement[] = [];
        for (const [key, heading] of [
          ['common', t('commonColumns')],
          ['custom', t('customColumns')],
          ['more', t('moreColumns')],
        ] as const) {
          const columns = byGroup[key];
          if (term && !columns.length) continue;
          const section = element('section', 'zb-column-group');
          section.dataset.columnGroup = key;
          const list = element('div', 'zb-pane-list');
          list.id = `${mountId}-columns-${key}`;
          if (key === 'more') {
            const expanded = !!term || moreColumnsOpen;
            const toggle = !term
              ? button(
                  `${expanded ? '▾' : '▸'} ${heading}`,
                  () => {
                    moreColumnsOpen = !moreColumnsOpen;
                    renderColumns();
                  },
                  'zb-column-group-trigger',
                  heading,
                )
              : undefined;
            if (toggle) {
              focusKey(toggle, 'more-columns');
              toggle.setAttribute('aria-expanded', String(expanded));
              toggle.setAttribute('aria-controls', list.id);
              section.append(toggle);
            } else {
              section.append(element('strong', '', heading));
            }
            list.hidden = !expanded;
          } else {
            section.append(element('strong', '', heading));
          }
          if (!columns.length)
            list.append(element('span', 'zb-column-empty', t('noCustomColumns')));
          for (const column of columns) {
            const index = ordered.get(column);
            const row = element('div', 'zb-line zb-column-rule');
            const label = element('label', 'zb-line');
            const caption = columnName(column);
            const check = element('input');
            check.type = 'checkbox';
            check.checked = index !== undefined;
            check.disabled = !settings && check.checked && visible.length === 1;
            focusKey(check, column);
            check.addEventListener('change', () => {
              if (!settings) showColumn(column, check.checked);
              else {
                const fields = currentBoard().cardFields;
                updateBoard({
                  cardFields: check.checked
                    ? [...fields, column]
                    : fields.filter((field) => field !== column),
                });
              }
            });
            label.append(check, createFieldIcon(doc, column, propertyFor(column)?.type), caption);
            if (index !== undefined) {
              const rank = element('span', 'zb-column-position', `#${index + 1}`);
              rank.setAttribute('aria-hidden', 'true');
              label.append(rank);
            }
            row.append(label);
            if (index !== undefined) {
              const up = moveButton(t('moveUp'), '↑', caption, index > 0, () =>
                move(column, index, index - 1),
              );
              const down = moveButton(t('moveDown'), '↓', caption, index + 1 < visible.length, () =>
                move(column, index, index + 1),
              );
              focusKey(up, `up:${column}`);
              focusKey(down, `down:${column}`);
              row.append(up, down);
            }
            list.append(row);
          }
          section.append(list);
          sections.push(section);
        }
        const defaultOrder = (
          settings
            ? [
                ...new Set([
                  ...defaultBoardSettings(preferences.properties).cardFields,
                  ...defaults,
                ]),
              ]
            : defaults
        ).filter((column) => ordered.has(column));
        const reset = button(t('resetOrder'), () => reorder(defaultOrder));
        focusKey(reset, 'reset-order');
        reset.disabled = same(visible, defaultOrder);
        if (!sections.length)
          sections.push(
            element(
              'p',
              'zb-column-empty',
              t(boardLayout ? 'noCardFieldMatches' : 'noColumnMatches'),
            ),
          );
        columnList.replaceChildren(...sections, reset);
      },
      columnPane,
    );
  }

  function setSort(column: Column, direction: Direction, primary = false): void {
    const sorts = [...activeView().sorts];
    const from = sorts.findIndex((rule) => rule.column === column);
    const rule = { column, direction };
    if (primary) {
      if (from >= 0) sorts.splice(from, 1);
      sorts.unshift(rule);
    } else if (from >= 0) {
      sorts[from] = rule;
    } else {
      sorts.push(rule);
    }
    updateView({ sorts });
  }

  function removeSort(column: Column): void {
    updateView({ sorts: activeView().sorts.filter((rule) => rule.column !== column) });
  }

  function renderSort(): void {
    preserveFocus(sortPane, () => {
      const sorts = activeView().sorts;
      const taken = new Set(sorts.map(({ column }) => column));
      const fields = columnItems();
      const free = fields.find(([column]) => !taken.has(column));
      const list = element('div', 'zb-pane-list');
      for (const [index, rule] of sorts.entries()) {
        const row = element('div', 'zb-line zb-sort-rule');
        const context = String(index + 1);
        const caption = columnName(rule.column);
        const items = fields.filter(([column]) => column === rule.column || !taken.has(column));
        if (!availableColumn(rule.column))
          items.push([rule.column, `${caption} (${t('unavailable')})`]);
        const field = select(scopedName(t('sortField'), context), items, rule.column);
        focusKey(field, `field:${index}`);
        field.addEventListener('change', () => {
          const next = [...sorts];
          next[index] = { ...rule, column: field.value as Column };
          updateView({ sorts: next });
        });
        const direction = select(
          scopedName(t('direction'), context),
          [
            ['asc', t('asc')],
            ['desc', t('desc')],
          ],
          rule.direction,
        );
        focusKey(direction, `direction:${rule.column}`);
        direction.addEventListener('change', () =>
          setSort(rule.column, direction.value as Direction),
        );
        const move = (step: number): void => {
          const next = [...sorts];
          [next[index], next[index + step]] = [next[index + step]!, rule];
          updateView({ sorts: next });
        };
        const up = moveButton(t('moveUp'), '↑', caption, index > 0, () => move(-1));
        const down = moveButton(t('moveDown'), '↓', caption, index + 1 < sorts.length, () =>
          move(1),
        );
        const remove = button(
          '×',
          () => removeSort(rule.column),
          'zb-order-button',
          scopedName(t('removeSort'), caption),
        );
        focusKey(up, `up:${rule.column}`);
        focusKey(down, `down:${rule.column}`);
        focusKey(remove, `remove:${rule.column}`);
        row.append(
          element('span', 'zb-sort-priority', context),
          withChevron(field),
          withChevron(direction),
          up,
          down,
          remove,
        );
        list.append(row);
      }
      const add = button(t('addSort'), () => {
        if (free) setSort(free[0], 'asc');
      });
      add.disabled = !free;
      focusKey(add, 'add-sort');
      const clear = button(t('clearSort'), () => updateView({ sorts: [] }));
      clear.disabled = !sorts.length;
      focusKey(clear, 'clear-sort');
      const controls = element('div', 'zb-line');
      controls.append(add, clear);
      sortPane.replaceChildren(list, controls);
    });
  }

  function updateBadge(trigger: HTMLButtonElement, label: string, count: number): void {
    const previous = trigger.lastElementChild;
    if (count) {
      const badge = previous ?? element('span', 'zb-tool-badge');
      badge.textContent = String(count);
      badge.setAttribute('aria-hidden', 'true');
      if (!previous) trigger.append(badge);
    } else {
      previous?.remove();
    }
    trigger.setAttribute('aria-label', count ? `${label} ${count}` : label);
  }

  function openColumnMenu(trigger: HTMLButtonElement, column: Column): void {
    if (trigger.getAttribute('aria-expanded') === 'true') {
      popovers.close(true);
      return;
    }
    const view = activeView();
    const caption = columnName(column);
    headerMenu.setAttribute('aria-label', scopedName(t('columnMenu'), caption));
    const action = (label: string, run: () => void, enabled = true) => {
      const control = button(label, () => {
        popovers.close(true);
        run();
      });
      control.disabled = !enabled;
      return control;
    };
    const rule = view.sorts.find((entry) => entry.column === column);
    const sorting = [
      action(t('sortAsc'), () => setSort(column, 'asc', true)),
      action(t('sortDesc'), () => setSort(column, 'desc', true)),
    ];
    if (rule) {
      sorting.push(
        action(t('toggleSort'), () => setSort(column, rule.direction === 'asc' ? 'desc' : 'asc')),
        action(t('removeSort'), () => removeSort(column)),
      );
    } else {
      sorting.push(
        action(
          t('secondarySort'),
          () => setSort(column, 'asc'),
          view.sorts.some((entry) => availableColumn(entry.column)),
        ),
      );
    }
    const visible = visibleColumns();
    const index = visible.indexOf(column);
    const rtl = window?.getComputedStyle(trigger).direction === 'rtl';
    const left = index + (rtl ? 1 : -1);
    const right = index + (rtl ? -1 : 1);
    const neighbor = (step: number) => step >= 0 && step < visible.length;
    const columns = [
      action(t('moveLeft'), () => moveColumn(column, left), neighbor(left)),
      action(t('moveRight'), () => moveColumn(column, right), neighbor(right)),
      action(
        t('resetWidth'),
        () => setColumnWidth(column, defaultColumnWidth(column)),
        view.columnWidths?.[column] !== undefined,
      ),
      action(
        t('hideColumn'),
        () => {
          showColumn(column, false);
          const next = visible[index + 1] ?? visible[index - 1]!;
          (headerTrigger(next) ?? columnTool).focus({ preventScroll: true });
        },
        visible.length > 1,
      ),
    ];
    columns.push(action(t('freezeThrough'), () => updateView({ frozenCount: index + 1 })));
    if (view.frozenCount)
      columns.push(action(t('unfreezeColumns'), () => updateView({ frozenCount: 0 })));
    const property = propertyFor(column);
    if (property) {
      columns.push(
        button(t('editProperty'), () => {
          const field = Array.from(
            propertyList.querySelectorAll<HTMLElement>('[data-property]'),
          ).find((block) => block.dataset.property === property.key);
          popovers.open(propertyTool, propertyPane, {
            initialFocus: () =>
              field?.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
              field?.querySelector<HTMLElement>('[data-property-heading]') ??
              firstControl(propertyPane),
            returnFocus: () => headerTrigger(column) ?? propertyTool,
          });
          field?.scrollIntoView?.({ block: 'nearest' });
        }),
      );
    }
    if (column === 'tags') {
      columns.push(
        button(t('tagColors'), () => {
          refreshTagColorPane();
          popovers.close(false);
          popovers.open(trigger, tagColorPane, {
            initialFocus: () => tagColorPane.querySelector('input'),
          });
        }),
      );
    }
    headerMenu.replaceChildren(...sorting, element('hr'), ...columns);
    openPane(trigger, headerMenu);
  }

  function headerTrigger(column: Column): HTMLButtonElement | undefined {
    return Array.from(tableWrap.querySelectorAll<HTMLButtonElement>('[data-header-column]')).find(
      (trigger) => trigger.dataset.headerColumn === column,
    );
  }

  function setGrouping(group: Grouping | undefined): void {
    choosingGroupMember = undefined;
    if (!same(activeView().group, group)) updateView({ group });
    else renderGrouping();
  }

  function renderGrouping(): void {
    renderRegion(groupPane, () => {
      const view = activeView();
      const group = view.group;
      const column = choosingGroupMember ?? group?.column ?? '';
      const items: [Grouping['column'] | '', string][] = [['', t('noGrouping')]];
      for (const { key, grouping } of NATIVE_COLUMN_DEFINITIONS) {
        if (grouping) items.push([key, columnName(key)]);
      }
      for (const property of preferences.properties) {
        if (isGroupProperty(property)) items.push([`property:${property.key}`, property.key]);
      }
      if (column && !items.some(([value]) => value === column))
        items.push([column, `${columnName(column)} (${t('unavailable')})`]);

      const controls = element('div', 'zb-line');
      const by = select(t('groupBy'), items, column);
      focusKey(by, 'group');
      by.addEventListener('change', () => {
        const column = items.find(([value]) => value === by.value)?.[0];
        if (column === 'tags' || column === 'collections') {
          choosingGroupMember = column;
          renderGrouping();
          groupPane.querySelector<HTMLElement>('[data-focus="group-member"]')?.focus();
        } else {
          setGrouping(column ? { column, direction: group?.direction ?? 'asc' } : undefined);
        }
      });
      const byLabel = element('label', 'zb-line');
      byLabel.append(t('groupBy'), withChevron(by));
      controls.append(byLabel);

      if (column === 'tags') {
        const field = input(t('groupTag'), group?.column === 'tags' ? group.tag : '');
        field.placeholder = t('chooseTag');
        field.dataset.keepFocus = '';
        focusKey(field, 'group-member');
        const suggestions = element('datalist');
        suggestions.id = `${mountId}-group-tags`;
        suggestTags(field, suggestions);
        const commit = (): void => {
          if (!field.isConnected) return;
          const current = activeView();
          if (current.id !== view.id || current.scope !== view.scope) return;
          if (choosingGroupMember !== 'tags' && current.group?.column !== 'tags') return;
          const tag = catalog?.tags.has(field.value) ? field.value : field.value.trim();
          if (!catalog?.tags.has(tag)) return;
          const next = {
            column: 'tags',
            tag,
            direction: current.group?.direction ?? 'asc',
          } as const;
          if (same(current.group, next)) return;
          delete field.dataset.keepFocus;
          setGrouping(next);
        };
        field.addEventListener('change', () => void Promise.resolve().then(commit));
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.isComposing) commit();
        });
        controls.append(field, suggestions);
      } else if (column === 'collections') {
        const field = valuePicker(
          t('groupCollection'),
          collectionNames(),
          group?.column === 'collections' ? group.collection : '',
        );
        focusKey(field, 'group-member');
        field.addEventListener('change', () => {
          if (!catalog?.collections?.has(field.value)) return;
          setGrouping({
            column,
            collection: field.value,
            direction: activeView().group?.direction ?? 'asc',
          });
        });
        controls.append(withChevron(field));
      }
      if (group && !choosingGroupMember) {
        const direction = select(
          t('groupDirection'),
          [
            ['asc', t('asc')],
            ['desc', t('desc')],
          ],
          group.direction,
        );
        focusKey(direction, 'group-direction');
        direction.addEventListener('change', () => {
          const current = activeView().group;
          if (current)
            setGrouping({ ...current, direction: direction.value === 'desc' ? 'desc' : 'asc' });
        });
        controls.append(withChevron(direction));
      }
      groupPane.replaceChildren(controls);
    });
  }

  function collectionNames(): string[] {
    return [...(catalog?.collections ?? [])].sort((a, b) => a.localeCompare(b, options.language));
  }

  function valuePicker(label: string, values: readonly string[], value: string): HTMLSelectElement {
    const choices: [string, string][] = [['', t('chooseValue')]];
    for (const entry of values) choices.push([entry, entry]);
    if (value && !values.includes(value)) choices.push([value, `${value} (${t('unavailable')})`]);
    return select(label, choices, value);
  }

  function defaultOperand(column: Column, operator: Operator): string {
    if (operator === 'has' || operator === 'missing') return '';
    if (
      (isNativeColumn(column) && NATIVE_COLUMN_BY_KEY[column].valueType === 'boolean') ||
      propertyFor(column)?.type === 'checkbox'
    )
      return 'true';
    return '';
  }

  function defaultFilter(column: Column): Filter {
    const operators = filterOperators(column, preferences.properties);
    const operator = operators.includes('has') ? 'has' : operators[0]!;
    return { column, operator, value: defaultOperand(column, operator) };
  }

  function replaceFilter(index: number, filter: Filter, keepFilterInput = false): void {
    const filters = [...activeView().filters];
    filters[index] = filter;
    updateView({ filters }, keepFilterInput);
  }

  function renderFilters(): void {
    renderRegion(filterPane, () => {
      const view = activeView();
      const heading = element('strong', '', t('filterAnd'));
      const list = element('div', 'zb-pane-list');
      for (const [index, filter] of view.filters.entries()) {
        const line = element('div', 'zb-line');
        const context = String(index + 1);
        const items = columnItems();
        if (!items.some(([column]) => column === filter.column)) {
          items.push([filter.column, `${columnName(filter.column)} (${t('unavailable')})`]);
        }
        const column = select(scopedName(t('filterColumn'), context), items, filter.column);
        focusKey(column, `column:${index}`);
        column.addEventListener('change', () =>
          replaceFilter(index, defaultFilter(column.value as Column)),
        );
        const rawOperators = filterOperators(filter.column, preferences.properties);
        const operatorName = (operator: Operator): string =>
          filter.column === 'collections'
            ? t(
                operator === 'contains'
                  ? 'belongs'
                  : operator === 'notContains'
                    ? 'notBelongs'
                    : operator,
              )
            : t(operator);
        const operators = rawOperators.map((operator): [Operator, string] => [
          operator,
          operatorName(operator),
        ]);
        if (!rawOperators.includes(filter.operator)) {
          operators.push([
            filter.operator,
            `${operatorName(filter.operator)} (${t('unavailable')})`,
          ]);
        }
        const operand = select(
          scopedName(t('filterOperator'), context),
          operators,
          filter.operator,
        );
        focusKey(operand, `operator:${index}`);
        operand.addEventListener('change', () => {
          const operator = operand.value as Operator;
          replaceFilter(index, {
            column: filter.column,
            operator,
            value: defaultOperand(filter.column, operator),
          });
        });
        line.append(withChevron(column), withChevron(operand));
        if (filter.operator !== 'has' && filter.operator !== 'missing') {
          const field = filterValueInput(filter, context);
          let current = filter;
          field.addEventListener(field.localName === 'select' ? 'change' : 'input', () => {
            const latest = activeView();
            if (
              latest.id !== view.id ||
              !same(latest.filters[index], current) ||
              current.value === field.value
            )
              return;
            current = { ...current, value: field.value };
            replaceFilter(index, current, true);
          });
          focusKey(field, `value:${index}`);
          line.append(
            field.localName === 'select' ? withChevron(field as HTMLSelectElement) : field,
          );
        }
        const remove = button(
          t('removeFilter'),
          () => {
            updateView({ filters: activeView().filters.filter((_, at) => at !== index) });
          },
          '',
          scopedName(t('removeFilter'), context),
        );
        focusKey(remove, `remove:${index}`);
        line.append(remove);
        list.append(line);
      }
      const add = button(t('addFilter'), () => {
        updateView({ filters: [...activeView().filters, defaultFilter('title')] });
      });
      focusKey(add, 'add');
      filterPane.replaceChildren(heading, list, add);
    });
  }

  function filterValueInput(filter: Filter, context: string): HTMLInputElement | HTMLSelectElement {
    const { column, value } = filter;
    const label = scopedName(t('filterValue'), context);
    const property = propertyFor(column);
    const type = isNativeColumn(column) ? NATIVE_COLUMN_BY_KEY[column].valueType : property?.type;
    if (type === 'boolean' || type === 'checkbox') {
      const items: [string, string][] = [
        ['true', t('yes')],
        ['false', t('no')],
      ];
      if (!items.some(([id]) => id === value)) items.unshift([value, t('chooseValue')]);
      return select(label, items, value);
    }
    if (column === 'collections') return valuePicker(label, collectionNames(), value);
    if (type === 'rating') {
      const items: [string, string][] = [['', t('chooseValue')]];
      for (const rating of RATING_VALUES) items.push([rating, ratingLabel(rating)]);
      if (value && !items.some(([id]) => id === value))
        items.push([value, `${value} (${t('unavailable')})`]);
      return select(label, items, value);
    }
    if (property && isSelectProperty(property.type))
      return valuePicker(label, property.options ?? [], value);
    const field = input(label, value);
    field.dataset.keepFocus = '';
    if (type === 'number') field.inputMode = 'decimal';
    if (type === 'date') field.placeholder = 'YYYY-MM-DD';
    if (column === 'tags') suggestTags(field, tagValues);
    return field;
  }

  function removeInvalidFilters(): void {
    if (!result?.invalid.length) return;
    const invalid = new Set(result.invalid);
    updateView({ filters: activeView().filters.filter((_, index) => !invalid.has(index)) });
  }

  function editByEnterOrBlur(
    field: HTMLInputElement,
    finish: (value: string | null, refocus: boolean) => void,
  ): void {
    let finished = false;
    function end(value: string | null, refocus: boolean): void {
      if (finished || disposed) return;
      finished = true;
      finish(value, refocus);
    }
    field.addEventListener('blur', () => end(field.value, false));
    field.addEventListener('keydown', (event) => {
      if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
      event.preventDefault();
      event.stopPropagation();
      end(event.key === 'Escape' ? null : field.value, true);
    });
  }

  function buildPropertyForm(): [HTMLFormElement, () => void] {
    const form = element('form', 'zb-line');
    const key = input(t('propertyKey'));
    key.placeholder = t('propertyKey');
    key.required = true;
    const hint = element('span', 'zb-line');
    const explanation = element('span');
    explanation.setAttribute('role', 'status');
    const suggestion = button(
      '',
      () => {
        const candidate = host.suggestPropertyKey(key.value, preferences.properties);
        if (!candidate) return;
        key.value = candidate;
        updateHint();
        key.focus();
      },
      'zb-key-hint',
    );
    function updateHint(): void {
      const candidate = key.value.trim()
        ? host.suggestPropertyKey(key.value, preferences.properties)
        : undefined;
      hint.hidden = !candidate;
      explanation.textContent = candidate ? t('reservedKey') : '';
      suggestion.textContent = candidate ? `${t('useKey')} “${candidate}”` : '';
    }
    hint.hidden = true;
    hint.append(explanation, suggestion);
    key.addEventListener('input', updateHint);
    const type = select(
      t('propertyType'),
      PROPERTY_TYPES.map((entry) => [entry, t(entry)]),
      'text',
    );
    const values = element('textarea');
    named(values, t('propertyOptions'));
    values.placeholder = t('propertyOptions');
    values.rows = 2;
    values.hidden = true;
    type.addEventListener('change', () => {
      values.hidden = !isSelectProperty(type.value as PropertyType);
    });
    const submit = element('button', '', t('addProperty'));
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = key.value.trim();
      if (!name || submit.disabled) return;
      if (
        preferences.properties.some((property) => property.key.toLowerCase() === name.toLowerCase())
      ) {
        showStatus(t('propertyError'), true);
        return;
      }
      const propertyType = type.value as PropertyType;
      const startingValues = values.value;
      const property: Property = isSelectProperty(propertyType)
        ? {
            key: name,
            type: propertyType,
            options: startingValues
              .split(/\r?\n/u)
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : { key: name, type: propertyType };
      submit.disabled = true;
      void changeProperty({ kind: 'define', property }).then((saved) => {
        if (disposed) return;
        submit.disabled = false;
        if (saved && key.value.trim() === name && values.value === startingValues) {
          key.value = '';
          values.value = '';
          updateHint();
        }
      });
    });
    form.append(key, hint, withChevron(type), values, submit);
    return [form, updateHint];
  }

  async function changeProperty(
    change: Exclude<ConfigChange, { kind: 'views' }>,
  ): Promise<boolean> {
    showStatus('');
    try {
      const summary = await host.change(change);
      syncSettings();
      if (change.kind === 'rename-option' || ('clean' in change && change.clean))
        showSummary(summary);
      return true;
    } catch {
      showStatus(
        t(
          change.kind === 'define' || change.kind === 'rename-option'
            ? 'propertyError'
            : 'actionError',
        ),
        true,
      );
      return false;
    }
  }

  function showSummary({ changed, skipped }: MutationResult): void {
    showStatus(
      zh
        ? `已更新 ${changed} 条，跳过 ${skipped} 条。`
        : `Updated ${changed} items; skipped ${skipped}.`,
    );
  }

  function toggleDelete(key: string, value?: string): void {
    if (deleteChoice?.key === key && deleteChoice.option === value) deleteChoice = undefined;
    else deleteChoice = value === undefined ? { key } : { key, option: value };
    renderProperties();
  }

  function deleteActions(key: string, value?: string): HTMLElement {
    const actions = element('div', 'zb-line');
    const remove = (clean: boolean): void => {
      deleteChoice = undefined;
      renderProperties();
      void changeProperty(
        value === undefined
          ? { kind: 'delete-property', key, clean }
          : {
              kind: 'delete-option',
              key,
              option: value,
              clean,
            },
      );
    };
    const context = value === undefined ? key : `${key}: ${value}`;
    actions.append(
      button(
        t('definitionOnly'),
        () => remove(false),
        '',
        scopedName(t('definitionOnly'), context),
      ),
      button(
        t('deleteClean'),
        () => remove(true),
        'zb-danger',
        scopedName(t('deleteClean'), context),
      ),
      button(t('cancel'), () => toggleDelete(key, value)),
    );
    return actions;
  }

  function renderProperties(): void {
    renderRegion(propertyList, () => {
      const properties = doc.createDocumentFragment();
      for (const property of preferences.properties) {
        const { key, type } = property;
        const block = element('div', 'zb-property');
        block.dataset.property = key;
        const heading = element('div', 'zb-line');
        const remove = button(
          t('deleteProperty'),
          () => toggleDelete(key),
          'zb-danger',
          scopedName(t('deleteProperty'), key),
        );
        focusKey(remove, JSON.stringify(['property', key]));
        const title = element('strong', '', key);
        title.dataset.propertyHeading = '';
        title.tabIndex = -1;
        heading.append(title, element('span', '', t(type)), remove);
        block.append(heading);
        if (deleteChoice?.key === key && deleteChoice.option === undefined)
          block.append(deleteActions(key));
        if (isSelectProperty(type)) {
          for (const label of property.options ?? [])
            block.append(renderPropertyOption(property, label));
          block.append(buildOptionForm(property));
        }
        properties.append(block);
      }
      propertyList.replaceChildren(properties);
    });
  }

  function renderPropertyOption(property: Property, label: string): HTMLElement {
    const { key } = property;
    const line = element('div', 'zb-line zb-property-option');
    const context = `${key}: ${label}`;
    const rename = button(
      label,
      () => {
        const field = input(scopedName(t('optionName'), context), label);
        field.dataset.keepFocus = '';
        editByEnterOrBlur(field, (value, refocus) => {
          field.replaceWith(rename);
          if (refocus) rename.focus();
          const nextLabel = value?.trim();
          if (nextLabel && nextLabel !== label) {
            void changeProperty({ kind: 'rename-option', key, previous: label, next: nextLabel });
          }
        });
        rename.replaceWith(field);
        field.focus();
        field.select();
      },
      '',
      scopedName(t('renameOption'), context),
    );
    focusKey(rename, JSON.stringify(['rename', key, label]));
    const remove = button(
      t('deleteOption'),
      () => toggleDelete(key, label),
      'zb-danger',
      scopedName(t('deleteOption'), context),
    );
    focusKey(remove, JSON.stringify(['option', key, label]));
    line.append(rename, remove);
    const palette = colorPalette(
      t('optionColor'),
      context,
      () => optionColor(property.key, label),
      (color) => setOptionColor(property.key, label, color),
    );
    for (const swatch of palette.node.querySelectorAll('button')) {
      focusKey(swatch, JSON.stringify(['color', key, label, swatch.dataset.tone]));
    }
    line.append(palette.node);
    if (deleteChoice?.key === key && deleteChoice.option === label)
      line.append(deleteActions(key, label));
    return line;
  }

  function optionColor(key: string, label: string): OptionColorKey | undefined {
    const colors = preferences.properties.find((property) => property.key === key)?.optionColors;
    return colors && Object.hasOwn(colors, label) ? colors[label] : undefined;
  }

  function setOptionColor(key: string, option: string, color: OptionColorKey | undefined): void {
    void changeProperty({ kind: 'set-option-color', key, option, color });
  }

  function colorPalette(
    label: string,
    context: string,
    current: () => OptionColorKey | undefined,
    change: (color: OptionColorKey | undefined) => void,
    reset = t('automaticColor'),
  ) {
    const node = element('div', 'zb-option-palette');
    node.setAttribute('role', 'group');
    const caption = (text: string) => (context ? scopedName(text, context) : text);
    node.setAttribute('aria-label', caption(label));
    const swatches = PALETTE.map((color) => {
      const swatch = button('', () => change(color), 'zb-option-swatch', caption(t(color)));
      swatch.dataset.tone = color;
      return swatch;
    });
    const clear = button('↺', () => change(undefined), 'zb-option-swatch', caption(reset));
    node.append(...swatches, clear);
    function update(disabled = false): void {
      const color = current();
      for (const swatch of swatches) {
        swatch.disabled = disabled;
        swatch.setAttribute('aria-pressed', String(swatch.dataset.tone === color));
      }
      clear.disabled = disabled;
      clear.setAttribute('aria-pressed', String(color === undefined));
    }
    update();
    return { node, update };
  }

  function buildTagColorPane(): () => void {
    const target = select(
      t('tagColorTarget'),
      [
        ['tag', t('exactTag')],
        ['prefix', t('tagPrefix')],
      ],
      'tag',
    );
    const name = input(t('tagColorName'));
    name.placeholder = 'topic/';
    const list = element('datalist');
    list.id = `${mountId}-tag-color-names`;
    suggestTags(name, list);
    const rules = element('div', 'zb-options');
    const targetKind = (): TagColorRule['kind'] => (target.value === 'prefix' ? 'prefix' : 'tag');
    const targetName = (): string => name.value.trim().normalize();
    const palette = colorPalette(
      t('tagColors'),
      '',
      () => {
        const value = targetName();
        const kind = targetKind();
        return preferences.tagColors?.find((rule) => rule.kind === kind && rule.name === value)
          ?.color;
      },
      (color) => {
        const value = targetName();
        if (value)
          void changeProperty({ kind: 'set-tag-color', target: targetKind(), name: value, color });
      },
      t('resetTagColor'),
    );
    const update = () => palette.update(!targetName());
    name.addEventListener('input', update);
    function updateTarget(): void {
      if (targetKind() === 'tag') name.setAttribute('list', list.id);
      else name.removeAttribute('list');
      update();
    }
    target.addEventListener('change', updateTarget);
    const field = element('div', 'zb-line');
    field.append(withChevron(target), name, list);
    tagColorPane.append(field, palette.node, element('small', '', t('tagColorPriority')), rules);
    return () => {
      update();
      renderRegion(rules, () => {
        rules.replaceChildren(
          ...(preferences.tagColors ?? []).map(({ kind, name: value, color }) => {
            const caption = `${kind === 'prefix' ? t('tagPrefix') : t('exactTag')}: ${value}`;
            const rule = button(
              caption,
              () => {
                target.value = kind;
                name.value = value;
                updateTarget();
                name.focus();
              },
              'zb-color-control',
            );
            rule.dataset.tone = color;
            focusKey(rule, JSON.stringify([kind, value]));
            return rule;
          }),
        );
      });
    };
  }

  function repaintPills(kind: 'tags' | 'options'): void {
    if (!tableBody) return;
    const { columns } = tableBody;
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index]!;
      const property = kind === 'options' ? propertyFor(column) : undefined;
      if (kind === 'tags' ? column !== 'tags' : !property || !isSelectProperty(property.type))
        continue;
      for (const [key, line] of mounted) {
        const entry = entries[layout.indexOf(key)];
        if (entry?.kind === 'item')
          cells.paintColors(entry.row, column, property, line.cells[index + 1]!);
      }
    }
  }

  function buildOptionForm(property: Property): HTMLFormElement {
    const form = element('form', 'zb-line');
    const field = input(scopedName(t('newOption'), property.key));
    field.placeholder = t('newOption');
    field.dataset.keepFocus = '';
    const submit = element('button', '', t('addOption'));
    named(submit, scopedName(t('addOption'), property.key));
    submit.type = 'submit';
    form.append(field, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const label = field.value.trim();
      if (!label || submit.disabled) return;
      const current = preferences.properties.find(({ key }) => key === property.key);
      if (!current || current.options?.includes(label)) return;
      submit.disabled = true;
      void changeProperty({
        kind: 'define',
        property: { ...current, options: [...(current.options ?? []), label] },
      }).then((saved) => {
        if (disposed) return;
        submit.disabled = false;
        if (saved && field.value.trim() === label) field.value = '';
      });
    });
    return form;
  }

  function ratingLabel(value: string): string {
    return zh ? `${value} 星` : `${value} ${value === '1' ? 'star' : 'stars'}`;
  }

  function scalarError(type: PropertyType, value: string): string | undefined {
    if (value && type === 'date' && !isISODate(value)) return t('invalidDate');
    if (value && type === 'url' && !webURL(value)) return t('invalidURL');
    return undefined;
  }

  function buildBulkPropertyForm(): [HTMLFormElement, () => void] {
    const form = element('form', 'zb-line');
    const picker = select(t('bulkProperty'), [], '');
    const editor = element('div', 'zb-line');
    let current: Property | undefined;
    let valueForSubmit: (() => PropertyValue | undefined) | undefined;
    form.append(withChevron(picker), editor);

    function drawValue(): void {
      const property = preferences.properties.find(({ key }) => key === picker.value);
      if (same(current, property)) return;
      current = property;
      valueForSubmit = undefined;
      editor.replaceChildren();
      if (!property) return;

      const setValue = (value: PropertyValue): void => {
        void runBulk({ kind: 'property', key: property.key, value });
      };
      if (
        property.type === 'text' ||
        property.type === 'number' ||
        property.type === 'url' ||
        property.type === 'date'
      ) {
        const field = input(t('bulkValue'));
        field.placeholder = property.type === 'date' ? 'YYYY-MM-DD' : t('bulkValue');
        field.required = true;
        if (property.type === 'number') field.inputMode = 'decimal';
        if (property.type === 'url') field.inputMode = 'url';
        field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
        valueForSubmit = () => {
          const value = field.value.trim();
          const error = scalarError(property.type, value);
          if (error) {
            field.setAttribute('aria-invalid', 'true');
            showStatus(error, true);
            return undefined;
          }
          return value || undefined;
        };
        editor.append(field);
      } else if (property.type === 'multi-select') {
        const field = select(
          t('bulkValue'),
          (property.options ?? []).map((value) => [value, value]),
          '',
        );
        field.multiple = true;
        field.size = Math.max(2, Math.min(4, field.length));
        field.required = true;
        valueForSubmit = () => {
          const values = Array.from(field.selectedOptions, ({ value }) => value);
          return values.length ? values : undefined;
        };
        editor.append(field);
      } else {
        const choices: [string, string][] = [['', t('chooseValue')]];
        if (property.type === 'checkbox') choices.push(['true', t('yes')], ['false', t('no')]);
        else if (property.type === 'rating')
          for (const rating of RATING_VALUES) choices.push([rating, ratingLabel(rating)]);
        else for (const value of property.options ?? []) choices.push([value, value]);
        const field = select(t('bulkValue'), choices, '');
        field.addEventListener('change', () => {
          const value = field.value;
          if (!value) return;
          setValue(property.type === 'checkbox' ? value === 'true' : value);
          field.value = '';
        });
        editor.append(withChevron(field));
      }
      if (valueForSubmit) {
        const apply = element('button', '', t('bulkSet'));
        apply.type = 'submit';
        editor.append(apply);
      }
      editor.append(button(t('bulkClear'), () => setValue(null)));
    }

    function refreshProperties(): void {
      const key = picker.value;
      const properties = preferences.properties;
      picker.replaceChildren(
        option('', t('bulkProperty')),
        ...properties.map(({ key }) => option(key, key)),
      );
      picker.value = properties.some((property) => property.key === key) ? key : '';
      form.hidden = !properties.length;
      drawValue();
    }

    picker.addEventListener('change', drawValue);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = valueForSubmit?.();
      if (current && value !== undefined)
        void runBulk({ kind: 'property', key: current.key, value });
    });
    refreshProperties();
    return [form, refreshProperties];
  }

  function buildBulkTagForm(): HTMLFormElement {
    const form = element('form', 'zb-line');
    const field = input(t('bulkTag'));
    field.placeholder = t('tagName');
    field.required = true;
    const suggestions = element('datalist');
    suggestions.id = `${mountId}-bulk-tags`;
    suggestTags(field, suggestions);
    const apply = (add: boolean): void => {
      const tag = field.value.trim();
      if (tag) void runBulk({ kind: 'tag', tag, add });
    };
    const add = element('button', '', t('addTag'));
    add.type = 'submit';
    form.append(
      field,
      suggestions,
      add,
      button(t('removeTag'), () => apply(false)),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      apply(true);
    });
    return form;
  }

  async function runBulk(change: BulkChange): Promise<void> {
    if (bulkPending || !selected.size) return;
    const ids = [...selected];
    bulkPending = true;
    bulkActions.disabled = true;
    showStatus('');
    try {
      const { changed, skipped, readOnly } = await host.bulk(ids, change);
      showStatus(
        zh
          ? `已更新 ${changed} 条，跳过 ${skipped} 条（其中 ${readOnly} 条只读）。`
          : `Updated ${changed} items; skipped ${skipped} (${readOnly} read-only).`,
      );
    } catch {
      showStatus(t('actionError'), true);
      refresh();
    } finally {
      bulkPending = false;
      bulkActions.disabled = false;
    }
  }

  function syncSelection(): void {
    const total = result?.rows.length ?? 0;
    bulkBar.hidden = !selected.size;
    selectionCount.textContent = zh ? `已选择 ${selected.size} 条` : `${selected.size} selected`;
    const summary =
      searchTerm || activeView().filters.length
        ? zh
          ? `匹配 ${total}／${catalog?.rows.length ?? 0} 条`
          : `Matched ${total} / ${catalog?.rows.length ?? 0} items`
        : zh
          ? `共 ${total} 条`
          : `${total} items`;
    if (count.textContent !== summary) count.textContent = summary;
    if (tableWrap.hidden) return;
    const header = tableWrap.querySelector<HTMLInputElement>('[data-select-all]');
    if (header) {
      header.disabled = !total;
      header.checked = !!total && selected.size === total;
      header.indeterminate = selected.size > 0 && selected.size < total;
    }
    for (const check of tableWrap.querySelectorAll<HTMLInputElement>('[data-select-item]')) {
      check.checked = selected.has(Number(check.dataset.selectItem));
      const row = check.closest('tr');
      row?.setAttribute('data-selected', String(check.checked));
      row?.setAttribute('aria-selected', String(check.checked));
    }
  }

  function clearSelection(): void {
    selected.clear();
    selectionAnchor = undefined;
    syncSelection();
  }

  function retainSelection(rows: readonly Row[]): void {
    if (!selected.size && selectionAnchor === undefined) return;
    const retained = new Set<number>();
    let anchored = selectionAnchor === undefined;
    for (const { id } of rows) {
      if (id === selectionAnchor) anchored = true;
      if (selected.has(id)) retained.add(id);
      if (anchored && retained.size === selected.size) break;
    }
    for (const id of selected) if (!retained.has(id)) selected.delete(id);
    if (!anchored) selectionAnchor = undefined;
  }

  function selectItem(id: number, checked: boolean, extend: boolean): void {
    const toggle = (id: number): void => {
      if (checked) selected.add(id);
      else selected.delete(id);
    };
    if (extend && selectionAnchor !== undefined) {
      const from = layout.indexOf(`item:${selectionAnchor}`);
      const to = layout.indexOf(`item:${id}`);
      if (from >= 0 && to >= 0) {
        for (let index = Math.min(from, to), end = Math.max(from, to); index <= end; index++) {
          const entry = entries[index];
          if (entry?.kind === 'item') toggle(entry.row.id);
        }
        syncSelection();
        return;
      }
    }
    toggle(id);
    selectionAnchor = id;
    syncSelection();
  }

  function refresh(): void {
    if (disposed) return;
    const scope = activeView().scope;
    const ticket = ++loadTicket;
    retry.hidden = true;
    if (loadedScope !== scope || !catalog) {
      loadedScope = scope;
      catalog = undefined;
      evaluate();
    }
    void host.load(scope).then(
      (data) => {
        if (disposed || ticket !== loadTicket) return;
        catalog = data;
        if (activeView().filters.some(({ column }) => column === 'collections')) renderFilters();
        if (choosingGroupMember === 'collections' || activeView().group?.column === 'collections')
          renderGrouping();
        if (status.textContent === t('loadError')) showStatus('');
        evaluate();
      },
      () => {
        if (disposed || ticket !== loadTicket) return;
        retry.hidden = false;
        if (catalog || isBoard()) showStatus(t('loadError'), true);
        evaluate();
      },
    );
  }

  function evaluate(resetScroll = false): void {
    const view = activeView();
    result = catalog
      ? queryCatalog(catalog, view, preferences.properties, options.language, searchTerm)
      : undefined;
    groups =
      !isBoard(view) && result && view.group && catalog
        ? groupRows(
            result.rows,
            view.group,
            preferences.properties,
            catalog.tags,
            options.language,
            catalog.collections,
          )
        : undefined;
    const invalid = result?.invalid.length ?? 0;
    const invalidGroup = !isBoard(view) && Boolean(result && view.group && !groups);
    updateBadge(
      sortTool,
      t('sort'),
      view.sorts.filter(({ column }) => availableColumn(column)).length,
    );
    updateBadge(filterTool, t('filters'), result ? view.filters.length - invalid : 0);
    updateBadge(groupTool, t('grouping'), groups ? 1 : 0);
    warning.hidden = !invalid && !invalidGroup;
    filterWarning.hidden = !invalid;
    filterWarningText.textContent = invalid ? `${t('invalidFilters')} (${invalid}).` : '';
    groupWarning.hidden = !invalidGroup;
    groupWarningText.textContent = invalidGroup ? t('invalidGrouping') : '';
    if (result) retainSelection(result.rows);
    if (isBoard(view)) renderBoard();
    else if (!closeEditor) renderTable(resetScroll);
    else syncSelection();
  }

  function renderBoard(): void {
    const settings = currentBoard();
    const property = boardLaneProperty(settings, preferences.properties);
    renderedCardFields = boardCardFields(settings, preferences.properties);
    let rating = property?.type === 'rating' ? property : undefined;
    if (!rating) {
      for (const column of renderedCardFields) {
        const field = propertyFor(column);
        if (field?.type !== 'rating') continue;
        rating = field;
        break;
      }
    }
    board.render({
      viewID: activeView().id,
      property,
      rating,
      lanes: property && result ? boardLanes(result.rows, property, settings) : [],
      loading: !result && retry.hidden,
      cardRevision,
    });
    syncSelection();
  }

  function renderTable(resetScroll = false): void {
    if (disposed) return;
    widthAnchor = undefined;
    const view = activeView();
    const items = result?.rows;
    const oldTop = layout.indexAt(tableWrap.scrollTop);
    const distance = oldTop < 0 ? 0 : tableWrap.scrollTop - layout.offset(oldTop);
    const oldKey = entries[oldTop]?.key;
    const oldActive = activeCell && layout.indexOf(activeCell.key);
    entries = flattenRows(items ?? [], groups, foldedGroups);
    layout.replace(entries);
    const top = oldKey ? layout.indexOf(oldKey) : -1;
    const columns = visibleColumns();
    const sorts = view.sorts.filter(({ column }) => availableColumn(column));
    if (popovers.isOpen(headerMenu)) popovers.close(true);
    const currentColumn =
      activeCell && columns.includes(activeCell.column) ? activeCell.column : columns[0];
    const currentEntry =
      (!resetScroll && activeCell ? entries[layout.indexOf(activeCell.key)] : undefined) ??
      entries[resetScroll ? 0 : Math.min(Math.max(oldActive ?? 0, 0), entries.length - 1)];
    activeCell = currentColumn && currentEntry && { key: currentEntry.key, column: currentColumn };
    const focus = doc.activeElement;
    if (focus === tableWrap || (focus && tableBody?.body.contains(focus))) {
      tableWrap.focus({ preventScroll: true });
      restoreGridFocus = true;
    }
    mounted.clear();
    tableBody = undefined;
    paintedCell = undefined;
    let tail: HTMLButtonElement | undefined;

    preserveFocus(tableWrap, () => {
      if (!items || !columns.length) {
        const label = !items ? (retry.hidden ? t('loading') : t('loadError')) : t('noColumns');
        const empty = element('div', 'zb-empty', label);
        empty.setAttribute('role', 'status');
        tableWrap.replaceChildren(empty);
        return;
      }
      const table = element('table');
      table.setAttribute('aria-label', t('table'));
      table.setAttribute('role', 'grid');
      table.setAttribute('aria-multiselectable', 'true');
      table.setAttribute('aria-rowcount', String(entries.length + 1));
      const colgroup = element('colgroup');
      const selectionColumn = element('col');
      selectionColumn.style.width = `${SELECT_COLUMN_WIDTH}px`;
      colgroup.append(selectionColumn);
      const header = element('thead');
      const titles = element('tr');
      const selectCell = element('th', 'zb-select-cell');
      selectCell.scope = 'col';
      const all = input(t('selectAll'));
      all.type = 'checkbox';
      all.dataset.selectAll = '';
      focusKey(all, 'select-all');
      all.addEventListener('change', () => {
        if (!all.checked) {
          clearSelection();
          return;
        }
        selectionAnchor = undefined;
        for (const { id } of result?.rows ?? []) selected.add(id);
        syncSelection();
      });
      selectCell.append(all);
      titles.append(selectCell);
      const headings: HTMLTableCellElement[] = [];
      for (const column of columns) {
        const col = element('col');
        col.dataset.column = column;
        colgroup.append(col);
        const heading = element('th');
        heading.scope = 'col';
        const index = sorts.findIndex((rule) => rule.column === column);
        const direction = sorts[index]?.direction;
        if (index === 0)
          heading.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
        const caption = columnName(column);
        const label = direction
          ? `${caption} · ${t(direction)}${sorts.length > 1 ? ` ${index + 1}` : ''}`
          : caption;
        const trigger = element('button', 'zb-header-button');
        trigger.type = 'button';
        named(trigger, scopedName(t('columnMenu'), label));
        trigger.dataset.headerColumn = column;
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.append(
          createFieldIcon(doc, column, propertyFor(column)?.type),
          element('span', 'zb-header-label', caption),
        );
        if (direction) {
          const arrow = direction === 'asc' ? '↑' : '↓';
          const indicator = element(
            'span',
            'zb-sort-indicator',
            sorts.length > 1 ? `${arrow}${index + 1}` : arrow,
          );
          indicator.setAttribute('aria-hidden', 'true');
          trigger.append(indicator);
        }
        focusKey(trigger, `header:${column}`);
        heading.append(trigger);
        headings.push(heading);
        heading.append(resizeGrip(table, col, column, caption));
        titles.append(heading);
      }
      bindHeaderActions(titles, columns, headings);
      // The unsized final column takes only the surplus in the fixed table layout.
      colgroup.append(element('col'));
      const actionCell = element('th', 'zb-table-tail');
      const addColumn = button(
        '+',
        () => {
          columnsFromTail = true;
          openPane(addColumn, columnPane);
        },
        'zb-tool-icon',
        t('showColumns'),
      );
      addColumn.setAttribute('aria-haspopup', 'dialog');
      addColumn.setAttribute('aria-expanded', 'false');
      focusKey(addColumn, 'show-columns');
      actionCell.append(addColumn);
      titles.append(actionCell);
      tail = addColumn;
      header.append(titles);
      const body = element('tbody');
      const spacer = () => {
        const line = element('tr', 'zb-virtual-spacer');
        line.setAttribute('aria-hidden', 'true');
        const cell = element('td');
        cell.colSpan = columns.length + 2;
        line.append(cell);
        return line;
      };
      const leading = spacer();
      const trailing = spacer();
      body.append(leading, trailing);
      tableBody = { body, leading, trailing, columns, headers: titles.cells };
      table.append(colgroup, header, body);
      updateTableWidths(table);
      tableWrap.replaceChildren(table);
      updateFrozenColumns();
      if (!items.length) {
        const empty = element('div', 'zb-empty', t('noItems'));
        empty.setAttribute('role', 'status');
        tableWrap.append(empty);
      }
    });
    if (columnsFromTail) popovers.reanchor(tail ?? columnTool, columnPane);
    if (popovers.isOpen(tagColorPane)) {
      const trigger = headerTrigger('tags');
      if (trigger) popovers.reanchor(trigger, tagColorPane);
      else popovers.close(false);
    }
    if (initialScroll && items) {
      const restoredTop = initialScroll.key ? layout.indexOf(initialScroll.key) : -1;
      tableWrap.scrollLeft = initialScroll.left;
      renderWindow(restoredTop < 0 ? 0 : layout.offset(restoredTop) + initialScroll.offset);
      initialScroll = undefined;
    } else {
      renderWindow(resetScroll ? 0 : top < 0 ? tableWrap.scrollTop : layout.offset(top) + distance);
    }
    syncSelection();
  }

  function bindHeaderActions(
    titles: HTMLTableRowElement,
    columns: readonly Column[],
    headings: readonly HTMLTableCellElement[],
  ): void {
    let drag: { id: number; from: number; x: number; slot: number; sign: number } | undefined;
    const marker = element('div', 'zb-column-drop');
    marker.setAttribute('aria-hidden', 'true');
    let suppressClick = false;
    const target = (event: MouseEvent) =>
      (event.target as Element).closest<HTMLButtonElement>('[data-header-column]');
    titles.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      suppressClick = false;
      if (columns.length < 2) return;
      const trigger = target(event);
      if (!trigger) return;
      const from = columns.indexOf(trigger.dataset.headerColumn as Column);
      const sign = window?.getComputedStyle(titles).direction === 'rtl' ? -1 : 1;
      drag = { id: event.pointerId, from, x: event.clientX, slot: from, sign };
      trigger.setPointerCapture?.(event.pointerId);
    });
    titles.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { from, sign } = drag;
      if (!suppressClick && Math.abs(event.clientX - drag.x) < 6) return;
      if (!suppressClick) {
        suppressClick = true;
        popovers.close(false);
      }
      const x = event.clientX * sign;
      const viewport = inlineViewport();
      const inlineStart = viewport.rtl ? -viewport.right : viewport.left;
      const inlineEnd = viewport.rtl ? -viewport.left : viewport.right;
      let boundary = headings.length;
      for (let index = 0; index < headings.length; index++) {
        const { left, right } = headings[index]!.getBoundingClientRect();
        const start = sign === 1 ? left : -right;
        const end = sign === 1 ? right : -left;
        if (inlineEnd > inlineStart) {
          const visibleStart = Math.max(
            start,
            inlineStart + (index + 1 < frozen.count ? 0 : frozen.width),
          );
          const visibleEnd = Math.min(end, inlineEnd);
          if (visibleStart >= visibleEnd && end <= visibleStart) continue;
          if (x >= (visibleStart + visibleEnd) / 2) continue;
        } else if (x >= (start + end) / 2) continue;
        boundary = index;
        break;
      }
      drag.slot = boundary > from ? boundary - 1 : boundary;
      if (drag.slot === from) {
        marker.remove();
        return;
      }
      const heading = headings[Math.min(boundary, headings.length - 1)]!;
      const { left, right, top, height } = heading.getBoundingClientRect();
      const after = boundary === headings.length;
      const edge = sign === 1 ? (after ? right : left) : -(after ? left : right);
      const visibleEdge =
        inlineEnd > inlineStart
          ? Math.max(
              inlineStart + (boundary + 1 < frozen.count ? 0 : frozen.width),
              Math.min(edge, inlineEnd),
            )
          : edge;
      marker.style.left = `${visibleEdge * sign}px`;
      marker.style.top = `${top}px`;
      marker.style.height = `${height}px`;
      if (!marker.isConnected) tableWrap.append(marker);
    });
    const finish = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { from, slot } = drag;
      drag = undefined;
      marker.remove();
      if (event.type === 'pointerup' && suppressClick) moveColumn(columns[from]!, slot);
    };
    titles.addEventListener('pointerup', finish);
    titles.addEventListener('pointercancel', finish);
    titles.addEventListener('lostpointercapture', finish);
    titles.addEventListener('click', (event) => {
      const trigger = target(event);
      if (!trigger || (suppressClick && event.detail > 0)) return;
      openColumnMenu(trigger, trigger.dataset.headerColumn as Column);
    });
  }

  function viewportHeight(): number {
    const headerHeight =
      tableBody?.body.previousElementSibling?.getBoundingClientRect().height ?? 0;
    return Math.max(1, (tableWrap.clientHeight || FALLBACK_VIEWPORT_HEIGHT) - headerHeight);
  }

  function scheduleWindow(): void {
    if (disposed || tableWrap.hidden || !tableBody || virtualFrame !== undefined) return;
    if (!window) {
      renderWindow();
      return;
    }
    virtualFrame = window.requestAnimationFrame(() => {
      virtualFrame = undefined;
      renderWindow();
    });
  }

  function setGap(row: HTMLTableRowElement, height: number): void {
    row.hidden = height <= 0;
    row.cells[0]!.style.height = `${Math.max(0, height)}px`;
  }

  function renderWindow(wantedTop?: number): void {
    if (disposed || tableWrap.hidden || !tableBody) return;
    const { body, leading, trailing, columns } = tableBody;
    const height = viewportHeight();
    const initial = Math.min(
      wantedTop ?? tableWrap.scrollTop,
      Math.max(0, layout.totalHeight - height),
    );
    const held = wantedTop === undefined ? widthAnchor : undefined;
    widthAnchor = undefined;
    const anchor = held?.index ?? layout.indexAt(initial);
    const within = held?.within ?? (anchor < 0 ? 0 : initial - layout.offset(anchor));
    const atEnd = held?.atEnd ?? (initial > 0 && initial + height >= layout.totalHeight - 2);
    let heightChanged = false;
    let invalidate = resetMeasurements;
    if (rowGeometryDirty) {
      rowGeometryDirty = false;
      // Match the rendered CSS, including relative units and custom CSS overrides.
      const probe = rowProbe.getBoundingClientRect();
      heightChanged = layout.setRowHeight(probe.height);
      if (probe.width > 0 && probe.width !== measuredEm) {
        measuredEm = probe.width;
        if (activeView().density === 'wrap') invalidate = true;
        fitPills();
      }
    }
    const baseChanged = heightChanged || invalidate;
    resetMeasurements = false;
    if (invalidate && !heightChanged) layout.clearMeasurements();
    const topForAnchor = () => {
      const max = Math.max(0, layout.totalHeight - height);
      if (atEnd) return max;
      if (anchor < 0) return 0;
      const local = Math.min(
        within,
        Math.max(0, layout.offset(anchor + 1) - layout.offset(anchor) - 1),
      );
      return Math.min(max, layout.offset(anchor) + local);
    };
    const top = baseChanged ? topForAnchor() : initial;
    const range = layout.window(top, height, OVERSCAN);
    for (const [key, row] of mounted) {
      const i = layout.indexOf(key);
      if (i >= range.start && i < range.end) continue;
      const ownedFocus = doc.activeElement && row.contains(doc.activeElement);
      if (row.querySelector('.zb-editor')) recycleEditor?.();
      if (ownedFocus) {
        tableWrap.focus({ preventScroll: true });
        restoreGridFocus = true;
      }
      row.remove();
      mounted.delete(key);
    }
    const group = activeView().group;
    let next: HTMLTableRowElement = trailing;
    let added = false;
    for (let i = range.end - 1; i >= range.start; i--) {
      const entry = entries[i]!;
      let row = mounted.get(entry.key);
      if (!row) {
        row =
          entry.kind === 'group'
            ? renderGroupHeader(entry, columns.length + 2, group)
            : renderRow(entry.row, columns);
        row.dataset.rowKey = entry.key;
        row.setAttribute('aria-rowindex', String(i + 2));
        mounted.set(entry.key, row);
        if (entry.kind === 'item' && frozen.count) paintFrozenRow(row, 0);
        added = true;
      }
      if (row.nextSibling !== next) body.insertBefore(row, next);
      next = row;
    }
    setGap(leading, range.top);
    setGap(trailing, range.bottom);
    let measured = false;
    if (tableWrap.clientHeight && range.start < range.end) {
      if (activeView().density === 'wrap') {
        for (let i = range.start; i < range.end; i++) {
          const row = mounted.get(entries[i]!.key)!;
          measured = layout.measure(i, row.getBoundingClientRect().height) || measured;
        }
      } else {
        measured = layout.setFixedHeight(next.getBoundingClientRect().height);
      }
    }
    let scroll = top;
    if (measured) {
      setGap(leading, layout.offset(range.start));
      setGap(trailing, layout.totalHeight - layout.offset(range.end));
      scroll = topForAnchor();
      const corrected = layout.window(scroll, height, OVERSCAN);
      if (corrected.start !== range.start || corrected.end !== range.end) scheduleWindow();
    }
    // Do not interrupt a native smooth scroll just to write back the same offset.
    if (
      (wantedTop !== undefined || baseChanged || measured) &&
      Math.abs(tableWrap.scrollTop - scroll) > 0.5
    )
      tableWrap.scrollTop = scroll;
    positionEditor?.();
    paintActiveCell();
    if (added) fitPills();
  }

  function activeNode(): HTMLTableCellElement | undefined {
    if (!activeCell || !tableBody) return;
    const row = mounted.get(activeCell.key);
    if (!row) return;
    if (row.classList.contains('zb-group')) return row.cells[0];
    const column = tableBody.columns.indexOf(activeCell.column);
    return column < 0 ? undefined : row.cells[column + 1];
  }

  function paintActiveCell(): void {
    const cell = activeNode();
    if (cell !== paintedCell) {
      if (paintedCell) {
        delete paintedCell.dataset.activeCell;
        for (const control of paintedCell.querySelectorAll<HTMLElement>(GRID_CONTROLS))
          control.tabIndex = -1;
      }
      if (cell) {
        cell.dataset.activeCell = '';
        for (const control of cell.querySelectorAll<HTMLElement>(GRID_CONTROLS))
          if (!control.matches(':disabled')) control.tabIndex = 0;
      }
      paintedCell = cell;
    }
    if (cell && restoreGridFocus && doc.activeElement === tableWrap) {
      const index = activeCell ? layout.indexOf(activeCell.key) : -1;
      const top = tableWrap.scrollTop;
      if (
        index < 0 ||
        layout.offset(index) >= top + viewportHeight() ||
        layout.offset(index + 1) <= top
      )
        return;
      restoreGridFocus = false;
      cell.focus({ preventScroll: true });
      revealGridCell(cell);
    }
  }

  function inlineViewport(): { left: number; right: number; rtl: boolean } {
    const rect = tableWrap.getBoundingClientRect();
    const left = rect.left + tableWrap.clientLeft;
    return {
      left,
      right: tableWrap.clientWidth ? left + tableWrap.clientWidth : rect.right,
      rtl: window?.getComputedStyle(tableWrap).direction === 'rtl',
    };
  }

  function revealGridCell(cell: HTMLTableCellElement): void {
    if (cell.hasAttribute('data-frozen') || cell.parentElement?.classList.contains('zb-group'))
      return;
    const { left, right } = cell.getBoundingClientRect();
    const viewport = inlineViewport();
    if (viewport.right <= viewport.left) return;
    tableWrap.scrollLeft += viewport.rtl
      ? -horizontalReveal(-right, -left, -viewport.right + frozen.width, -viewport.left)
      : horizontalReveal(left, right, viewport.left + frozen.width, viewport.right);
  }

  function updateFrozenShadow(): void {
    tableWrap.toggleAttribute(
      'data-frozen-shadow',
      frozen.count > 0 && Math.abs(tableWrap.scrollLeft) > 0,
    );
  }

  function paintFrozenCell(cell: HTMLTableCellElement, index: number): void {
    const offset = frozen.offsets[index];
    cell.toggleAttribute('data-frozen', offset !== undefined);
    cell.toggleAttribute('data-frozen-end', index + 1 === frozen.count);
    if (offset === undefined) cell.style.removeProperty('--zb-frozen-offset');
    else cell.style.setProperty('--zb-frozen-offset', `${offset}px`);
  }

  function paintFrozenRow(row: HTMLTableRowElement, previousCount: number): void {
    const count = Math.max(previousCount, frozen.count);
    for (let index = 0; index < count && index < row.cells.length - 1; index++) {
      paintFrozenCell(row.cells[index]!, index);
    }
  }

  function updateFrozenColumns(): void {
    if (!tableBody) return;
    const requested = Math.min(activeView().frozenCount ?? 0, tableBody.columns.length);
    const previous = frozen;
    const widths: number[] = [];
    for (let index = 0; requested && index <= requested; index++) {
      widths.push(tableBody.headers[index]!.getBoundingClientRect().width);
    }
    frozen = frozenColumns(widths, requested, tableWrap.clientWidth);
    const count = Math.max(previous.count, frozen.count);
    for (let index = 0; index < count && index <= tableBody.columns.length; index++) {
      paintFrozenCell(tableBody.headers[index]!, index);
    }
    for (const row of mounted.values()) {
      if (!row.classList.contains('zb-group')) paintFrozenRow(row, previous.count);
    }
    updateFrozenShadow();
  }

  function gridTarget(target: Element): void {
    const row = target.closest<HTMLTableRowElement>('tbody tr[data-row-key]');
    const key = row?.dataset.rowKey;
    const fallback = activeCell?.column ?? tableBody?.columns[0];
    if (!key || !fallback) return;
    const cell = target.closest<HTMLElement>('td');
    activeCell = { key, column: (cell?.dataset.column as Column | undefined) ?? fallback };
    paintActiveCell();
  }

  function gridFocus(event: FocusEvent): void {
    if (event.target === tableWrap) return;
    restoreGridFocus = false;
    gridTarget(event.target as Element);
  }

  function gridClick(event: MouseEvent): void {
    const target = event.target as Element;
    if (!tableWrap.contains(target)) return;
    const cell = target.closest<HTMLTableCellElement>('td[data-column]');
    if (event.shiftKey && cell && !target.closest('.zb-editor')) {
      selectItem(Number(cell.parentElement?.dataset.itemId), true, true);
      cell.focus({ preventScroll: true });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    gridTarget(target);
    if (cell && !target.closest('button, input, select, textarea, .zb-editor'))
      cell.focus({ preventScroll: true });
  }

  function moveGrid(index: number, column: Column, allowSmooth: boolean): void {
    const entry = entries[index];
    if (!entry) return;
    activeCell = { key: entry.key, column };
    tableWrap.focus({ preventScroll: true });
    restoreGridFocus = true;
    const start = layout.offset(index);
    const end = layout.offset(index + 1);
    const visibleTop = tableWrap.scrollTop;
    const height = viewportHeight();
    const top =
      start < visibleTop || end - start > height
        ? start
        : end > visibleTop + height
          ? end - height
          : visibleTop;
    // Nearby steps scroll smoothly; far jumps make the destination available immediately.
    if (
      allowSmooth &&
      tableWrap.clientHeight &&
      Math.abs(top - visibleTop) > 0.5 &&
      Math.abs(top - visibleTop) < height / 2 &&
      window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches !== true
    ) {
      tableWrap.scrollTo({ top, behavior: 'smooth' });
      paintActiveCell();
      scheduleWindow();
    } else {
      renderWindow(top);
    }
  }

  function runGridCommand(command: Exclude<TableCommand, 'escape'>): boolean {
    const current = activeCell;
    if (!current || !tableBody) return false;
    const index = layout.indexOf(current.key);
    const entry = entries[index];
    if (!entry) return false;
    if (typeof command !== 'string') {
      if (entry.kind !== 'item' || !entry.row.writable) return false;
      const property = propertyFor(current.column);
      if (property?.type !== 'rating') return false;
      rateRow(entry.row, property, command.rating);
      return true;
    }
    const columns = tableBody.columns;
    const columnIndex = columns.indexOf(current.column);
    let destination = index;
    let column = current.column;
    switch (command) {
      case 'left':
      case 'right':
        if (entry.kind === 'group') {
          setGroupFolded(entry, command === 'left');
          return true;
        }
        column = columns[columnIndex + (command === 'left' ? -1 : 1)] ?? column;
        break;
      case 'up':
      case 'down':
        destination += command === 'up' ? -1 : 1;
        break;
      case 'activate':
        if (entry.kind === 'group') {
          setGroupFolded(entry, !entry.folded);
        } else {
          if (!activeNode()) moveGrid(index, column, false);
          const cell = activeNode();
          const star =
            cell?.querySelector<HTMLElement>('[data-rating][aria-pressed="true"]') ??
            cell?.querySelector<HTMLElement>('[data-rating]');
          if (star) star.focus({ preventScroll: true });
          else
            cell
              ?.querySelector<HTMLElement>('button:not(.zb-link-control), input[type=checkbox]')
              ?.click();
        }
        return true;
    }
    destination = Math.max(0, Math.min(entries.length - 1, destination));
    moveGrid(destination, column, true);
    return true;
  }

  function setGroupFolded(entry: Extract<VirtualRow, { kind: 'group' }>, folded: boolean): void {
    if (entry.folded === folded) return;
    if (folded) foldedGroups.add(entry.group.value);
    else foldedGroups.delete(entry.group.value);
    const column = activeCell?.column ?? tableBody?.columns[0];
    if (column) activeCell = { key: entry.key, column };
    renderTable();
  }

  function holdWidthAnchor(): void {
    if (widthAnchor || !tableBody || activeView().density !== 'wrap') return;
    // Changing column widths can clamp the native scrollTop before the next frame.
    const top = tableWrap.scrollTop;
    const index = layout.indexAt(top);
    if (index < 0) return;
    widthAnchor = {
      index,
      within: top - layout.offset(index),
      atEnd: top > 0 && top + tableWrap.clientHeight >= tableWrap.scrollHeight - 2,
    };
  }

  function widthGeometryChanged(): void {
    updateFrozenColumns();
    resetMeasurements = activeView().density === 'wrap';
    fitPills();
    scheduleWindow();
  }

  function updateTableWidths(table = tableWrap.querySelector('table')): void {
    if (!table) return;
    const view = activeView();
    const connected = table.isConnected;
    let changed = false;
    let total = SELECT_COLUMN_WIDTH + COLUMN_ACTION_WIDTH;
    const headers = table.tHead?.rows[0]?.cells;
    const columns = table.querySelectorAll<HTMLTableColElement>('col[data-column]');
    for (let index = 0; index < columns.length; index++) {
      const col = columns[index]!;
      const column = col.dataset.column as Column;
      const width = view.columnWidths?.[column] ?? defaultColumnWidth(column);
      const size = `${width}px`;
      if (col.style.width !== size) {
        if (connected && !changed) holdWidthAnchor();
        changed = true;
        col.style.width = size;
      }
      headers?.[index + 1]?.lastElementChild?.setAttribute('aria-valuenow', String(width));
      total += width;
    }
    table.style.width = `${total}px`;
    if (connected && changed) widthGeometryChanged();
  }

  function setColumnWidth(column: Column, width: number): void {
    const view = activeView();
    const value = width === defaultColumnWidth(column) ? undefined : width;
    if (view.columnWidths?.[column] === value) return;
    const widths = { ...view.columnWidths };
    if (value === undefined) delete widths[column];
    else widths[column] = value;
    updateView({ columnWidths: Object.keys(widths).length ? widths : undefined });
  }

  function resizeGrip(
    table: HTMLTableElement,
    col: HTMLTableColElement,
    column: Column,
    caption: string,
  ): HTMLElement {
    const grip = element('span', 'zb-column-grip');
    grip.tabIndex = 0;
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-valuemin', String(MIN_COLUMN_WIDTH));
    grip.setAttribute('aria-valuemax', String(MAX_COLUMN_WIDTH));
    named(grip, scopedName(t('resizeColumn'), caption));
    focusKey(grip, `resize:${column}`);
    let drag:
      | { id: number; view: string; x: number; width: number; total: number; sign: number }
      | undefined;
    const bound = (width: number) =>
      Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)));
    const commit = (width: number) => {
      if (!tableWrap.contains(table)) return;
      setColumnWidth(column, width);
    };
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      grip.focus({ preventScroll: true });
      grip.setPointerCapture?.(event.pointerId);
      drag = {
        id: event.pointerId,
        view: activeView().id,
        x: event.clientX,
        width: parseFloat(col.style.width),
        total: parseFloat(table.style.width),
        sign: window?.getComputedStyle(table).direction === 'rtl' ? -1 : 1,
      };
      grip.dataset.dragging = '';
      event.preventDefault();
    });
    grip.addEventListener('pointermove', (event) => {
      if (event.pointerId !== drag?.id) return;
      const width = bound(drag.width + (event.clientX - drag.x) * drag.sign);
      if (parseFloat(col.style.width) === width) return;
      holdWidthAnchor();
      col.style.width = `${width}px`;
      table.style.width = `${drag.total + width - drag.width}px`;
      grip.setAttribute('aria-valuenow', String(width));
      widthGeometryChanged();
    });
    const end = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const initial = drag;
      drag = undefined;
      delete grip.dataset.dragging;
      if (!tableWrap.contains(table)) return;
      if (event.type === 'pointerup' && activeView().id === initial.view) {
        commit(bound(initial.width + (event.clientX - initial.x) * initial.sign));
      }
      updateTableWidths(table);
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('lostpointercapture', end);
    grip.addEventListener('dblclick', () => commit(defaultColumnWidth(column)));
    grip.addEventListener('keydown', (event) => {
      const width = activeView().columnWidths?.[column] ?? defaultColumnWidth(column);
      const amount = event.shiftKey ? 32 : 8;
      const direction = window?.getComputedStyle(table).direction === 'rtl' ? -1 : 1;
      if (event.key === 'ArrowLeft') commit(bound(width - amount * direction));
      else if (event.key === 'ArrowRight') commit(bound(width + amount * direction));
      else if (event.key === 'Home') commit(defaultColumnWidth(column));
      else return;
      event.preventDefault();
    });
    return grip;
  }

  function renderGroupHeader(
    entry: Extract<VirtualRow, { kind: 'group' }>,
    colspan: number,
    group: Grouping | undefined,
  ): HTMLTableRowElement {
    const {
      group: { value, rows },
      folded,
    } = entry;
    let label: string;
    if (value === null) label = t('missingGroup');
    else if (group?.column === 'tags')
      label = `${t(value ? 'withTag' : 'withoutTag')}: ${group.tag}`;
    else if (group?.column === 'collections') {
      label = `${t(value ? 'inCollection' : 'outsideCollection')}: ${group.collection}`;
    } else if (typeof value === 'boolean') label = t(value ? 'yes' : 'no');
    else label = group && propertyFor(group.column)?.type === 'rating' ? ratingLabel(value) : value;
    const line = element('tr', 'zb-group');
    const heading = element('td');
    heading.tabIndex = -1;
    heading.colSpan = colspan;
    const toggle = button(
      `${folded ? '▸' : '▾'} ${label} (${rows.length})`,
      () => setGroupFolded(entry, !folded),
      'zb-group-toggle',
      `${label} (${rows.length})`,
    );
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.tabIndex = -1;
    focusKey(toggle, `group:${JSON.stringify(value)}`);
    heading.append(toggle);
    line.append(heading);
    return line;
  }

  function openRow(row: Row, target: boolean | 'attachment'): void {
    showStatus('');
    void host.openItem(row.id, target).catch(() => showStatus(t('openError'), true));
  }

  function renderRow(row: Row, columns: readonly Column[]): HTMLTableRowElement {
    const line = element('tr');
    line.setAttribute('aria-selected', String(selected.has(row.id)));
    line.title = t('openRow');
    line.dataset.itemId = String(row.id);
    if (selected.has(row.id)) line.dataset.selected = 'true';
    line.addEventListener('dblclick', (event) => {
      const target = event.target as Element | null;
      if (
        !target?.closest(
          'button, input, select, label, .zb-editor, .zb-select-cell, .zb-table-tail',
        )
      )
        openRow(row, row.pdf);
    });
    const selectCell = element('td', 'zb-select-cell');
    const check = input(scopedName(t('selectItem'), row.title || t('untitled')));
    check.type = 'checkbox';
    check.tabIndex = -1;
    check.checked = selected.has(row.id);
    check.dataset.selectItem = String(row.id);
    focusKey(check, `select:${row.id}`);
    check.addEventListener('click', (event) => selectItem(row.id, check.checked, event.shiftKey));
    selectCell.append(check);
    line.append(selectCell);
    for (const column of columns) {
      const cell = cells.render(
        row,
        column,
        propertyFor(column),
        cellValue(row, column, preferences.properties),
      );
      cell.tabIndex = -1;
      const control = cell.querySelector<HTMLElement>('button:not(.zb-link-control), input');
      if (control) control.tabIndex = -1;
      line.append(cell);
    }
    const tail = element('td', 'zb-table-tail');
    tail.setAttribute('aria-hidden', 'true');
    line.append(tail);
    return line;
  }

  function beginEditor(
    cell: HTMLTableCellElement,
    opener: HTMLButtonElement,
  ): {
    controls: HTMLDivElement;
    close: (restore: boolean) => void;
  } {
    recycleEditor?.();
    const controls = element('div', 'zb-editor');
    cell.append(controls);
    opener.classList.add('zb-editor-opener');
    positionEditor = () => {
      if (!tableWrap.clientWidth || !tableWrap.clientHeight) return;
      const viewport = inlineViewport();
      const outer = tableWrap.getBoundingClientRect();
      const minX = viewport.left + 2;
      const maxX = viewport.right - 2;
      const minY = outer.top + tableWrap.clientTop + 2;
      const maxY = minY + tableWrap.clientHeight - 4;
      controls.style.setProperty('--zb-editor-width', `${Math.max(0, maxX - minX)}px`);
      controls.style.setProperty('--zb-editor-height', `${Math.max(0, maxY - minY)}px`);
      const bounds = cell.getBoundingClientRect();
      const { width, height } = controls.getBoundingClientRect();
      const x = viewport.rtl ? bounds.right - width : bounds.left;
      const y = bounds.top + height <= maxY ? bounds.top + 1 : bounds.bottom - height - 1;
      controls.style.left = `${Math.max(minX, Math.min(x, maxX - width))}px`;
      controls.style.top = `${Math.max(minY, Math.min(y, maxY - height))}px`;
    };
    void Promise.resolve().then(() => {
      if (closeEditor === close) positionEditor?.();
    });
    function close(restore: boolean): void {
      if (closeEditor !== close) return;
      closeEditor = undefined;
      recycleEditor = undefined;
      editorKey = undefined;
      updateEditorColors = undefined;
      positionEditor = undefined;
      controls.remove();
      opener.classList.remove('zb-editor-opener');
      if (restore) cell.focus({ preventScroll: true });
      // Keep the input and controls stable during notifier refreshes, including
      // when a mutation would filter its own row out of the current view.
      if (!disposed && result !== atOpen)
        void Promise.resolve().then(() => {
          if (!closeEditor) renderTable();
        });
    }
    const atOpen = result;
    closeEditor = close;
    recycleEditor = () => close(false);
    return { controls, close };
  }

  function saveCell(action: Promise<void>, close?: (restore: boolean) => void): void {
    showStatus('');
    void action.catch(() => {
      if (disposed) return;
      if (closeEditor === close) close?.(true);
      showStatus(t('actionError'), true);
      refresh();
    });
  }

  function rateRow(row: Row, property: Property, value: string | null): void {
    saveCell(host.setProperty(row.id, property.key, value));
  }

  function editScalar(
    row: Row,
    property: Property,
    current: string,
    cell: HTMLTableCellElement,
    opener: HTMLButtonElement,
  ): void {
    const { controls, close } = beginEditor(cell, opener);
    const field = input(scopedName(t('edit'), property.key), current);
    if (property.type === 'number') field.inputMode = 'decimal';
    if (property.type === 'url') field.inputMode = 'url';
    const isDate = property.type === 'date';
    const save = (value: string, restore: boolean): void => {
      if (closeEditor !== close) return;
      const error = scalarError(property.type, value.trim());
      if (error) {
        showStatus(error, true);
        if (restore) {
          field.setAttribute('aria-invalid', 'true');
          return;
        }
        close(false);
        return;
      }
      close(restore);
      const next = value.trim();
      if (next !== current) saveCell(host.setProperty(row.id, property.key, next || null));
    };
    if (!isDate) recycleEditor = () => save(field.value, false);
    const line = element('div', 'zb-line');
    line.append(field);
    field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
    if (isDate) {
      field.placeholder = 'YYYY-MM-DD';
      const calendar = createInlineCalendar(doc, {
        value: current,
        locale: options.language,
        labels: {
          previousMonth: t('previousMonth'),
          nextMonth: t('nextMonth'),
          today: t('today'),
          clear: t('clear'),
        },
        onSelect(value) {
          save(value ?? '', true);
        },
      });
      calendar.element.addEventListener('mousedown', (event) => {
        if ((event.target as Element).closest('button')) event.preventDefault();
      });
      field.addEventListener('input', () => calendar.setValue(field.value.trim()));
      controls.append(line, calendar.element);
    } else {
      const clear = button(
        t('clear'),
        () => save('', true),
        '',
        scopedName(t('clear'), property.key),
      );
      clear.addEventListener('mousedown', (event) => event.preventDefault());
      line.append(clear);
      controls.append(line);
    }
    controls.addEventListener('focusout', (event) => {
      if (event.relatedTarget && controls.contains(event.relatedTarget as Node)) return;
      if (isDate) close(false);
      else save(field.value, false);
    });
    editorKey = (event) => {
      if (event.key !== 'Enter' || event.target !== field) return false;
      save(field.value, true);
      return true;
    };
    field.focus({ preventScroll: true });
    field.select();
  }

  function editChoices(
    row: Row,
    property: Property,
    value: PropertyValue,
    cell: HTMLTableCellElement,
    opener: HTMLButtonElement,
  ): void {
    const { controls, close } = beginEditor(cell, opener);
    const multi = property.type === 'multi-select';
    const selected = new Set(
      typeof value === 'string' ? [value] : typeof value === 'object' && value ? value : [],
    );
    const available = property.options ?? [];
    const labels = new Set([...available, ...selected]);
    const selections = element('div', 'zb-options zb-editor-choices');
    const paletteSlot = element('div', 'zb-choice-palette');
    paletteSlot.hidden = true;
    const colorControls = new Map<HTMLButtonElement, string>();
    let paletteTrigger: HTMLButtonElement | undefined;
    let refreshPalette: (() => void) | undefined;
    updateEditorColors = () => {
      const current = preferences.properties.find(({ key }) => key === property.key);
      if (current) {
        for (const [trigger, label] of colorControls)
          trigger.dataset.tone = optionTone(current, label);
      }
      refreshPalette?.();
    };
    const choices: HTMLButtonElement[] = [];
    const write = (): void => {
      const values = [...selected];
      saveCell(
        host.setProperty(
          row.id,
          property.key,
          multi ? (values.length ? values : null) : (values[0] ?? null),
        ),
        close,
      );
    };
    for (const label of labels) {
      const known = available.includes(label);
      const choice = button(known ? label : `${label} (${t('unavailable')})`, () => {
        if (!multi) {
          if (!selected.has(label) && known) {
            selected.clear();
            selected.add(label);
            write();
          }
          close(true);
          return;
        }
        if (selected.delete(label)) {
          if (!known) choice.disabled = true;
        } else if (known) {
          selected.add(label);
        }
        choice.setAttribute('aria-pressed', String(selected.has(label)));
        write();
      });
      choice.setAttribute('aria-pressed', String(selected.has(label)));
      choices.push(choice);
      const choiceRow = element('span', 'zb-editor-choice');
      choiceRow.append(choice);
      if (known) {
        const context = `${property.key}: ${label}`;
        const trigger = button(
          '',
          () => {
            const same = paletteTrigger === trigger;
            paletteTrigger?.setAttribute('aria-expanded', 'false');
            paletteTrigger = same ? undefined : trigger;
            paletteSlot.hidden = same;
            if (same) return;
            trigger.setAttribute('aria-expanded', 'true');
            const palette = colorPalette(
              t('optionColor'),
              context,
              () => optionColor(property.key, label),
              (color) => setOptionColor(property.key, label, color),
            );
            refreshPalette = palette.update;
            paletteSlot.replaceChildren(palette.node);
            firstControl(palette.node)?.focus({ preventScroll: true });
          },
          'zb-option-swatch',
          scopedName(t('optionColor'), context),
        );
        trigger.setAttribute('aria-expanded', 'false');
        colorControls.set(trigger, label);
        choiceRow.append(trigger);
      }
      selections.append(choiceRow);
    }
    const clear = button(
      t('clear'),
      () => {
        if (selected.size) {
          selected.clear();
          write();
        }
        close(true);
      },
      '',
      scopedName(t('clear'), property.key),
    );
    const buttons = element('div', 'zb-line');
    buttons.append(
      clear,
      button(t('done'), () => close(true)),
    );
    controls.append(selections, paletteSlot, buttons);
    updateEditorColors();
    closeOnBlur(controls, close);
    editorKey = (event) => {
      const index = choices.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return false;
      const step =
        event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
            ? -1
            : 0;
      if (!step) return false;
      for (let next = index + step; next >= 0 && next < choices.length; next += step) {
        if (!choices[next]!.disabled) {
          choices[next]!.focus({ preventScroll: true });
          break;
        }
      }
      return true;
    };
    (
      choices.find((choice) => choice.getAttribute('aria-pressed') === 'true') ??
      choices[0] ??
      clear
    ).focus();
  }

  function matchingTags(query: string, exclude?: ReadonlySet<string>): string[] {
    const matching: string[] = [];
    const lower = query.trim().toLocaleLowerCase(options.language);
    for (const tag of catalog?.tags ?? []) {
      if (exclude?.has(tag) || (lower && !tag.toLocaleLowerCase(options.language).includes(lower)))
        continue;
      matching.push(tag);
      if (matching.length === 8) break;
    }
    return matching;
  }

  function suggestTags(field: HTMLInputElement, list: HTMLDataListElement): void {
    field.setAttribute('list', list.id);
    const update = (): void => {
      list.replaceChildren(...matchingTags(field.value).map((label) => option(label, label)));
    };
    field.addEventListener('focus', update);
    field.addEventListener('input', update);
  }

  function closeOnBlur(controls: HTMLElement, close: (restore: boolean) => void): void {
    controls.addEventListener('focusout', (event) => {
      if (event.relatedTarget && !controls.contains(event.relatedTarget as Node)) close(false);
    });
  }

  function editTags(row: Row, cell: HTMLTableCellElement, opener: HTMLButtonElement): void {
    const { controls, close } = beginEditor(cell, opener);
    const chosen = new Set(row.tags);
    const current = element('div', 'zb-options');
    const suggestions = element('div', 'zb-options');
    const form = element('form', 'zb-line');
    const field = input(t('tagName'));
    field.placeholder = t('tagName');
    const add = element('button', '', t('addTag'));
    add.type = 'submit';
    form.append(field, add);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      choose(field.value.trim());
    });
    controls.append(
      current,
      form,
      suggestions,
      button(t('done'), () => close(true)),
    );
    closeOnBlur(controls, close);
    recycleEditor = () => {
      const tag = field.value.trim();
      close(false);
      if (tag && !chosen.has(tag)) saveCell(host.changeTag(row.id, tag, true));
    };

    function choose(tag: string): void {
      if (!tag || chosen.has(tag)) return;
      chosen.add(tag);
      saveCell(host.changeTag(row.id, tag, true), close);
      field.value = '';
      field.focus();
      renderTags();
    }

    function renderTags(): void {
      current.replaceChildren(
        ...[...chosen].map((tag) =>
          button(
            `${tag} ×`,
            () => {
              chosen.delete(tag);
              saveCell(host.changeTag(row.id, tag, false), close);
              field.focus();
              renderTags();
            },
            '',
            scopedName(t('removeTag'), tag),
          ),
        ),
      );
      renderSuggestions();
    }

    function renderSuggestions(): void {
      suggestions.replaceChildren(
        ...matchingTags(field.value, chosen).map((tag) => button(tag, () => choose(tag))),
      );
    }

    field.addEventListener('input', renderSuggestions);
    renderTags();
    field.focus();
  }

  const [propertyForm, updatePropertyHint] = buildPropertyForm();
  propertyPane.append(propertyForm, propertyList);
  const refreshTagColorPane = buildTagColorPane();
  renderTabs();
  renderScope();
  renderColumns();
  renderSort();
  renderFilters();
  renderGrouping();
  if (isBoard()) renderLanes();
  renderProperties();
  const unsubscribe = host.subscribe((kind) => {
    if (disposed) return;
    if (kind === 'settings') syncSettings();
    else {
      renderScope();
      refresh();
    }
  });
  if (restored?.focus === 'search') focusSearch();
  else if (restored?.focus === 'grid') tableWrap.focus({ preventScroll: true });
  if (catalog) evaluate();
  else refresh();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    disposeSync?.();
    board.dispose();
    popovers.dispose();
    surface.removeEventListener('keydown', captureKeys, true);
    narrowWindow?.removeEventListener('change', syncSearchMode);
    window?.clearTimeout(searchTimer);
    if (fitFrame !== undefined) window?.cancelAnimationFrame(fitFrame);
    if (virtualFrame !== undefined) window?.cancelAnimationFrame(virtualFrame);
    resizeObserver?.disconnect();
    for (const [region, listener] of pendingRenders)
      region.removeEventListener('focusout', listener);
    pendingRenders.clear();
    surface.remove();
    style.remove();
    customStyle.remove();
  }

  function snapshot(): WorkspaceState {
    const focused = doc.activeElement;
    const focus = ownsSearch(focused) ? 'search' : tableWrap.contains(focused) ? 'grid' : undefined;
    recycleEditor?.();
    const top = layout.indexAt(tableWrap.scrollTop);
    return {
      viewID: activeView().id,
      scope: activeView().scope,
      catalog,
      search: search.value,
      selected,
      selectionAnchor,
      foldedGroups,
      activeCell,
      scroll: {
        key: entries[top]?.key,
        offset: tableWrap.scrollTop - layout.offset(top),
        left: tableWrap.scrollLeft,
      },
      focus,
    };
  }

  return { dispose, applyGlobals, snapshot };
}
