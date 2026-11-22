import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  NATIVE_COLUMNS,
  type BulkChange,
  type Catalog,
  type Column,
  type ConfigChange,
  type Filter,
  type Density,
  type Grouping,
  type MutationResult,
  type Operator,
  type Preferences,
  type Property,
  type PropertyType,
  type PropertyValue,
  type Row,
  type View,
  type WorkspaceHost,
} from './contracts';
import { createCellRenderers } from './cell-renderers';
import { groupRows, isGroupProperty, type RowGroup } from './grouping';
import { cellValue, filterOperators, queryCatalog, type QueryResult } from './query';
import type { SyncPort } from './sync';
import { mountSyncControls } from './sync-controls';
import { workspaceCSS } from './workspace.css';

const PAGE_SIZE = 50;
const SEARCH_DELAY = 140;
const SELECT_COLUMN_WIDTH = 36;
const COLUMN_ACTION_WIDTH = 40;
const DEFAULT_COLUMN_WIDTH: Readonly<Record<(typeof NATIVE_COLUMNS)[number], number>> = {
  title: 360,
  creators: 180,
  year: 70,
  source: 168,
  type: 112,
  tags: 185,
  pdf: 56,
  added: 112,
};

function defaultColumnWidth(column: Column): number {
  return column.startsWith('property:')
    ? 140
    : DEFAULT_COLUMN_WIDTH[column as keyof typeof DEFAULT_COLUMN_WIDTH];
}

