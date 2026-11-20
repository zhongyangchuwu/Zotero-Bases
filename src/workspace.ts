import {
  NATIVE_COLUMNS,
  type Catalog,
  type Column,
  type ConfigChange,
  type Filter,
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
import { cellValue, filterOperators, queryCatalog, type QueryResult } from './query';
import { workspaceCSS } from './workspace.css';

const PAGE_SIZE = 50;
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
  viewName: ['View name', '视图名称'],
  copySuffix: ['copy', '副本'],
  popOut: ['Open in new window', '在新窗口打开'],
  scope: ['Scope', '范围'],
  allLibraries: ['All libraries', '全部文库'],
  columns: ['Columns', '列'],
  sort: ['Sort by', '排序列'],
  direction: ['Sort direction', '排序方向'],
  asc: ['Ascending', '升序'],
  desc: ['Descending', '降序'],
  title: ['Title', '标题'],
  creators: ['Authors', '作者'],
  year: ['Year', '年份'],
  source: ['Publication', '期刊／来源'],
  type: ['Item type', '条目类型'],
  tags: ['Tags', '标签'],
  pdf: ['PDF', 'PDF'],
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
  options: { language: 'zh-CN' | 'en'; popOut?: () => void },
): () => void {
  const doc = root.ownerDocument;
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
  let page = 0;
  let renameViewId: string | undefined;
  let deleteChoice: { key: string; option?: string } | undefined;
  let closeEditor: ((restore: boolean) => void) | undefined;
  const pendingRenders = new Map<HTMLElement, EventListener>();

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
  const top = element('div', 'zb-bar');
  const viewControls = element('div', 'zb-tabs');
  const tabs = element('div', 'zb-tablist');
  tabs.setAttribute('role', 'tablist');
  named(tabs, t('views'));
  const actions = element('div', 'zb-line zb-view-actions');
  const renameSlot = element('div');
  renameSlot.hidden = true;
  const addViewButton = button(t('newView'), () => createView(false));
  const copyViewButton = button(t('copyView'), () => createView(true));
  const renameViewButton = button(t('renameView'), startViewRename);
  const deleteViewButton = button(t('deleteView'), deleteView, 'zb-danger');
  actions.append(addViewButton, copyViewButton, renameViewButton, deleteViewButton);
  viewControls.append(tabs, actions, renameSlot);
  top.append(viewControls);
  if (options.popOut) top.append(button(t('popOut'), options.popOut, 'zb-popout'));
  const panel = element('div', 'zb-panel');
  panel.id = `${mountId}-panel`;
  panel.setAttribute('role', 'tabpanel');
  const toolbar = element('div', 'zb-bar zb-toolbar');
  const scopeSlot = element('label', 'zb-line');
  const [columnDetails, columnPane] = details(t('columns'));
  const [filterDetails, filterPane] = details(t('filters'));
  const [propertyDetails, propertyPane] = details(t('properties'));
  const propertyList = element('div');
  const warning = element('div', 'zb-warning zb-line');
  const warningText = element('span');
  warningText.setAttribute('role', 'status');
  warning.append(warningText, button(t('removeInvalid'), removeInvalidFilters));
  warning.hidden = true;
  const status = element('p', 'zb-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const retry = button(t('retry'), () => refresh());
  retry.hidden = true;
  toolbar.append(scopeSlot, columnDetails, filterDetails, propertyDetails, retry);
  const tableWrap = element('div', 'zb-table-wrap');
  const pagination = element('div', 'zb-pagination');
  const tagValues = element('datalist');
  tagValues.id = `${mountId}-filter-tags`;
  const count = element('span', 'zb-page-count');
  const previous = button(t('previous'), () => setPage(page - 1));
  const next = button(t('next'), () => setPage(page + 1));
  pagination.append(count, previous, next);
  panel.append(toolbar, warning, status, tableWrap, pagination);
  surface.append(top, panel, tagValues);
  root.append(style, surface);

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
    if (changedActive) stopViewRename();
    if (changedViews) renderTabs();
    if (changedScope || changedActive) renderScope();
    if (changedProperties) renderProperties();
    if (changedColumns || changedSort || changedProperties || changedActive) renderColumns();
    if (changedProperties || changedActive || (changedFilters && !keepFilterInput)) renderFilters();
    if (changedActive || changedScope || changedSort || changedFilters) page = 0;
    if (changedActive || changedScope || changedColumns) closeEditor?.(false);
    if (changedScope) {
      refresh();
    } else if (
      changedActive ||
      changedProperties ||
      changedColumns ||
      changedSort ||
      changedFilters
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
      if (refocus) renameViewButton.focus();
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
      scopeSlot.replaceChildren(element('span', '', t('scope')), field);
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
    if (column === 'tags') {
      field.setAttribute('list', tagValues.id);
      const updateSuggestions = (): void => {
        tagValues.replaceChildren(
          ...matchingTags(field.value).map((label) => option(label, label)),
        );
      };
      field.addEventListener('focus', updateSuggestions);
      field.addEventListener('input', updateSuggestions);
    }
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

  function buildPropertyForm(): HTMLFormElement {
    const form = element('form', 'zb-line');
    const key = input(t('propertyKey'));
    key.placeholder = t('propertyKey');
    key.required = true;
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
        }
      });
    });
    form.append(key, type, values, submit);
    return form;
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
    result = catalog
      ? queryCatalog(catalog, activeView(), preferences.properties, options.language)
      : undefined;
    const invalid = result?.invalid.length ?? 0;
    warning.hidden = !invalid;
    warningText.textContent = invalid ? `${t('invalidFilters')} (${invalid}).` : '';
    if (!closeEditor) renderTable();
  }

  function setPage(index: number): void {
    closeEditor?.(false);
    page = index;
    renderTable();
    tableWrap.scrollTop = 0;
  }

  function renderTable(): void {
    if (disposed) return;
    const view = activeView();
    const items = result?.rows;
    const total = items?.length ?? 0;
    page = Math.max(0, Math.min(page, Math.ceil(total / PAGE_SIZE) - 1));
    const offset = page * PAGE_SIZE;
    const end = Math.min(total, offset + PAGE_SIZE);
    const columns = view.columns.filter(
      (column) => !column.startsWith('property:') || propertyFor(column),
    );
    pagination.hidden = !items || !columns.length || total === 0;
    previous.disabled = page === 0;
    next.disabled = end >= total;
    count.textContent = zh
      ? `第 ${offset + 1}–${end} 条／共 ${total} 条`
      : `${offset + 1}–${end} of ${total} items`;

    preserveFocus(tableWrap, () => {
      if (!items || !total || !columns.length) {
        const label = !items
          ? retry.hidden
            ? t('loading')
            : t('loadError')
          : !columns.length
            ? t('noColumns')
            : t('noItems');
        const empty = element('div', 'zb-empty', label);
        empty.setAttribute('role', 'status');
        tableWrap.replaceChildren(empty);
        return;
      }
      const table = element('table');
      table.setAttribute('aria-label', t('table'));
      const header = element('thead');
      const titles = element('tr');
      for (const column of columns) {
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
        titles.append(heading);
      }
      header.append(titles);
      const body = element('tbody');
      for (let i = offset; i < end; i++) body.append(renderRow(items[i]!, columns));
      table.append(header, body);
      tableWrap.replaceChildren(table);
    });
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
      if (!target?.closest('button, input, select, label, .zb-editor')) openRow(row, row.pdf);
    });
    for (const column of columns) line.append(renderCell(row, column));
    return line;
  }

  function valueText(value: PropertyValue): string {
    if (typeof value === 'boolean') return value ? t('yes') : t('no');
    if (typeof value === 'string') return value || '—';
    return value?.length ? value.join('; ') : '—';
  }

  function renderCell(row: Row, column: Column): HTMLTableCellElement {
    const cell = element('td');
    cell.dataset.column = column;
    const rowName = row.title || t('untitled');
    const focusId = `cell:${row.id}:${column}`;
    if (column === 'title') {
      const title = button(rowName, () => openRow(row, false), 'zb-cell-button zb-item-title');
      title.title = t('locate');
      focusKey(title, focusId);
      cell.append(title);
      return cell;
    }
    const value = cellValue(row, column, preferences.properties);
    const property = propertyFor(column);
    if (!property && column !== 'tags') {
      cell.textContent = valueText(value);
      return cell;
    }
    if (!row.writable) {
      cell.textContent = valueText(value);
      cell.title = t('readOnly');
      return cell;
    }
    const label = scopedName(t('edit'), `${columnName(column)} · ${rowName}`);
    if (property?.type === 'checkbox') {
      const check = input(label);
      check.type = 'checkbox';
      check.checked = value === true;
      focusKey(check, focusId);
      check.addEventListener('change', () => {
        saveCell(host.setProperty(row.id, property.key, check.checked ? true : null));
      });
      check.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        check.click();
      });
      cell.append(check);
      return cell;
    }
    const edit = button(
      valueText(value),
      () => {
        if (column === 'tags') {
          editTags(row, cell, edit);
        } else if (property && isSelectProperty(property.type)) {
          editChoices(row, property, value, cell, edit);
        } else if (property) {
          editScalar(row, property, typeof value === 'string' ? value : '', cell, edit);
        }
      },
      'zb-cell-button',
      `${label}: ${valueText(value)}`,
    );
    focusKey(edit, focusId);
    cell.append(edit);
    return cell;
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

  propertyPane.append(buildPropertyForm(), propertyList);
  renderTabs();
  renderScope();
  renderColumns();
  renderFilters();
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
    for (const [region, listener] of pendingRenders)
      region.removeEventListener('focusout', listener);
    pendingRenders.clear();
    surface.remove();
    style.remove();
  };
}