function columnWidth(view: View, column: Column): number {
  return view.columnWidths?.[column] ?? defaultColumnWidth(column);
}
const PROPERTY_TYPES: readonly PropertyType[] = [
  'text',
  'number',
  'checkbox',
  'single-select',
  'multi-select',
];
const words = {
  views: ['Views', '视图'],
  defaultView: ['Default', '默认视图'],
  newView: ['New view', '新建视图'],
  copyView: ['Copy view', '复制视图'],
  renameView: ['Rename view', '重命名视图'],
  deleteView: ['Delete view', '删除视图'],
  viewActions: ['View actions', '视图操作'],
  viewSettings: ['View settings', '视图设置'],
  viewName: ['View name', '视图名称'],
  copySuffix: ['copy', '副本'],
  popOut: ['Open in new window', '在新窗口打开'],
  scope: ['Scope', '范围'],
  allLibraries: ['All libraries', '全部文库'],
  columns: ['Columns', '列'],
  showColumns: ['Show columns', '显示列'],
  sort: ['Sort by', '排序列'],
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
  invalidGrouping: ['Unavailable grouping is ignored.', '已忽略失效分组。'],
  clearGrouping: ['Clear grouping', '清除分组'],
  missingGroup: ['No value', '未设置'],
  withTag: ['With tag', '有标签'],
  withoutTag: ['Without tag', '无标签'],
  title: ['Title', '标题'],
  creators: ['Authors', '作者'],
  year: ['Year', '年份'],
  source: ['Publication', '期刊／来源'],
  type: ['Item type', '条目类型'],
  tags: ['Tags', '标签'],
  pdf: ['PDF', 'PDF'],
  openPDF: ['Open PDF', '打开 PDF'],
  added: ['Date added', '添加时间'],
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
  yes: ['Yes', '是'],
  no: ['No', '否'],
  clear: ['Clear', '清空'],
  done: ['Done', '完成'],
  edit: ['Edit', '编辑'],
  readOnly: ['Read-only', '只读'],
  locate: ['Locate in Zotero', '在 Zotero 中定位'],
  openRow: ['Enter: open PDF or locate in Zotero', '回车：打开 PDF 或在 Zotero 中定位'],
  untitled: ['Untitled', '无标题'],
  tagName: ['New or existing tag', '新建或现有标签'],
  addTag: ['Add tag', '添加标签'],
  removeTag: ['Remove tag', '移除标签'],
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
  previous: ['Previous page', '上一页'],
  next: ['Next page', '下一页'],
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

export function mountWorkspace(
  root: HTMLElement,
  host: WorkspaceHost,
  options: { language: 'zh-CN' | 'en'; popOut?: () => void; sync?: SyncPort },
): () => void {
  const doc = root.ownerDocument;
  const window = doc.defaultView;
  const zh = options.language === 'zh-CN';
  const t = (key: keyof typeof words): string => words[key][zh ? 1 : 0];
  const mountId = `zb-${++nextId}`;
  let preferences = host.settings();
  let pendingViews = 0;
  let disposed = false;
  let loadTicket = 0;
  let catalog: Catalog | undefined;
  let loadedScope: string | undefined;
  let result: QueryResult | undefined;
  let groups: readonly RowGroup[] | undefined;
  const foldedGroups = new Set<RowGroup['value']>();
  let choosingGroupTag = false;
  const selected = new Set<number>();
  let selectionAnchor: number | undefined;
  let bulkPending = false;
  let page = 0;
  let searchTerm = '';
  let searchTimer: number | undefined;
  let composingSearch = false;
  let fitFrame: number | undefined;
  let renameViewId: string | undefined;
  let deleteChoice: { key: string; option?: string } | undefined;
  let closeEditor: ((restore: boolean) => void) | undefined;
  const pendingRenders = new Map<HTMLElement, EventListener>();
  const cells = createCellRenderers(doc, {
    text: t,
    columnName,
    open: openRow,
    toggle(row, property, checked) {
      saveCell(host.setProperty(row.id, property.key, checked ? true : null));
    },
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

  function details(label: string): [HTMLDetailsElement, HTMLDivElement] {
    const node = element('details');
    const pane = element('div', 'zb-pane');
    node.append(element('summary', '', label), pane);
    return [node, pane];
  }

  function focusKey(node: HTMLElement, key: string): void {
    node.dataset.focus = key;
  }

  function preserveFocus(region: HTMLElement, render: () => void): void {
    const focused = doc.activeElement;
    const key = focused && region.contains(focused) ? focused.getAttribute('data-focus') : null;
    render();
    if (key) {
      for (const node of region.querySelectorAll<HTMLElement>('[data-focus]')) {
        if (node.dataset.focus === key) {
          node.focus({ preventScroll: true });
          break;
        }
      }
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
        queueMicrotask(() => {
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
  style.textContent = workspaceCSS;
  const surface = element('section', 'zb-workspace');
  surface.lang = options.language;
  const top = element('div', 'zb-bar zb-top');
  const viewControls = element('div', 'zb-tabs');
  const tabs = element('div', 'zb-tablist');
  tabs.setAttribute('role', 'tablist');
  named(tabs, t('views'));
  const viewActions = element('details', 'zb-view-actions');
  const viewActionsTrigger = element('summary', '', '⋯');
  named(viewActionsTrigger, t('viewActions'));
  const actions = element('div', 'zb-pane zb-view-action-list');
  viewActions.append(viewActionsTrigger, actions);
  const renameSlot = element('div');
  renameSlot.hidden = true;
  const addViewButton = button('+', () => createView(false), 'zb-tool-icon', t('newView'));
  const viewAction = (label: string, run: () => void, className?: string) =>
    button(
      label,
      () => {
        viewActions.open = false;
        viewActionsTrigger.focus();
        run();
      },
      className,
    );
  const copyViewButton = viewAction(t('copyView'), () => createView(true));
  const renameViewButton = viewAction(t('renameView'), startViewRename);
  const deleteViewButton = viewAction(t('deleteView'), deleteView, 'zb-danger');
  actions.append(
    viewAction(t('viewSettings'), showColumns),
    copyViewButton,
    renameViewButton,
    deleteViewButton,
  );
  viewControls.append(tabs, addViewButton, viewActions, renameSlot);
  top.append(viewControls);
  if (options.popOut)
    top.append(button('↗', options.popOut, 'zb-popout zb-tool-icon', t('popOut')));
  const disposeSync = options.sync
    ? mountSyncControls(top, options.sync, options.language)
    : undefined;
  const panel = element('div', 'zb-panel');
  panel.id = `${mountId}-panel`;
  panel.setAttribute('role', 'tabpanel');
  const toolbar = element('div', 'zb-bar zb-toolbar');
  const scopeSlot = element('label', 'zb-line');
  const [columnDetails, columnPane] = details(t('columns'));
  const [filterDetails, filterPane] = details(t('filters'));
  const [groupDetails, groupPane] = details(t('grouping'));
  const [propertyDetails, propertyPane] = details(t('properties'));
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
  const searchControl = element('div', 'zb-search');
  const search = input(t('search'));
  search.setAttribute('role', 'searchbox');
  search.setAttribute('aria-keyshortcuts', '/');
  search.placeholder = `${t('search')}  /`;
  const clearSearchButton = button(
    '×',
    () => {
      search.focus();
      clearSearch();
    },
    'zb-tool-icon',
    t('clearSearch'),
  );
  clearSearchButton.hidden = true;
  searchControl.append(search, clearSearchButton);
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
    columnDetails,
    filterDetails,
    groupDetails,
    propertyDetails,
    withChevron(density),
    retry,
    searchControl,
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
  const pagination = element('div', 'zb-pagination');
  const tagValues = element('datalist');
  tagValues.id = `${mountId}-filter-tags`;
  const count = element('span', 'zb-page-count');
  const previous = button(t('previous'), () => setPage(page - 1));
  const next = button(t('next'), () => setPage(page + 1));
  pagination.append(count, previous, next);
  panel.append(toolbar, warning, bulkBar, status, tableWrap, pagination);
  surface.append(top, panel, tagValues);
  root.append(style, surface);
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
  root.addEventListener('keydown', workspaceKeys);
  surface.addEventListener('pointerdown', (event) => {
    if (viewActions.open && !viewActions.contains(event.target as Node)) viewActions.open = false;
  });

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
    page = 0;
    evaluate();
    tableWrap.scrollTop = 0;
  }

  function clearSearch(): void {
    window?.clearTimeout(searchTimer);
    search.value = '';
    clearSearchButton.hidden = true;
    applySearch();
  }

  function workspaceKeys(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      composingSearch ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.repeat
    )
      return;
    const target = event.target as Element | null;
    if (event.key === 'Escape' && viewActions.open && viewActions.contains(target)) {
      event.preventDefault();
      viewActions.open = false;
      viewActionsTrigger.focus();
      return;
    }
    if (
      target !== search &&
      target?.closest('input:not([type=checkbox]), textarea, select, [contenteditable], .zb-editor')
    )
      return;
    if (event.key === '/' && target !== search) {
      event.preventDefault();
      search.focus();
    } else if (event.key === 'Escape' && search.value) {
      event.preventDefault();
      clearSearch();
    }
  }

  function syncDensity(): void {
    const current = activeView().density ?? 'compact';
    density.value = current;
    surface.dataset.density = current;
    fitPills();
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

  function allColumns(): Column[] {
    return [
      ...NATIVE_COLUMNS,
      ...preferences.properties.map((property): Column => `property:${property.key}`),
    ];
  }

  function columnName(column: Column): string {
    if (column.startsWith('property:')) return column.slice('property:'.length);
    return t(column as (typeof NATIVE_COLUMNS)[number]);
  }

  function columnItems(): [Column, string][] {
    return allColumns().map((column) => [column, columnName(column)]);
  }

  function applySettings(incoming: Preferences, keepFilterInput = false): void {
    const old = preferences;
    const previousView = activeView();
    const changedProperties = !same(old.properties, incoming.properties);
    const changedViews = old.active !== incoming.active || !same(old.views, incoming.views);
    if (!changedProperties && !changedViews) return;
    preferences = {
      properties: changedProperties ? incoming.properties : old.properties,
      views: changedViews ? incoming.views : old.views,
      active: incoming.active,
    };
    const view = activeView();
    const changedActive = previousView.id !== view.id;
    const changedScope = previousView.scope !== view.scope;
    const changedColumns = !same(previousView.columns, view.columns);
    const changedSort = !same(previousView.sort, view.sort);
    const changedFilters = !same(previousView.filters, view.filters);
    const changedGrouping = !same(previousView.group, view.group);
    const changedDensity = previousView.density !== view.density;
    const changedWidths = !same(previousView.columnWidths, view.columnWidths);
    if (changedActive || changedScope || changedGrouping) choosingGroupTag = false;
    if (
      changedActive ||
      changedScope ||
      previousView.group?.column !== view.group?.column ||
      (previousView.group?.column === 'tags' &&
        view.group?.column === 'tags' &&
        previousView.group.tag !== view.group.tag)
    ) {
      foldedGroups.clear();
    }
    if (changedActive || changedScope || changedFilters) clearSelection();
    if (changedActive) {
      stopViewRename();
      viewActions.open = false;
    }
    if (changedActive || changedDensity) syncDensity();
    if (changedActive || changedWidths) updateTableWidths();
    if (changedViews) renderTabs();
    if (changedScope || changedActive) renderScope();
    if (changedProperties) {
      renderProperties();
      renderBulkProperty();
      updatePropertyHint();
    }
    if (changedColumns || changedSort || changedProperties || changedActive) renderColumns();
    if (changedProperties || changedActive || (changedFilters && !keepFilterInput)) renderFilters();
    if (changedProperties || changedActive || changedScope || changedGrouping) renderGrouping();
    if (changedActive || changedScope || changedSort || changedFilters || changedGrouping) page = 0;
    if (changedActive || changedScope || changedColumns) closeEditor?.(false);
    if (changedScope) {
      refresh();
    } else if (
      changedActive ||
      changedProperties ||
      changedColumns ||
      changedSort ||
      changedFilters ||
      changedGrouping
    ) {
      evaluate();
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

  function createView(copy: boolean): void {
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
      : {
          name: unique,
          id,
          scope: host.initialScope(),
          columns: NATIVE_COLUMNS,
          sort: { column: 'title', direction: 'asc' },
          filters: [],
        };
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
          tab.addEventListener('keydown', (event) => {
            let target: number;
            if (event.key === 'ArrowRight') target = (index + 1) % views.length;
            else if (event.key === 'ArrowLeft') target = (index + views.length - 1) % views.length;
            else if (event.key === 'Home') target = 0;
            else if (event.key === 'End') target = views.length - 1;
            else return;
            event.preventDefault();
            selectView(views[target]!.id);
            (tabs.children[target] as HTMLElement).focus();
          });
          return tab;
        }),
      );
    });
    deleteViewButton.disabled = views.length === 1;
  }

  function showColumns(): void {
    columnDetails.open = true;
    columnDetails.querySelector('summary')?.focus();
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

  function renderColumns(): void {
    preserveFocus(columnPane, () => {
      const view = activeView();
      const fields = element('fieldset', 'zb-options');
      fields.append(element('legend', '', t('columns')));
      for (const column of allColumns()) {
        const label = element('label', 'zb-line');
        const check = element('input');
        check.type = 'checkbox';
        check.checked = view.columns.includes(column);
        focusKey(check, column);
        check.addEventListener('change', () => {
          const columns = activeView().columns;
          updateView({
            columns: check.checked
              ? [...columns, column]
              : columns.filter((entry) => entry !== column),
          });
        });
        label.append(check, columnName(column));
        fields.append(label);
      }
      const order = element('div', 'zb-line');
      const sortItems = columnItems();
      if (!sortItems.some(([column]) => column === view.sort.column)) {
        sortItems.push([view.sort.column, `${columnName(view.sort.column)} (${t('unavailable')})`]);
      }
      const sort = select(t('sort'), sortItems, view.sort.column);
      focusKey(sort, 'sort');
      sort.addEventListener('change', () =>
        updateView({ sort: { ...activeView().sort, column: sort.value as Column } }),
      );
      const direction = select(
        t('direction'),
        [
          ['asc', t('asc')],
          ['desc', t('desc')],
        ],
        view.sort.direction,
      );
      focusKey(direction, 'direction');
      direction.addEventListener('change', () =>
        updateView({
          sort: { ...activeView().sort, direction: direction.value === 'desc' ? 'desc' : 'asc' },
        }),
      );
      const byLabel = element('label', 'zb-line');
      byLabel.append(t('sort'), sort);
      order.append(byLabel, direction);
      columnPane.replaceChildren(fields, order);
    });
  }

  function setGrouping(group: Grouping | undefined): void {
    choosingGroupTag = false;
    if (!same(activeView().group, group)) updateView({ group });
    else renderGrouping();
  }

  function renderGrouping(): void {
    renderRegion(groupPane, () => {
      const view = activeView();
      const group = view.group;
      const column = choosingGroupTag ? 'tags' : (group?.column ?? '');
      const items: [Grouping['column'] | '', string][] = [
        ['', t('noGrouping')],
        ['year', t('year')],
        ['type', t('type')],
        ['tags', t('tags')],
      ];
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
        if (column === 'tags') {
          choosingGroupTag = true;
          renderGrouping();
          groupPane.querySelector<HTMLInputElement>('input')?.focus();
        } else {
          setGrouping(column ? { column, direction: group?.direction ?? 'asc' } : undefined);
        }
      });
      const byLabel = element('label', 'zb-line');
      byLabel.append(t('groupBy'), by);
      controls.append(byLabel);

      if (column === 'tags') {
        const field = input(t('groupTag'), group?.column === 'tags' ? group.tag : '');
        field.placeholder = t('chooseTag');
        field.dataset.keepFocus = '';
        focusKey(field, 'tag');
        const suggestions = element('datalist');
        suggestions.id = `${mountId}-group-tags`;
        suggestTags(field, suggestions);
        const commit = (): void => {
          if (!field.isConnected) return;
          const current = activeView();
          if (current.id !== view.id || current.scope !== view.scope) return;
          if (!choosingGroupTag && current.group?.column !== 'tags') return;
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
        field.addEventListener('change', () => queueMicrotask(commit));
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.isComposing) commit();
        });
        controls.append(field, suggestions);
      }
      if (group && !choosingGroupTag) {
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
        controls.append(direction);
      }
      groupPane.replaceChildren(controls);
    });
  }

  function defaultOperand(column: Column, operator: Operator): string {
    if (operator === 'has' || operator === 'missing') return '';
    if (column === 'pdf' || propertyFor(column)?.type === 'checkbox') return 'true';
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
        const operators = rawOperators.map((operator): [Operator, string] => [
          operator,
          t(operator),
        ]);
        if (!rawOperators.includes(filter.operator)) {
          operators.push([filter.operator, `${t(filter.operator)} (${t('unavailable')})`]);
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
        line.append(column, operand);
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
          line.append(field);
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
    if (column === 'pdf' || property?.type === 'checkbox') {
      const items: [string, string][] = [
        ['true', t('yes')],
        ['false', t('no')],
      ];
      if (!items.some(([id]) => id === value)) items.unshift([value, t('chooseValue')]);
      return select(label, items, value);
    }
    const values =
      property && isSelectProperty(property.type) ? (property.options ?? []) : undefined;
    if (values) {
      const choices: [string, string][] = [
        ['', t('chooseValue')],
        ...values.map((entry): [string, string] => [entry, entry]),
      ];
      if (value && !values.includes(value)) choices.push([value, `${value} (${t('unavailable')})`]);
      return select(label, choices, value);
    }
    const field = input(label, value);
    field.dataset.keepFocus = '';
    if (column === 'year' || property?.type === 'number') field.inputMode = 'decimal';
    if (column === 'added') field.placeholder = 'YYYY-MM-DD';
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
    form.append(key, hint, type, values, submit);
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
        const heading = element('div', 'zb-line');
        const remove = button(
          t('deleteProperty'),
          () => toggleDelete(key),
          'zb-danger',
          scopedName(t('deleteProperty'), key),
        );
        focusKey(remove, JSON.stringify(['property', key]));
        heading.append(element('strong', '', key), element('span', '', t(type)), remove);
        block.append(heading);
        if (deleteChoice?.key === key && deleteChoice.option === undefined)
          block.append(deleteActions(key));
        if (isSelectProperty(type)) {
          for (const label of property.options ?? [])
            block.append(renderPropertyOption(key, label));
          block.append(buildOptionForm(property));
        }
        properties.append(block);
      }
      propertyList.replaceChildren(properties);
    });
  }

  function renderPropertyOption(key: string, label: string): HTMLElement {
    const line = element('div', 'zb-line');
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
    if (deleteChoice?.key === key && deleteChoice.option === label)
      line.append(deleteActions(key, label));
    return line;
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

  function buildBulkPropertyForm(): [HTMLFormElement, () => void] {
    const form = element('form', 'zb-line');
    const picker = select(t('bulkProperty'), [], '');
    const editor = element('div', 'zb-line');
    let current: Property | undefined;
    let valueForSubmit: (() => PropertyValue | undefined) | undefined;
    form.append(picker, editor);

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
      if (property.type === 'text' || property.type === 'number') {
        const field = input(t('bulkValue'));
        field.placeholder = t('bulkValue');
        field.required = true;
        if (property.type === 'number') field.inputMode = 'decimal';
        valueForSubmit = () => field.value.trim() || undefined;
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
        else for (const value of property.options ?? []) choices.push([value, value]);
        const field = select(t('bulkValue'), choices, '');
        field.addEventListener('change', () => {
          const value = field.value;
          if (!value) return;
          setValue(property.type === 'checkbox' ? value === 'true' : value);
          field.value = '';
        });
        editor.append(field);
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
    const header = tableWrap.querySelector<HTMLInputElement>('[data-select-all]');
    if (header) {
      header.disabled = !total;
      header.checked = !!total && selected.size === total;
      header.indeterminate = selected.size > 0 && selected.size < total;
    }
    for (const check of tableWrap.querySelectorAll<HTMLInputElement>('[data-select-item]')) {
      check.checked = selected.has(Number(check.dataset.selectItem));
      check.closest('tr')?.setAttribute('data-selected', String(check.checked));
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

  function* displayedRows(): Iterable<Row> {
    if (groups) {
      for (const group of groups) {
        if (!foldedGroups.has(group.value)) yield* group.rows;
      }
    } else if (result) {
      yield* result.rows;
    }
  }

  function selectItem(id: number, checked: boolean, extend: boolean): void {
    const toggle = (id: number): void => {
      if (checked) selected.add(id);
      else selected.delete(id);
    };
    if (extend && selectionAnchor !== undefined && selectionAnchor !== id) {
      const range: number[] = [];
      for (const row of displayedRows()) {
        const endpoint = row.id === selectionAnchor || row.id === id;
        if (range.length && endpoint) {
          range.push(row.id);
          for (const target of range) toggle(target);
          syncSelection();
          return;
        }
        if (range.length || endpoint) range.push(row.id);
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
        if (status.textContent === t('loadError')) showStatus('');
        evaluate();
      },
      () => {
        if (disposed || ticket !== loadTicket) return;
        retry.hidden = false;
        if (catalog) showStatus(t('loadError'), true);
        evaluate();
      },
    );
  }

  function evaluate(): void {
    const view = activeView();
    result = catalog
      ? queryCatalog(catalog, view, preferences.properties, options.language, searchTerm)
      : undefined;
    groups =
      result && view.group && catalog
        ? groupRows(result.rows, view.group, preferences.properties, catalog.tags, options.language)
        : undefined;
    const invalid = result?.invalid.length ?? 0;
    const invalidGroup = Boolean(result && view.group && !groups);
    warning.hidden = !invalid && !invalidGroup;
    filterWarning.hidden = !invalid;
    filterWarningText.textContent = invalid ? `${t('invalidFilters')} (${invalid}).` : '';
    groupWarning.hidden = !invalidGroup;
    groupWarningText.textContent = invalidGroup ? t('invalidGrouping') : '';
    if (result) retainSelection(result.rows);
    if (!closeEditor) renderTable();
    else syncSelection();
  }

  function setPage(index: number): void {
    closeEditor?.(false);
    const moved = page !== index;
    page = index;
    renderTable();
    if (moved) tableWrap.scrollTop = 0;
  }

  function renderTable(): void {
    if (disposed) return;
    const view = activeView();
    const items = result?.rows;
    const total = items?.length ?? 0;
    let folded = 0;
    let entries = total;
    // A folded group occupies one slot so even an entirely folded page has a visible toggle.
    if (groups && foldedGroups.size) {
      for (const group of groups) {
        if (foldedGroups.has(group.value)) {
          folded++;
          entries -= group.rows.length - 1;
        }
      }
    }
    page = Math.max(0, Math.min(page, Math.ceil(entries / PAGE_SIZE) - 1));
    const offset = page * PAGE_SIZE;
    const end = Math.min(entries, offset + PAGE_SIZE);
    const columns = view.columns.filter(
      (column) => !column.startsWith('property:') || propertyFor(column),
    );
    pagination.hidden = !items || !columns.length || (!total && !searchTerm);
    previous.disabled = page === 0;
    next.disabled = end >= entries;
    const pageCount = folded
      ? zh
        ? `第 ${offset + 1}–${end} 个可见条目或分组／共 ${entries} 个（${total} 条资料）`
        : `${offset + 1}–${end} of ${entries} visible rows or groups · ${total} items`
      : zh
        ? `第 ${offset + 1}–${end} 条／共 ${total} 条`
        : `${offset + 1}–${end} of ${total} items`;
    count.textContent = searchTerm
      ? `${total ? `${pageCount} · ` : ''}${
          zh
            ? `匹配 ${total}／共 ${catalog?.rows.length ?? 0} 条`
            : `Matched ${total} / ${catalog?.rows.length ?? 0} items`
        }`
      : pageCount;

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
      for (const column of columns) {
        const col = element('col');
        col.dataset.column = column;
        colgroup.append(col);
        const heading = element('th');
        heading.scope = 'col';
        const sorted = column === view.sort.column;
        const asc = view.sort.direction === 'asc';
        if (sorted) heading.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        const caption = columnName(column);
        const sort = button(
          `${caption}${sorted ? (asc ? ' ↑' : ' ↓') : ''}`,
          () => {
            const { sort } = activeView();
            updateView({
              sort: {
                column,
                direction: sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc',
              },
            });
          },
          '',
          scopedName(t('sort'), caption),
        );
        focusKey(sort, `header:${column}`);
        heading.append(sort);
        heading.append(resizeGrip(table, col, column, caption));
        titles.append(heading);
      }
      // The unsized final column takes only the surplus in the fixed table layout.
      colgroup.append(element('col'));
      const actionCell = element('th', 'zb-table-tail');
      const addColumn = button('+', showColumns, 'zb-tool-icon', t('showColumns'));
      focusKey(addColumn, 'show-columns');
      actionCell.append(addColumn);
      titles.append(actionCell);
      header.append(titles);
      const body = element('tbody');
      if (groups) {
        const tag = view.group?.column === 'tags' ? view.group.tag : undefined;
        let start = 0;
        for (const group of groups) {
          const folded = foldedGroups.has(group.value);
          const groupEnd = start + (folded ? 1 : group.rows.length);
          if (groupEnd > offset) {
            body.append(renderGroupHeader(group, folded, start, columns.length + 2, tag));
            if (!folded) {
              const limit = Math.min(group.rows.length, end - start);
              for (let index = Math.max(0, offset - start); index < limit; index++)
                body.append(renderRow(group.rows[index]!, columns));
            }
          }
          start = groupEnd;
          if (start >= end) break;
        }
      } else {
        for (let index = offset; index < end; index++)
          body.append(renderRow(items[index]!, columns));
      }
      table.append(colgroup, header, body);
      updateTableWidths(table);
      tableWrap.replaceChildren(table);
      if (!total) {
        const empty = element('div', 'zb-empty', t('noItems'));
        empty.setAttribute('role', 'status');
        tableWrap.append(empty);
      }
    });
    syncSelection();
    fitPills();
  }

  function updateTableWidths(table = tableWrap.querySelector('table')): void {
    if (!table) return;
    const view = activeView();
    let total = SELECT_COLUMN_WIDTH + COLUMN_ACTION_WIDTH;
    const headers = table.tHead?.rows[0]?.cells;
    const columns = table.querySelectorAll<HTMLTableColElement>('col[data-column]');
    for (let index = 0; index < columns.length; index++) {
      const col = columns[index]!;
      const width = columnWidth(view, col.dataset.column as Column);
      col.style.width = `${width}px`;
      headers?.[index + 1]?.lastElementChild?.setAttribute('aria-valuenow', String(width));
      total += width;
    }
    table.style.width = `${total}px`;
    fitPills();
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
      const view = activeView();
      if (width === columnWidth(view, column)) return;
      const widths = { ...view.columnWidths };
      if (width === defaultColumnWidth(column)) delete widths[column];
      else widths[column] = width;
      updateView({ columnWidths: Object.keys(widths).length ? widths : undefined });
    };
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      grip.focus();
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
      col.style.width = `${width}px`;
      table.style.width = `${drag.total + width - drag.width}px`;
      grip.setAttribute('aria-valuenow', String(width));
      fitPills();
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
      const width = columnWidth(activeView(), column);
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
    group: RowGroup,
    folded: boolean,
    start: number,
    colspan: number,
    tag: string | undefined,
  ): HTMLTableRowElement {
    const { value, rows } = group;
    const label =
      value === null
        ? t('missingGroup')
        : tag
          ? `${t(value ? 'withTag' : 'withoutTag')}: ${tag}`
          : typeof value === 'boolean'
            ? t(value ? 'yes' : 'no')
            : value;
    const line = element('tr', 'zb-group');
    const heading = element('td');
    heading.colSpan = colspan;
    const toggle = button(
      `${folded ? '▸' : '▾'} ${label} (${rows.length})`,
      () => {
        if (folded) foldedGroups.delete(value);
        else foldedGroups.add(value);
        setPage(Math.floor(start / PAGE_SIZE));
      },
      'zb-group-toggle',
      `${label} (${rows.length})`,
    );
    toggle.setAttribute('aria-expanded', String(!folded));
    focusKey(toggle, `group:${JSON.stringify(value)}`);
    heading.append(toggle);
    line.append(heading);
    return line;
  }

  function openRow(row: Row, pdf: boolean): void {
    showStatus('');
    void host.openItem(row.id, pdf).catch(() => showStatus(t('openError'), true));
  }

  function renderRow(row: Row, columns: readonly Column[]): HTMLTableRowElement {
    const line = element('tr');
    line.tabIndex = 0;
    line.title = t('openRow');
    line.dataset.itemId = String(row.id);
    focusKey(line, `row:${row.id}`);
    line.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target === line) {
        event.preventDefault();
        openRow(row, row.pdf);
      }
    });
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
    check.dataset.selectItem = String(row.id);
    focusKey(check, `select:${row.id}`);
    check.addEventListener('click', (event) => selectItem(row.id, check.checked, event.shiftKey));
    selectCell.append(check);
    line.append(selectCell);
    for (const column of columns)
      line.append(
        cells.render(
          row,
          column,
          propertyFor(column),
          cellValue(row, column, preferences.properties),
        ),
      );
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
    closeEditor?.(false);
    const controls = element('div', 'zb-editor');
    cell.append(controls);
    opener.hidden = true;
    function close(restore: boolean): void {
      if (closeEditor !== close) return;
      closeEditor = undefined;
      controls.remove();
      opener.hidden = false;
      if (restore) opener.focus();
      // Keep the input and controls stable during notifier refreshes, including
      // when a mutation would filter its own row out of the current view.
      if (!disposed && result !== atOpen)
        queueMicrotask(() => {
          if (!closeEditor) renderTable();
        });
    }
    const atOpen = result;
    closeEditor = close;
    controls.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    });
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
    const save = (value: string, restore: boolean): void => {
      if (closeEditor !== close) return;
      close(restore);
      const next = value.trim();
      if (next !== current) saveCell(host.setProperty(row.id, property.key, next || null));
    };
    const clear = button(
      t('clear'),
      () => save('', true),
      '',
      scopedName(t('clear'), property.key),
    );
    clear.addEventListener('mousedown', (event) => event.preventDefault());
    const line = element('div', 'zb-line');
    line.append(field, clear);
    controls.append(line);
    controls.addEventListener('focusout', (event) => {
      if (!event.relatedTarget || !controls.contains(event.relatedTarget as Node))
        save(field.value, false);
    });
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        save(field.value, true);
      }
    });
    field.focus();
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
    const selections = element('div', 'zb-options');
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
      selections.append(choice);
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
    controls.append(selections, buttons);
    closeOnBlur(controls, close);
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
  renderTabs();
  renderScope();
  renderColumns();
  renderFilters();
  renderGrouping();
  renderProperties();
  const unsubscribe = host.subscribe((kind) => {
    if (disposed) return;
    if (kind === 'settings') syncSettings();
    else {
      renderScope();
      refresh();
    }
  });
  refresh();

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    disposeSync?.();
    root.removeEventListener('keydown', workspaceKeys);
    window?.clearTimeout(searchTimer);
    if (fitFrame !== undefined) window?.cancelAnimationFrame(fitFrame);
    for (const [region, listener] of pendingRenders)
      region.removeEventListener('focusout', listener);
    pendingRenders.clear();
    surface.remove();
    style.remove();
  };
}
