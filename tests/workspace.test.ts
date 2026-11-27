// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeSchema, createConfig } from '../src/config';
import type {
  BulkChange,
  BulkResult,
  Catalog,
  Column,
  ConfigChange,
  MutationResult,
  Preferences,
  Property,
  PropertyValue,
  Row,
  View,
  WorkspaceHost,
} from '../src/contracts';
import { createPropertyValidation } from '../src/data';
import { writeProperty } from '../src/extra';
import {
  createGlobalPreferenceStore,
  DEFAULT_GLOBAL_PREFERENCES,
  type GlobalPreferenceStore,
  type GlobalPreferences,
} from '../src/global-preferences';
import { mountWorkspace } from '../src/workspace';
import { preferences } from './settings-fixture';

const properties: readonly Property[] = [
  { key: 'Memo', type: 'text' },
  { key: 'Score', type: 'number' },
  { key: 'Reviewed', type: 'checkbox' },
  { key: 'Status', type: 'single-select', options: ['Reading', 'Done'] },
  { key: 'Method', type: 'multi-select', options: ['Survey', 'Simulation'] },
];
const researchProperties: readonly Property[] = [
  { key: 'Impact', type: 'rating' },
  { key: 'Repository', type: 'url' },
  { key: 'ReadOn', type: 'date' },
];
const defaultView: View = {
  id: 'default',
  name: 'Library',
  scope: 'personal',
  columns: [
    'title',
    'year',
    'pdf',
    'tags',
    'property:Memo',
    'property:Score',
    'property:Reviewed',
    'property:Status',
    'property:Method',
  ],
  sorts: [{ column: 'title', direction: 'asc' }],
  filters: [],
};
const sample: Row = {
  id: 1,
  writable: true,
  title: 'Alpha 1',
  creators: 'Wei Wang',
  year: '2024',
  source: '',
  type: 'journalArticle',
  tags: ['reading'],
  pdf: true,
  added: '2024-10-31',
  extra: 'Memo: Old note\nScore: 0.1\nStatus: Reading\nMethod: Retired',
};
const { validate, suggestPropertyKey } = createPropertyValidation({
  ItemFields: { getAll: () => [] },
  Utilities: {
    Internal: {
      extractExtraFields: () => ({ itemType: null, fields: new Map(), creators: [] }),
    },
  },
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

function fixture(
  rows: readonly Row[] = [sample],
  view: View = defaultView,
  schema: readonly Property[] = properties,
) {
  let entries = rows;
  let settings: Preferences = { properties: schema, views: [view], active: view.id };
  const { prefs } = preferences();
  const config = createConfig(prefs, () => view.scope, validate, { initializeDefault: false });
  const handlers = new Set<Parameters<WorkspaceHost['subscribe']>[0]>();
  const notify = (kind: 'settings' | 'data'): void => {
    for (const handler of handlers) handler(kind);
  };
  const host = {
    settings: () => settings,
    scopes: () => [
      { id: 'personal', label: 'My Library' },
      { id: 'group', label: 'Group Library' },
    ],
    initialScope: () => 'personal',
    load: vi.fn(
      async (_scope: string): Promise<Catalog> => ({
        rows: entries,
        tags: new Set(['existing', ...entries.flatMap(({ tags }) => tags)]),
        collections: new Set(entries.flatMap(({ collections }) => collections ?? [])),
      }),
    ),
    change: vi.fn(async (change: ConfigChange): Promise<MutationResult> => {
      if (change.kind === 'views') {
        settings = { ...settings, views: change.views, active: change.active };
        notify('settings');
        return { changed: 0, skipped: 0 };
      }
      if (change.kind === 'set-tag-color') {
        config.setTagColor(change);
        settings = { ...settings, tagColors: config.settings().tagColors };
        notify('settings');
        return { changed: 0, skipped: 0 };
      }
      const update = changeSchema(settings.properties, change, validate);
      settings = { ...settings, properties: update.properties };
      notify('settings');
      if (!update.edit) return { changed: 0, skipped: 0 };
      let changed = 0;
      let skipped = 0;
      entries = entries.map((entry) => {
        const extra = update.edit!(entry.extra);
        if (extra === entry.extra) return entry;
        if (!entry.writable) {
          skipped++;
          return entry;
        }
        changed++;
        return { ...entry, extra };
      });
      notify('data');
      return { changed, skipped };
    }),
    setProperty: vi.fn(async (id: number, key: string, value: PropertyValue): Promise<void> => {
      const prop = settings.properties.find((property) => property.key === key)!;
      entries = entries.map((entry) =>
        entry.id === id ? { ...entry, extra: writeProperty(entry.extra, prop, value) } : entry,
      );
      notify('data');
    }),
    changeTag: vi.fn(async (id: number, tag: string, add: boolean): Promise<void> => {
      entries = entries.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              tags: add ? [...entry.tags, tag] : entry.tags.filter((current) => current !== tag),
            }
          : entry,
      );
      notify('data');
    }),
    bulk: vi.fn(async (ids: readonly number[], change: BulkChange): Promise<BulkResult> => {
      const remaining = new Set(ids);
      const summary = { changed: 0, skipped: 0, readOnly: 0 };
      entries = entries.map((entry) => {
        if (!remaining.delete(entry.id)) return entry;
        let after: Row;
        if (change.kind === 'property') {
          const property = settings.properties.find(({ key }) => key === change.key)!;
          const extra = writeProperty(entry.extra, property, change.value);
          if (extra === entry.extra) return entry;
          after = { ...entry, extra };
        } else {
          if (entry.tags.includes(change.tag) === change.add) return entry;
          const tags = change.add
            ? [...entry.tags, change.tag]
            : entry.tags.filter((tag) => tag !== change.tag);
          after = { ...entry, tags };
        }
        if (!entry.writable) {
          summary.readOnly++;
          summary.skipped++;
          return entry;
        }
        summary.changed++;
        return after;
      });
      summary.skipped += remaining.size;
      if (summary.changed) notify('data');
      return summary;
    }),
    suggestPropertyKey: vi.fn(suggestPropertyKey),
    openItem: vi.fn(async (_id: number, _target: boolean | 'attachment'): Promise<void> => {}),
    subscribe: vi.fn((listener: Parameters<WorkspaceHost['subscribe']>[0]) => {
      handlers.add(listener);
      return () => handlers.delete(listener);
    }),
  } satisfies WorkspaceHost;
  return {
    host,
    notify,
    handlers,
    setRows(next: readonly Row[]) {
      entries = next;
      notify('data');
    },
  };
}

function attach(
  host: WorkspaceHost,
  options: Parameters<typeof mountWorkspace>[2] = { language: 'en' },
) {
  const root = document.body.appendChild(document.createElement('main'));
  const teardown = mountWorkspace(root, host, options);
  cleanups.push(teardown);
  return { root, teardown };
}

function get<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}

function click(root: ParentNode, caption: string): void {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.getAttribute('aria-label') === caption || element.textContent === caption,
  );
  if (!found) throw new Error(`Missing button: ${caption}`);
  found.click();
}

function changeSelection(root: ParentNode, label: string, value: string): void {
  const field = get<HTMLSelectElement>(root, `select[aria-label="${label}"]`);
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

// Model the Gecko host boundary: option presses target a XUL menu outside the
// workspace, and the native selection commits only if its HTML select survives.
function nativeOption(panel: HTMLElement, label: string, value: string): void {
  const field = get<HTMLSelectElement>(panel, `select[aria-label="${label}"]`);
  const option = [...field.options].find((option) => option.value === value);
  expect(option, `Missing option ${value}`).toBeDefined();
  field.focus();
  Object.defineProperty(field, 'openInParentProcess', { value: true, configurable: true });
  const xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
  const popup = document.createElementNS(xul, 'menupopup');
  popup.id = 'ContentSelectDropdownPopup';
  const item = popup.appendChild(document.createElementNS(xul, 'menuitem'));
  document.body.append(popup);
  item.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
  popup.remove();
  Reflect.deleteProperty(field, 'openInParentProcess');
  if (field.isConnected) changeSelection(panel, label, value);
}

function type(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(element: HTMLElement, name: string, options: KeyboardEventInit = {}): boolean {
  return element.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }),
  );
}

function openTool(root: ParentNode, title: string): void {
  get<HTMLButtonElement>(root, `button[aria-haspopup="dialog"][title="${title}"]`).click();
}

function header(root: ParentNode, column: Column): HTMLButtonElement {
  return get(root, `button[data-header-column="${column}"]`);
}

function active(host: WorkspaceHost): View {
  const settings = host.settings();
  return settings.views.find((view) => view.id === settings.active)!;
}

function cell(root: ParentNode, column: Column, id = 1): HTMLTableCellElement {
  return get(root, `tr[data-item-id="${id}"] td[data-column="${column}"]`);
}

function rowIds(root: ParentNode): number[] {
  return Array.from(root.querySelectorAll<HTMLElement>('tr[data-item-id]'), (row) =>
    Number(row.dataset.itemId),
  );
}

function selectAllInput(root: ParentNode): HTMLInputElement {
  return get(root, 'thead input[aria-label="Select all matching items"]');
}

function rowSelection(root: ParentNode, id: number): HTMLInputElement {
  return get(root, `tr[data-item-id="${id}"] td:first-child input[type="checkbox"]`);
}

function groupTitles(root: ParentNode): (string | null)[] {
  return Array.from(root.querySelectorAll('tbody button[aria-expanded]'), (button) =>
    button.getAttribute('aria-label'),
  );
}

async function settle(): Promise<void> {
  // Let host results, data reloads and the deferred focus render resolve.
  for (let index = 0; index < 4; index++) await Promise.resolve();
}

function focusedKey(name: string, options?: KeyboardEventInit): boolean {
  return key(document.activeElement as HTMLElement, name, options);
}

async function scrollGrid(viewport: HTMLElement, top: number): Promise<void> {
  viewport.scrollTop = top;
  viewport.dispatchEvent(new Event('scroll'));
  await new Promise<void>((done) => requestAnimationFrame(() => done()));
  await settle();
}

describe('Zotero Bases workspace', () => {
  it('writes view controls immediately and keeps a focused filter input through settings notifications', async () => {
    const { host } = fixture([sample, { ...sample, id: 2, title: 'Beta' }]);
    const popOut = vi.fn();
    const global = createGlobalPreferenceStore(preferences().prefs);
    global.set('defaultDensity', 'comfortable');
    const { root } = attach(host, { language: 'en', popOut, global });
    await settle();
    click(root, 'Open in new window');
    expect(popOut).toHaveBeenCalledTimes(1);
    click(root, 'New view');
    click(root, 'New table view');
    const created = active(host);
    expect(created).toMatchObject({
      name: 'New view',
      scope: 'personal',
      density: 'comfortable',
      frozenCount: 1,
      sorts: [
        { column: 'added', direction: 'desc' },
        { column: 'title', direction: 'asc' },
      ],
    });
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('New view');
    changeSelection(root, 'Scope', 'group');
    expect(active(host).scope).toBe('group');
    expect(host.load).toHaveBeenLastCalledWith('group');

    openTool(root, 'Columns');
    get<HTMLInputElement>(root, 'input[data-focus="year"]').click();
    expect(active(host).columns).not.toContain('year');
    openTool(root, 'Sort');
    changeSelection(root, 'Sort direction · 1', 'asc');
    expect(active(host).sorts).toEqual([
      { column: 'added', direction: 'asc' },
      { column: 'title', direction: 'asc' },
    ]);
    openTool(root, 'Filters');
    click(root, 'Add condition');
    expect(active(host).filters).toEqual([{ column: 'title', operator: 'has', value: '' }]);
    changeSelection(root, 'Filter condition · 1', 'contains');
    const field = get<HTMLInputElement>(root, 'input[aria-label="Filter value · 1"]');
    field.focus();
    type(field, 'Al');
    await host.change({ kind: 'define', property: { key: 'Impact', type: 'number' } });
    expect(document.activeElement).toBe(field);
    type(field, 'Alpha 1');
    await settle();
    expect(field.isConnected).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(active(host).filters).toEqual([
      { column: 'title', operator: 'contains', value: 'Alpha 1' },
    ]);
    expect(rowIds(root)).toEqual([1]);
    field.blur();
    await settle();

    openTool(root, 'View actions');
    click(root, 'Copy view');
    expect(active(host)).toMatchObject({ name: 'New view (copy)', scope: 'group' });
    expect(active(host).id).not.toBe(created.id);
    expect(active(host).frozenCount).toBe(1);
    expect(active(host).filters[0]?.value).toBe('Alpha 1');
    openTool(root, 'View actions');
    click(root, 'Rename view');
    const name = get<HTMLInputElement>(root, 'input[aria-label="View name"]');
    name.value = 'Reading list';
    key(name, 'Enter');
    expect(active(host).name).toBe('Reading list');
    openTool(root, 'View actions');
    click(root, 'Delete view');
    expect(active(host).id).toBe(created.id);
    click(root, 'Library');
    expect(active(host).id).toBe('default');
    expect(active(host).frozenCount).toBeUndefined();
  });

  it('keeps table geometry and board settings independent when changing layout', async () => {
    const base: View = {
      ...defaultView,
      columns: ['title', 'year', 'property:Reviewed'],
      columnWidths: { title: 270 },
      density: 'wrap',
      group: { column: 'year', direction: 'desc' },
      frozenCount: 1,
    };
    const { host } = fixture([sample], base);
    const { root } = attach(host);
    await settle();
    openTool(root, 'View actions');
    click(root, 'Switch to board view');
    expect(active(host).board).toMatchObject({ laneField: 'property:Status' });
    expect(get(root, '.zb-table-wrap').hidden).toBe(true);
    expect(
      get(root, 'select[aria-label="Row density"]').closest('.zb-select-chevron'),
    ).toHaveProperty('hidden', true);
    openTool(root, 'Lanes');
    get<HTMLInputElement>(root, 'input[aria-label="Hide empty lanes"]').click();
    click(root, 'Collapse all lanes');
    expect(active(host).board?.collapsedLanes).not.toEqual([]);
    focusedKey('Escape');
    openTool(root, 'Card fields');
    expect(root.querySelector('input[data-focus="property:Status"]')).toBeNull();
    get<HTMLInputElement>(root, 'input[data-focus="year"]').click();
    expect(active(host).board?.cardFields).not.toContain('year');
    const savedBoard = active(host).board;

    openTool(root, 'View actions');
    click(root, 'Switch to table view');
    expect(active(host)).toMatchObject(base);
    expect(get(root, '.zb-table-wrap').hidden).toBe(false);
    openTool(root, 'View actions');
    click(root, 'Switch to board view');
    expect(active(host).board).toEqual(savedBoard);
    expect(active(host).columns).toEqual(base.columns);
  });

  it('creates an empty board with an actionable property guide and falls back after deletion', async () => {
    const { host } = fixture([sample], defaultView, []);
    const { root } = attach(host);
    await settle();
    click(root, 'New view');
    click(root, 'New board view');
    expect(active(host)).toMatchObject({
      layout: 'board',
      board: { cardFields: ['creators', 'year', 'tags', 'pdf'], hideEmptyLanes: false },
    });
    const emptyBoard = get(root, '.zb-board');
    get<HTMLButtonElement>(emptyBoard, 'button').click();
    expect(get(root, '.zb-popover').getAttribute('aria-label')).toBe('Properties');
    await host.change({
      kind: 'define',
      property: { key: 'Stage', type: 'single-select', options: ['Read'] },
    });
    await host.change({ kind: 'define', property: { key: 'Impact', type: 'rating' } });
    await settle();
    openTool(root, 'Lanes');
    expect(get<HTMLSelectElement>(root, 'select[aria-label="Lane field"]').value).toBe(
      'property:Stage',
    );
    await host.change({ kind: 'delete-property', key: 'Stage', clean: false });
    await settle();
    expect(get<HTMLSelectElement>(root, 'select[aria-label="Lane field"]').value).toBe(
      'property:Impact',
    );
    expect(emptyBoard.querySelectorAll('.zb-board-lane').length).toBe(6);
  });

  it('lets only the active board handle card commands, without claiming input and open popovers', async () => {
    const row = { ...sample, extra: 'Impact: 3' };
    const view: View = {
      ...defaultView,
      layout: 'board',
      board: {
        laneField: 'property:Impact',
        cardFields: [],
        hideEmptyLanes: false,
        collapsedLanes: [],
      },
    };
    const { host } = fixture([row], view, researchProperties);
    const { root } = attach(host);
    await settle();
    const card = () => get(root, '.zb-board-card[data-item-id="1"]');
    const board = get(root, '.zb-board');
    expect(get(root, '.zb-table-status').textContent).toBe('1 items');
    const search = get<HTMLInputElement>(root, 'input[role="searchbox"]');
    search.focus();
    expect(focusedKey('5')).toBe(true);
    const lanes = get<HTMLButtonElement>(root, 'button[aria-haspopup="dialog"][title="Lanes"]');
    lanes.click();
    card().focus();
    expect(focusedKey('5')).toBe(true);
    expect(host.setProperty).not.toHaveBeenCalled();
    expect(focusedKey('Escape')).toBe(false);
    expect(lanes.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(card());
    expect(focusedKey('5', { isComposing: true })).toBe(true);
    expect(focusedKey('5', { repeat: true })).toBe(true);
    expect(focusedKey(' ')).toBe(true);
    expect(focusedKey('5')).toBe(false);
    await settle();
    expect(host.setProperty).toHaveBeenCalledExactlyOnceWith(1, 'Impact', '5');
    expect(document.activeElement).toBe(card());
    expect(focusedKey('Enter')).toBe(false);
    expect(host.openItem).toHaveBeenLastCalledWith(1, false);
    expect(focusedKey('Escape')).toBe(false);
    expect(document.activeElement).toBe(board);
    expect(focusedKey('Escape')).toBe(false);
    expect(board.contains(document.activeElement)).toBe(false);
  });

  it('keeps the header Columns popover anchored through order, visibility, and default resets', async () => {
    const { host } = fixture([sample], { ...defaultView, columns: ['title'] });
    const { root } = attach(host);
    await settle();
    const action = get<HTMLButtonElement>(root, 'thead th:last-child button');
    expect(action.getAttribute('aria-label')).toBe('Show columns');
    action.click();
    expect(get<HTMLInputElement>(root, 'input[data-focus="title"]').disabled).toBe(true);
    const year = get<HTMLInputElement>(root, 'input[data-focus="year"]');
    expect(year.checked).toBe(false);
    year.click();
    expect(active(host).columns).toEqual(['title', 'year']);
    expect(cell(root, 'year', 1).textContent).toBe('2024');
    click(root, 'Move up · Year');
    expect(active(host).columns).toEqual(['year', 'title']);
    click(root, 'Restore default column order');
    expect(active(host).columns).toEqual(['title', 'year']);
    expect(focusedKey('Escape')).toBe(false);
    expect(document.activeElement).toBe(get(root, 'thead th:last-child button'));

    header(root, 'year').click();
    click(root, 'Hide this column');
    expect(active(host).columns).toEqual(['title']);
    header(root, 'title').click();
    expect(
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (control) => control.textContent === 'Hide this column',
      )?.disabled,
    ).toBe(true);
  });

  it('finds English, Chinese and key matches, expands only matching column groups, and clears before closing', async () => {
    const { host } = fixture([sample], { ...defaultView, columns: ['title'] });
    const { root, teardown } = attach(host);
    await settle();
    openTool(root, 'Columns');
    const search = get<HTMLInputElement>(root, 'input[aria-label="Search columns"]');
    const more = () => get(root, '[data-column-group="more"] [aria-expanded]');
    expect(document.activeElement).toBe(search);
    expect(more().getAttribute('aria-expanded')).toBe('false');
    more().click();
    expect(get(root, '[data-column-group="more"] > .zb-pane-list').hidden).toBe(false);
    type(search, '页码');
    expect(get(root, '[data-column-group="more"] > .zb-pane-list').hidden).toBe(false);
    expect(root.querySelector('[data-column-group="common"]')).toBeNull();
    get<HTMLInputElement>(root, 'input[data-focus="pages"]').click();
    type(search, 'Language');
    expect(root.querySelector('input[data-focus="language"]')).not.toBeNull();
    expect(root.querySelector('input[data-focus="pages"]')).toBeNull();
    type(search, 'seriesTitle');
    expect(root.querySelector('input[data-focus="seriesTitle"]')).not.toBeNull();
    expect(root.querySelector('input[data-focus="pages"]')).toBeNull();
    expect(key(search, 'Escape')).toBe(false);
    expect(search.value).toBe('');
    expect(more().getAttribute('aria-expanded')).toBe('false');
    expect(key(search, 'Escape')).toBe(false);
    expect(document.activeElement).toBe(get(root, 'button[title="Columns"]'));
    teardown();
    const remount = attach(host).root;
    await settle();
    expect(cell(remount, 'pages')).toBeDefined();
  });

  it('uses registry choices in collection filters and groups native dates by month', async () => {
    const { host } = fixture(
      [
        { ...sample, collections: ['Methods', 'Review'], lastRead: '2025-04-02T10:00:00Z' },
        {
          ...sample,
          id: 2,
          title: 'Beta',
          collections: ['Review'],
          lastRead: '2025-04-19T10:00:00Z',
        },
        { ...sample, id: 3, title: 'Gamma', collections: ['Methods'] },
      ],
      { ...defaultView, columns: ['title', 'lastRead'] },
    );
    const { root } = attach(host);
    await settle();
    openTool(root, 'Filters');
    click(root, 'Add condition');
    changeSelection(root, 'Filter field · 1', 'collections');
    changeSelection(root, 'Filter condition · 1', 'contains');
    changeSelection(root, 'Filter value · 1', 'Methods');
    expect(rowIds(root)).toEqual([1, 3]);
    openTool(root, 'Grouping');
    changeSelection(root, 'Group by', 'lastRead');
    expect(groupTitles(root)).toEqual(['2025-04 (1)', 'No value (1)']);
    changeSelection(root, 'Group by', 'collections');
    changeSelection(root, 'Collection to group by', 'Review');
    expect(groupTitles(root)).toEqual([
      'Not in collection: Review (1)',
      'In collection: Review (1)',
    ]);
    expect(rowIds(root)).toEqual([3, 1]);
    expect(host.load).toHaveBeenCalledTimes(1);
  });

  it('opens and edits custom links independently, without saving or opening unsafe URLs', async () => {
    const open = vi.fn();
    const copy = vi.fn();
    const { host } = fixture(
      [
        { ...sample, extra: 'Repository: https://example.org/source' },
        { ...sample, id: 2, extra: 'Repository: javascript:alert(1)' },
      ],
      { ...defaultView, columns: ['property:Repository'] },
      researchProperties,
    );
    const { root } = attach(host, { language: 'en', linkActions: { open, copy } });
    await settle();
    const linkCell = cell(root, 'property:Repository');
    expect(cell(root, 'property:Repository', 2).querySelector('.zb-link-open')).toBeNull();
    linkCell.click();
    expect(document.activeElement).toBe(linkCell);
    expect(linkCell.querySelector('.zb-editor')).toBeNull();
    expect(open).not.toHaveBeenCalled();
    get<HTMLButtonElement>(linkCell, '.zb-link-open').click();
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.org/source');

    focusedKey('Enter');
    const field = get<HTMLInputElement>(linkCell, '.zb-editor input');
    type(field, 'javascript:alert(1)');
    focusedKey('Enter');
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(host.setProperty).not.toHaveBeenCalled();
    type(field, 'http://example.org/new');
    focusedKey('Enter');
    expect(host.setProperty).toHaveBeenCalledExactlyOnceWith(
      1,
      'Repository',
      'http://example.org/new',
    );
  });

  it('saves a calendar pick in one click, but validates typed dates and discards drafts', async () => {
    const { host } = fixture(
      [{ ...sample, extra: 'ReadOn: 2024-02-01' }],
      { ...defaultView, columns: ['property:ReadOn'] },
      researchProperties,
    );
    const { root } = attach(host);
    await settle();
    const open = () => {
      cell(root, 'property:ReadOn').focus();
      focusedKey('Enter');
      return get<HTMLInputElement>(root, '.zb-editor input');
    };
    let field = open();
    expect(field.type).toBe('text');
    const leapDay = () => get<HTMLButtonElement>(root, '.zb-editor button[data-date="2024-02-29"]');
    leapDay().focus();
    expect(root.querySelector('.zb-editor')).not.toBeNull();
    leapDay().click();
    expect(host.setProperty).toHaveBeenCalledExactlyOnceWith(1, 'ReadOn', '2024-02-29');
    expect(root.querySelector('.zb-editor')).toBeNull();
    await settle();
    expect(cell(root, 'property:ReadOn').textContent).toBe('2024-02-29');
    expect(document.activeElement).toBe(cell(root, 'property:ReadOn'));

    field = open();
    type(field, '2024-02-10');
    header(root, 'property:ReadOn').focus();
    expect(root.querySelector('.zb-editor')).toBeNull();
    field = open();
    type(field, '2024-02-11');
    focusedKey('Escape');
    expect(host.setProperty).toHaveBeenCalledTimes(1);
    expect(cell(root, 'property:ReadOn').textContent).toBe('2024-02-29');

    field = open();
    type(field, '2023-02-29');
    focusedKey('Enter');
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(host.setProperty).toHaveBeenCalledTimes(1);
    type(field, '2024-03-01');
    focusedKey('Enter');
    await settle();
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'ReadOn', '2024-03-01');
    expect(cell(root, 'property:ReadOn').textContent).toBe('2024-03-01');

    open();
    click(get(root, '.zb-inline-calendar'), 'Clear');
    expect(root.querySelector('.zb-editor')).toBeNull();
    expect(host.setProperty).toHaveBeenCalledTimes(3);
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'ReadOn', null);
  });

  it('rates writable cells with digits and applies all three bulk types only to the selected rows', async () => {
    const { host } = fixture(
      [
        { ...sample, extra: 'DOI: 10.1000/a\nImpact: 1\nImpact: 1' },
        { ...sample, id: 2, writable: false, extra: 'Impact: 2' },
        { ...sample, id: 3, extra: 'Impact: 5' },
      ],
      { ...defaultView, columns: ['property:Impact', 'property:Repository', 'property:ReadOn'] },
      researchProperties,
    );
    const { root } = attach(host);
    await settle();
    cell(root, 'property:Impact').focus();
    expect(focusedKey('Enter')).toBe(false);
    expect(document.activeElement).toBe(get(cell(root, 'property:Impact'), '[data-rating="1"]'));
    expect(focusedKey('4')).toBe(true);
    expect(focusedKey('Enter')).toBe(true);
    expect(focusedKey(' ')).toBe(true);
    openTool(root, 'Filters');
    cell(root, 'property:Impact').focus();
    expect(focusedKey('4')).toBe(true);
    expect(focusedKey('Escape')).toBe(false);
    expect(focusedKey('4', { isComposing: true })).toBe(true);
    expect(focusedKey('4', { repeat: true })).toBe(true);
    expect(focusedKey('4', { ctrlKey: true })).toBe(true);
    expect(focusedKey('4', { altKey: true })).toBe(true);
    expect(focusedKey('4', { metaKey: true })).toBe(true);
    expect(focusedKey('4', { shiftKey: true })).toBe(true);
    expect(host.setProperty).not.toHaveBeenCalled();
    expect(focusedKey('4')).toBe(false);
    await settle();
    expect(get(cell(root, 'property:Impact'), '[aria-pressed="true"]').dataset.rating).toBe('4');
    expect(focusedKey('0')).toBe(false);
    await settle();
    expect(host.setProperty.mock.calls).toEqual([
      [1, 'Impact', '4'],
      [1, 'Impact', null],
    ]);
    cell(root, 'property:Impact', 2).focus();
    expect(focusedKey('3')).toBe(true);
    cell(root, 'property:ReadOn').focus();
    focusedKey('Enter');
    const editor = get(root, '.zb-editor input');
    expect(focusedKey('f', { ctrlKey: true })).toBe(true);
    expect(document.activeElement).toBe(editor);
    expect(focusedKey('3')).toBe(true);
    focusedKey('Escape');
    expect(host.setProperty).toHaveBeenCalledTimes(2);

    rowSelection(root, 1).click();
    rowSelection(root, 2).click();
    changeSelection(root, 'Bulk property', 'Impact');
    changeSelection(root, 'Bulk value', '3');
    await settle();
    for (const [name, value] of [
      ['Repository', 'https://example.org/code'],
      ['ReadOn', '2024-02-05'],
    ] as const) {
      changeSelection(root, 'Bulk property', name);
      type(get(root, 'input[aria-label="Bulk value"]'), value);
      click(root, 'Set value');
      await settle();
    }
    expect((await host.load('personal')).rows.map(({ extra }) => extra)).toEqual([
      'DOI: 10.1000/a\nImpact: 3\nRepository: https://example.org/code\nReadOn: 2024-02-05',
      'Impact: 2',
      'Impact: 5',
    ]);
    click(root, 'Clear property values');
    await settle();
    expect((await host.load('personal')).rows[0]?.extra).toBe(
      'DOI: 10.1000/a\nImpact: 3\nRepository: https://example.org/code\n',
    );
  });

  it('pins measured columns and offsets on recycled rows, and reveals the next keyboard cell', async () => {
    const rows = Array.from({ length: 320 }, (_, index) => ({ ...sample, id: index + 1 }));
    const { host } = fixture(rows, {
      ...defaultView,
      columns: ['title', 'year', 'type'],
      sorts: [],
    });
    const { root } = attach(host);
    await settle();
    const viewport = get(root, '.zb-table-wrap');
    let width = 600;
    Object.defineProperty(viewport, 'clientWidth', { get: () => width });
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 0, width, 620));
    const headings = Array.from(root.querySelectorAll('thead th'));
    for (const [index, rendered] of [36, 240, 120, 90].entries())
      vi.spyOn(headings[index]!, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, rendered, 30),
      );
    expect(cell(root, 'title').hasAttribute('data-frozen')).toBe(false);
    header(root, 'year').click();
    click(root, 'Freeze through this column');
    expect(active(host).frozenCount).toBe(2);
    expect(cell(root, 'year').style.getPropertyValue('--zb-frozen-offset')).toBe('276px');
    expect(viewport.hasAttribute('data-frozen-shadow')).toBe(false);

    width = 500;
    get(header(root, 'title').parentElement!, '.zb-column-grip').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(active(host).frozenCount).toBe(2);
    expect(cell(root, 'title').hasAttribute('data-frozen-end')).toBe(true);
    expect(cell(root, 'year').hasAttribute('data-frozen')).toBe(false);
    viewport.scrollLeft = 112;
    await scrollGrid(viewport, 0);
    expect(viewport.hasAttribute('data-frozen-shadow')).toBe(true);
    const year = cell(root, 'year');
    vi.spyOn(year, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(286 - viewport.scrollLeft, 35, 120, 35),
    );
    cell(root, 'title').focus();
    expect(focusedKey('ArrowRight')).toBe(false);
    expect(document.activeElement).toBe(year);
    expect(year.getBoundingClientRect().left).toBe(286);
    viewport.dispatchEvent(new Event('scroll'));
    expect(viewport.hasAttribute('data-frozen-shadow')).toBe(false);
    await scrollGrid(viewport, 20_000);
    expect(rowIds(root).at(-1)).toBe(320);
    expect(cell(root, 'title', 320).style.getPropertyValue('--zb-frozen-offset')).toBe('36px');

    header(root, 'title').click();
    click(root, 'Unfreeze columns');
    expect(active(host).frozenCount).toBe(0);
    expect(root.querySelector('[data-frozen]')).toBeNull();
  });

  it('keeps the last wrapped row in view when measuring a resize clamps native scrollTop', async () => {
    const rows = Array.from({ length: 320 }, (_, index) => ({ ...sample, id: index + 1 }));
    const { host } = fixture(rows, {
      ...defaultView,
      columns: ['title', 'year'],
      sorts: [],
      density: 'wrap',
      frozenCount: 1,
    });
    const { root } = attach(host);
    await settle();
    const viewport = get(root, '.zb-table-wrap');
    Object.defineProperties(viewport, {
      clientHeight: { value: 500 },
      clientWidth: { value: 720 },
      scrollHeight: { value: 320 * 34 },
    });
    const bottom = viewport.scrollHeight - viewport.clientHeight;
    await scrollGrid(viewport, bottom);
    expect(rowIds(root).at(-1)).toBe(320);
    const title = header(root, 'title').parentElement!;
    const column = get<HTMLTableColElement>(root, 'col[data-column=title]');
    const oldWidth = column.style.width;
    let clamped = false;
    vi.spyOn(title, 'getBoundingClientRect').mockImplementation(() => {
      if (!clamped && column.style.width !== oldWidth) {
        // The layout read occurs after the width write and can clamp the viewport immediately.
        clamped = true;
        viewport.scrollTop = bottom - 1200;
      }
      return new DOMRect(36, 0, parseFloat(column.style.width), 34);
    });
    key(get(title, '.zb-column-grip'), 'ArrowRight');
    await vi.waitFor(() => expect(viewport.scrollTop).toBe(bottom));
    expect(clamped).toBe(true);
    expect(rowIds(root).at(-1)).toBe(320);
  });

  it('selects a link cell as usual and only opens or copies through its explicit buttons', async () => {
    const open = vi.fn();
    const copy = vi.fn();
    const { host } = fixture([{ ...sample, doi: '10.1000/fixture' }], {
      ...defaultView,
      columns: ['title', 'doi'],
    });
    const { root } = attach(host, { language: 'en', linkActions: { open, copy } });
    await settle();
    const doi = cell(root, 'doi');
    doi.click();
    expect(document.activeElement).toBe(doi);
    expect(doi.hasAttribute('data-active-cell')).toBe(true);
    key(doi, 'Enter');
    expect(key(doi, 'i')).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    const links = [...doi.querySelectorAll<HTMLButtonElement>('.zb-link-control')];
    links[0]!.focus();
    expect(focusedKey('Enter')).toBe(true);
    expect(focusedKey(' ')).toBe(true);
    expect(links.map(({ tabIndex }) => tabIndex)).toEqual([0, 0]);
    doi.querySelector<HTMLButtonElement>('.zb-link-control[aria-label^="Copy DOI"]')!.click();
    expect(copy).toHaveBeenCalledExactlyOnceWith('10.1000/fixture');
    doi
      .querySelector<HTMLButtonElement>('.zb-link-control[aria-label^="Open external link"]')!
      .click();
    expect(open).toHaveBeenCalledExactlyOnceWith('https://doi.org/10.1000/fixture');
    expect(host.openItem).not.toHaveBeenCalled();
  });

  it('drags headers across an insertion boundary without opening the column menu', async () => {
    const { host } = fixture([sample], { ...defaultView, columns: ['title', 'year', 'type'] });
    const { root, teardown } = attach(host);
    await settle();
    const title = header(root, 'title');
    for (const [index, column] of active(host).columns.entries()) {
      const left = 40 + index * 100;
      vi.spyOn(header(root, column).parentElement!, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(left, 0, 100, 34),
      );
    }
    const pointer = (kind: string, x: number) => {
      const event = new MouseEvent(`pointer${kind}`, { bubbles: true, clientX: x });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      title.dispatchEvent(event);
    };
    pointer('down', 80);
    pointer('move', 82);
    expect(root.querySelector('.zb-column-drop')).toBeNull();
    pointer('move', 220);
    expect(get(root, '.zb-column-drop').style.left).toBe('240px');
    pointer('up', 220);
    expect(root.querySelector('.zb-column-drop')).toBeNull();
    title.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(root.querySelector('.zb-popover')).toBeNull();
    expect(active(host).columns).toEqual(['year', 'title', 'type']);
    teardown();
    const remount = attach(host).root;
    await settle();
    expect(
      [...remount.querySelectorAll<HTMLButtonElement>('[data-header-column]')].map(
        (button) => button.dataset.headerColumn,
      ),
    ).toEqual(['year', 'title', 'type']);
  });

  it('opens the selected property from its header and immediately repaints only its option', async () => {
    const { host } = fixture();
    const { root } = attach(host);
    await settle();
    header(root, 'property:Status').click();
    click(root, 'Edit property');
    const pill = () => get(cell(root, 'property:Status'), '.zb-cell-pill');
    expect(pill().textContent).toBe('Reading');
    const previous = pill().dataset.tone;
    const color = previous === 'rose' ? 'green' : 'rose';
    const label = color === 'rose' ? 'Magenta' : 'Green';
    click(root, `${label} · Status: Reading`);
    await settle();
    expect(pill().dataset.tone).toBe(color);
    expect(host.settings().properties.find(({ key }) => key === 'Status')?.optionColors).toEqual({
      Reading: color,
    });
    click(root, 'Automatic color · Status: Reading');
    await settle();
    expect(pill().dataset.tone).toBe(previous);
    expect(focusedKey('Escape')).toBe(false);
    expect(document.activeElement).toBe(header(root, 'property:Status'));
  });

  it('recolors a multi-select option from its inline editor without changing the selected value', async () => {
    const { host } = fixture([
      { ...sample, extra: 'Method: Survey' },
      { ...sample, id: 2, extra: 'Method: Survey' },
    ]);
    const { root } = attach(host);
    const { root: other } = attach(host);
    await settle();
    get(cell(root, 'property:Method'), 'button').click();
    click(root, 'Option color · Method: Survey');
    const swatch = get<HTMLButtonElement>(root, 'button[aria-label="Red · Method: Survey"]');
    swatch.focus();
    swatch.click();
    await settle();
    expect(document.activeElement).toBe(swatch);
    expect(swatch.getAttribute('aria-pressed')).toBe('true');
    for (const [surface, id] of [
      [root, 1],
      [root, 2],
      [other, 1],
    ] as const) {
      const pill = get(cell(surface, 'property:Method', id), '.zb-cell-pill');
      expect(pill.textContent).toBe('Survey');
      expect(pill.dataset.tone).toBe('red');
    }
    expect(host.setProperty).not.toHaveBeenCalled();
  });

  it('repaints all workspaces with native, exact, then longest-prefix tag color precedence', async () => {
    const tags = [
      'topic/native',
      'topic/long/exact',
      'topic/long/child',
      'topic/other',
      'uncolored',
    ];
    const row = { ...sample, tags, nativeTagColors: new Map([['topic/native', '#da4453']]) };
    const { host } = fixture([row], { ...defaultView, columns: ['tags'] });
    const { root } = attach(host);
    const { root: other } = attach(host);
    await settle();
    header(root, 'tags').click();
    click(root, 'Tag colors');
    const name = get<HTMLInputElement>(root, 'input[aria-label="Tag or prefix"]');
    changeSelection(root, 'Match by', 'prefix');
    type(name, 'topic/');
    click(root, 'Blue');
    type(name, 'topic/long/');
    click(root, 'Violet');
    changeSelection(root, 'Match by', 'tag');
    type(name, 'topic/long/exact');
    click(root, 'Orange');
    await settle();
    for (const surface of [root, other]) {
      const pills = Array.from(
        cell(surface, 'tags').querySelectorAll<HTMLElement>(
          '.zb-cell-pill:not(.zb-cell-pill-more)',
        ),
      );
      expect(pills[0]?.style.getPropertyValue('--zb-native-tag-color')).toBe('#da4453');
      expect(pills.map((pill) => pill.dataset.tone)).toEqual([
        undefined,
        'orange',
        'violet',
        'sky',
        undefined,
      ]);
    }
    click(root, 'Use inherited color');
    await settle();
    expect(cell(root, 'tags').querySelectorAll<HTMLElement>('.zb-cell-pill')[1]?.dataset.tone).toBe(
      'violet',
    );
    expect(host.changeTag).not.toHaveBeenCalled();
  });

  it('promotes, appends, reverses, reorders, removes and clears sorts without duplicating fields', async () => {
    const rows = [
      sample,
      { ...sample, id: 2, title: 'Beta' },
      { ...sample, id: 3, title: 'Gamma', year: '2023' },
    ];
    const { host } = fixture(rows, {
      ...defaultView,
      sorts: [],
      columns: ['title', 'year', 'type'],
    });
    const { root } = attach(host);
    await settle();
    header(root, 'year').click();
    click(root, 'Sort ascending');
    expect(header(root, 'year').textContent).toContain('↑');
    header(root, 'title').click();
    click(root, 'Add as secondary sort');
    header(root, 'title').click();
    click(root, 'Reverse sort direction');
    expect(rowIds(root)).toEqual([3, 2, 1]);
    expect(header(root, 'year').textContent).toContain('↑1');
    expect(header(root, 'title').textContent).toContain('↓2');
    expect(header(root, 'year').parentElement?.getAttribute('aria-sort')).toBe('ascending');
    expect(header(root, 'title').parentElement?.hasAttribute('aria-sort')).toBe(false);
    openTool(root, 'Sort');
    click(root, 'Move up · Title');
    expect(rowIds(root)).toEqual([3, 2, 1]);
    expect(header(root, 'title').textContent).toContain('↓1');
    click(root, 'Remove sort · Year');
    expect(header(root, 'title').textContent).toBe('Title↓');
    click(root, 'Add sort');
    changeSelection(root, 'Sort field · 2', 'type');
    expect(active(host).sorts).toEqual([
      { column: 'title', direction: 'desc' },
      { column: 'type', direction: 'asc' },
    ]);
    click(root, 'Clear sorting');
    expect(active(host).sorts).toEqual([]);
    expect(rowIds(root)).toEqual([1, 2, 3]);
    expect(root.querySelector('.zb-sort-indicator')).toBeNull();
  });

  it('commits native dropdown choices in all workspace popovers without dismissing them', async () => {
    const rows = [
      { ...sample, citationKey: 'K', pages: '002', lastRead: '2025-04-02' },
      { ...sample, id: 2, title: 'Beta', citationKey: 'A', pages: '001' },
      { ...sample, id: 3, title: 'Gamma', citationKey: 'K', pages: '001' },
    ];
    const { host } = fixture(rows, {
      ...defaultView,
      columns: ['title', 'citationKey', 'pages'],
      sorts: [
        { column: 'title', direction: 'asc' },
        { column: 'year', direction: 'asc' },
      ],
    });
    const { root } = attach(host);
    await settle();
    const choose = (label: string, value: string) =>
      nativeOption(get(root, '.zb-popover'), label, value);

    openTool(root, 'Sort');
    choose('Sort field · 1', 'citationKey');
    expect(rowIds(root)).toEqual([2, 1, 3]);
    expect(header(root, 'citationKey').textContent).toContain('↑1');
    choose('Sort field · 2', 'pages');
    expect(rowIds(root)).toEqual([2, 3, 1]);
    expect(header(root, 'pages').textContent).toContain('↑2');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Sort field · 2');

    openTool(root, 'Filters');
    click(root, 'Add condition');
    choose('Filter field · 1', 'accessDate');
    expect(active(host).filters[0]?.column).toBe('accessDate');
    expect(get(root, '.zb-popover').getAttribute('aria-label')).toBe('Filters');
    click(root, 'Remove condition · 1');

    openTool(root, 'Grouping');
    choose('Group by', 'lastRead');
    expect(groupTitles(root)).toEqual(['2025-04 (1)', 'No value (2)']);
    expect(get(root, '.zb-popover').getAttribute('aria-label')).toBe('Grouping');

    openTool(root, 'Properties');
    choose('Property type', 'multi-select');
    const options = get<HTMLTextAreaElement>(root, 'textarea[aria-label="Options (one per line)"]');
    expect(options.hidden).toBe(false);
    expect(get(root, '.zb-popover').contains(options)).toBe(true);
  });

  it('returns focus from a popover without clearing search or the selected row', async () => {
    vi.useFakeTimers();
    try {
      const { root } = attach(fixture().host);
      await settle();
      const search = get<HTMLInputElement>(root, '[role=searchbox]');
      type(search, 'Alpha');
      await vi.advanceTimersByTimeAsync(300);
      rowSelection(root, 1).click();
      openTool(root, 'Filters');
      const filters = get(root, 'button[title="Filters"]');
      const filterFocus = document.activeElement;
      expect(focusedKey('f', { ctrlKey: true })).toBe(true);
      expect(document.activeElement).toBe(filterFocus);
      expect(filters.getAttribute('aria-expanded')).toBe('true');
      expect(focusedKey('Escape')).toBe(false);
      expect(document.activeElement).toBe(filters);
      expect(search.value).toBe('Alpha');
      expect(rowSelection(root, 1).checked).toBe(true);
      expect(focusedKey('Escape')).toBe(false);
      expect(search.value).toBe('');
      expect(rowSelection(root, 1).checked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('searches unmounted rows and combines the result with saved filters and grouping', async () => {
    vi.useFakeTimers();
    try {
      const rows = Array.from({ length: 65 }, (_, index) => ({
        ...sample,
        id: index + 1,
        title: `Study ${index + 1}`,
        year: index === 63 ? '2025' : '2026',
        creators:
          index >= 63
            ? `${Array.from({ length: 19 }, (_, i) => `Collaborator ${i + 1}`).join('; ')}; Hidden Author`
            : sample.creators,
      }));
      const { host } = fixture(rows, {
        ...defaultView,
        columns: ['title', 'creators'],
        filters: [{ column: 'year', operator: 'equals', value: '2026' }],
        group: { column: 'year', direction: 'asc' },
      });
      const { root } = attach(host);
      await settle();
      expect(rowIds(root).length).toBeLessThan(40);
      expect(rowIds(root)).not.toContain(65);
      get(root, '.zb-table-wrap').focus();
      const search = get<HTMLInputElement>(root, '[role=searchbox]');
      expect(focusedKey('f', { ctrlKey: true })).toBe(false);
      expect(document.activeElement).toBe(search);
      type(search, 'Hidden Author');
      await vi.advanceTimersByTimeAsync(300);
      expect(rowIds(root)).toEqual([65]);
      expect(cell(root, 'creators', 65).textContent).not.toContain('Hidden Author');
      expect(groupTitles(root)).toEqual(['2026 (1)']);
      expect(get(root, '.zb-table-status').textContent).toBe('Matched 1 / 65 items');

      type(search, 'not present');
      await vi.advanceTimersByTimeAsync(300);
      expect(rowIds(root)).toEqual([]);
      expect(get(root, '.zb-table-status').textContent).toBe('Matched 0 / 65 items');
      key(search, 'Escape');
      expect(rowIds(root)).toContain(1);
      expect(rowIds(root)).not.toContain(65);
      expect(active(host).filters).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps narrow-window search and its filter intact when collapsing or resizing', async () => {
    const media = Object.assign(new EventTarget(), { matches: true });
    vi.stubGlobal('matchMedia', () => media);
    vi.useFakeTimers();
    try {
      const { host } = fixture([sample, { ...sample, id: 2, title: 'Beta' }]);
      const { root } = attach(host);
      await settle();
      const trigger = get<HTMLButtonElement>(root, '.zb-search-toggle');
      const search = get<HTMLInputElement>(root, '[role=searchbox]');
      const field = get(root, `#${trigger.getAttribute('aria-controls')}`);
      const grid = get(root, '.zb-table-wrap');
      expect(search.placeholder).toBe('Search this scope');
      expect(search.hasAttribute('aria-keyshortcuts')).toBe(false);
      expect(trigger.hasAttribute('aria-keyshortcuts')).toBe(false);
      expect(field.hidden).toBe(true);
      trigger.click();
      expect(document.activeElement).toBe(search);
      type(search, 'Beta');
      await vi.advanceTimersByTimeAsync(300);
      expect(rowIds(root)).toEqual([2]);
      grid.focus();
      expect(field.hidden).toBe(true);
      expect(rowIds(root)).toEqual([2]);

      const outside = document.body.appendChild(document.createElement('button'));
      cleanups.push(() => outside.remove());
      outside.focus();
      expect(focusedKey('f', { ctrlKey: true })).toBe(true);
      expect(key(grid, 'f', { ctrlKey: true })).toBe(true);
      expect(document.activeElement).toBe(outside);
      const surface = get(root, '.zb-workspace');
      surface.focus();
      expect(key(outside, 'f', { metaKey: true })).toBe(true);
      expect(focusedKey('/')).toBe(true);
      for (const flags of [
        { ctrlKey: true, metaKey: true },
        { ctrlKey: true, altKey: true },
        { ctrlKey: true, shiftKey: true },
        { ctrlKey: true, isComposing: true },
        { ctrlKey: true, repeat: true },
      ]) {
        expect(focusedKey('f', flags)).toBe(true);
      }
      expect(document.activeElement).toBe(surface);
      expect(field.hidden).toBe(true);
      expect(focusedKey('f', { metaKey: true })).toBe(false);
      expect(field.hidden).toBe(false);
      expect(document.activeElement).toBe(search);
      expect(search.value).toBe('Beta');
      expect([search.selectionStart, search.selectionEnd]).toEqual([0, 4]);
      search.setSelectionRange(2, 2);
      expect(focusedKey('f', { ctrlKey: true })).toBe(false);
      expect([search.selectionStart, search.selectionEnd]).toEqual([0, 4]);
      for (const narrow of [false, true]) {
        media.matches = narrow;
        media.dispatchEvent(new Event('change'));
        expect(trigger.hidden).toBe(!narrow);
        expect(field.hidden).toBe(false);
        expect(document.activeElement).toBe(search);
        expect(rowIds(root)).toEqual([2]);
      }
      key(search, 'Escape');
      expect(field.hidden).toBe(false);
      expect(rowIds(root)).toEqual([1, 2]);
      key(search, 'Escape');
      expect(field.hidden).toBe(true);
      expect(document.activeElement).toBe(trigger);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('updates both surfaces without losing search or changing keyboard navigation', async () => {
    let current = DEFAULT_GLOBAL_PREFERENCES;
    const subscribers = new Set<(value: GlobalPreferences) => void>();
    const global: GlobalPreferenceStore = {
      read: () => current,
      set(key, value) {
        current = { ...current, [key]: value };
        for (const listener of subscribers) listener(current);
      },
      subscribe(listener) {
        subscribers.add(listener);
        return () => {
          subscribers.delete(listener);
        };
      },
    };
    const creators = 'Ada Lovelace; Grace Hopper; Mary Jackson';
    const rows = [sample, { ...sample, id: 2, title: 'Beta', creators }];
    const view: View = { ...defaultView, columns: ['title', 'creators'] };
    const main = attach(fixture(rows, view).host, { language: 'en', global, popOut: () => {} });
    const floating = attach(fixture(rows, view).host, { language: 'en', global });
    await settle();
    expect(cell(main.root, 'creators', 2).textContent).toBe('Ada Lovelace et al.');
    global.set('authorFormat', 'singleLine');
    for (const { root } of [main, floating]) {
      expect(cell(root, 'creators', 2).textContent).toBe(creators);
      expect(cell(root, 'creators', 2).title).toBe(creators);
    }
    vi.useFakeTimers();
    try {
      const search = get<HTMLInputElement>(main.root, '[role=searchbox]');
      search.focus();
      type(search, 'Mary Jackson');
      await vi.advanceTimersByTimeAsync(300);
      global.set('language', 'zh-CN');
      expect(rowIds(main.root)).toEqual([2]);
      expect(rowIds(floating.root)).toEqual([1, 2]);
      expect(document.activeElement?.getAttribute('aria-label')).toBe('在当前范围内搜索');
      expect(get<HTMLInputElement>(main.root, '[role=searchbox]').value).toBe('Mary Jackson');
      expect(get(floating.root, '[role=searchbox]').getAttribute('aria-label')).toBe(
        '在当前范围内搜索',
      );

      const second = cell(floating.root, 'title', 2);
      second.focus();
      expect(focusedKey('ArrowUp')).toBe(false);
      expect(document.activeElement).toBe(cell(floating.root, 'title'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('adjusts column width without sorting, restores it on remount and resets on double click', async () => {
    const { host } = fixture();
    const { root, teardown } = attach(host);
    await settle();
    changeSelection(root, 'Row density', 'comfortable');
    const gripSelector = '[role=separator][aria-label=\"Resize column · Title\"]';
    const grip = get(root, gripSelector);
    const pointer = (type: string, clientX: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      grip.dispatchEvent(event);
    };
    const width = () => Number(grip.getAttribute('aria-valuenow'));
    const start = width();
    pointer('pointerdown', 200);
    pointer('pointermove', 285);
    expect(width()).toBe(start + 85);
    expect(active(host).columnWidths).toBeUndefined();
    pointer('pointerup', 285);
    expect(active(host).columnWidths?.title).toBe(start + 85);
    expect(active(host).sorts).toEqual(defaultView.sorts);
    teardown();

    const remount = attach(host).root;
    await settle();
    const restored = get(remount, gripSelector);
    expect(restored.getAttribute('aria-valuenow')).toBe(String(start + 85));
    expect(get<HTMLSelectElement>(remount, '[aria-label=\"Row density\"]').value).toBe(
      'comfortable',
    );
    restored.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(restored.getAttribute('aria-valuenow')).toBe(String(start));
    expect(active(host).columnWidths?.title).toBeUndefined();
  });

  it('fits nine starter columns in a 1080p tab at 150% scaling and freezes the title', async () => {
    const { prefs } = preferences();
    const config = createConfig(prefs, () => 'personal', validate, { language: 'zh-CN' });
    const settings = config.settings();
    const view = settings.views[0]!;
    const { host } = fixture([sample], view, settings.properties);
    const { root } = attach(host, { language: 'zh-CN' });
    const viewport = get(root, '.zb-table-wrap');
    Object.defineProperty(viewport, 'clientWidth', { value: 1260 });
    const rect = vi
      .spyOn(HTMLTableCellElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLTableCellElement) {
        return new DOMRect(0, 0, this.cellIndex === 0 ? 36 : 260, 30);
      });
    try {
      await settle();
      expect(root.querySelectorAll('thead [data-header-column]')).toHaveLength(9);
      expect(parseFloat(get(root, 'table').style.width)).toBeLessThan(viewport.clientWidth);
      expect(cell(root, 'title').hasAttribute('data-frozen-end')).toBe(true);
      expect(cell(root, 'creators').hasAttribute('data-frozen')).toBe(false);
    } finally {
      rect.mockRestore();
    }
  });

  it('uses type-specific column widths and restores only the selected override', async () => {
    const { host } = fixture(
      [sample],
      {
        ...defaultView,
        columns: [
          'title',
          'property:Impact',
          'property:Status',
          'property:Repository',
          'property:ReadOn',
          'property:Memo',
        ],
        columnWidths: { title: 275, 'property:Impact': 204 },
      },
      [...properties, ...researchProperties],
    );
    const { root } = attach(host);
    await settle();
    const width = (column: Column) => get(root, `col[data-column="${column}"]`).style.width;

    expect(width('title')).toBe('275px');
    expect(width('property:Impact')).toBe('204px');
    expect(width('property:Status')).toBe('120px');
    expect(width('property:Repository')).toBe('160px');
    expect(width('property:ReadOn')).toBe('112px');
    expect(width('property:Memo')).toBe('140px');
    header(root, 'property:Impact').click();
    click(root, 'Restore default width');
    expect(width('property:Impact')).toBe('120px');
    expect(active(host).columnWidths).toEqual({ title: 275 });
  });

  it('keeps valid results and removes all unavailable conditions with one action', async () => {
    const { host } = fixture([sample, { ...sample, id: 2, title: 'Beta', pdf: false }], {
      ...defaultView,
      filters: [
        { column: 'tags', operator: 'contains', value: 'deleted tag' },
        { column: 'pdf', operator: 'equals', value: 'true' },
        { column: 'property:Status', operator: 'equals', value: 'deleted option' },
      ],
    });
    const { root } = attach(host);
    await settle();
    expect(rowIds(root)).toEqual([1]);
    expect(root.textContent).toContain('Unavailable filters are ignored (2).');
    click(root, 'Remove unavailable filters');
    expect(host.change).toHaveBeenCalledTimes(1);
    expect(active(host).filters).toEqual([{ column: 'pdf', operator: 'equals', value: 'true' }]);
    expect(rowIds(root)).toEqual([1]);
    expect(root.querySelector<HTMLElement>('.zb-warning')?.hidden).toBe(true);
  });

  it('saves typed cells once, immediately toggles labels and tags, and does not open a row while editing', async () => {
    const { host, notify } = fixture([
      sample,
      { ...sample, id: 2, title: 'Read-only', writable: false },
    ]);
    const { root } = attach(host);
    await settle();
    get<HTMLButtonElement>(cell(root, 'property:Memo'), 'button').click();
    const memo = get<HTMLInputElement>(root, 'input[aria-label="Edit · Memo"]');
    type(memo, 'New note');
    notify('data');
    await settle();
    expect(document.activeElement).toBe(memo);
    key(memo, 'Enter');
    expect(host.setProperty).toHaveBeenCalledExactlyOnceWith(1, 'Memo', 'New note');
    await settle();

    get<HTMLButtonElement>(cell(root, 'property:Score'), 'button').click();
    const score = get<HTMLInputElement>(root, 'input[aria-label="Edit · Score"]');
    type(score, '-2.50');
    score.blur();
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Score', '-2.50');
    await settle();
    get<HTMLButtonElement>(cell(root, 'property:Score'), 'button').click();
    const escape = get<HTMLInputElement>(root, 'input[aria-label="Edit · Score"]');
    type(escape, '102');
    key(escape, 'Escape');
    expect(host.setProperty).toHaveBeenCalledTimes(2);
    get<HTMLButtonElement>(cell(root, 'property:Score'), 'button').click();
    get<HTMLButtonElement>(root, 'button[aria-label="Clear · Score"]').click();
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Score', null);
    await settle();

    get<HTMLInputElement>(cell(root, 'property:Reviewed'), 'input').click();
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Reviewed', true);
    await settle();
    get<HTMLButtonElement>(cell(root, 'property:Status'), 'button').click();
    click(cell(root, 'property:Status'), 'Done');
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Status', 'Done');
    await settle();
    get<HTMLButtonElement>(cell(root, 'property:Method'), 'button').click();
    click(cell(root, 'property:Method'), 'Survey');
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Method', ['Retired', 'Survey']);
    await settle();
    click(cell(root, 'property:Method'), 'Simulation');
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Method', [
      'Retired',
      'Survey',
      'Simulation',
    ]);
    await settle();
    click(cell(root, 'property:Method'), 'Done');
    await settle();

    const tags = cell(root, 'tags');
    get<HTMLButtonElement>(tags, 'button').click();
    click(tags, 'existing');
    const tag = get<HTMLInputElement>(tags, 'input[aria-label="New or existing tag"]');
    type(tag, 'new tag');
    click(tags, 'Add tag');
    get<HTMLButtonElement>(tags, 'button[aria-label="Remove tag · reading"]').click();
    expect(host.changeTag.mock.calls).toEqual([
      [1, 'existing', true],
      [1, 'new tag', true],
      [1, 'reading', false],
    ]);
    tag.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    key(tag, 'Enter');
    expect(host.openItem).not.toHaveBeenCalled();
    click(tags, 'Done');
    await settle();
    expect(cell(root, 'property:Reviewed', 2).querySelector('input')).toBeNull();

    click(root, 'Alpha 1');
    expect(host.openItem).toHaveBeenLastCalledWith(1, false);
    cell(root, 'year').focus();
    expect(focusedKey('o')).toBe(true);
    expect(host.openItem).toHaveBeenCalledTimes(1);
    cell(root, 'year').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(host.openItem.mock.calls).toEqual([
      [1, false],
      [1, true],
    ]);
  });

  it('defines properties, renames their labels and offers two inline deletion actions with a partial summary', async () => {
    const { host } = fixture([sample, { ...sample, id: 2, writable: false }]);
    const { root } = attach(host);
    openTool(root, 'Properties');
    type(get(root, 'input[aria-label="Property key"]'), 'Priority');
    changeSelection(root, 'Property type', 'multi-select');
    get<HTMLTextAreaElement>(root, 'textarea[aria-label="Options (one per line)"]').value =
      'High\nLow';
    click(root, 'Add property');
    expect(host.change).toHaveBeenLastCalledWith({
      kind: 'define',
      property: { key: 'Priority', type: 'multi-select', options: ['High', 'Low'] },
    });
    await settle();
    type(get(root, 'input[aria-label="New option · Priority"]'), 'Medium');
    get<HTMLButtonElement>(root, 'button[aria-label="Add option · Priority"]').click();
    expect(host.settings().properties.find(({ key }) => key === 'Priority')?.options).toEqual([
      'High',
      'Low',
      'Medium',
    ]);
    await settle();

    get<HTMLButtonElement>(root, 'button[aria-label="Rename option · Status: Reading"]').click();
    const rename = get<HTMLInputElement>(root, 'input[aria-label="Option name · Status: Reading"]');
    type(rename, 'Reviewing');
    key(rename, 'Enter');
    expect(host.change).toHaveBeenLastCalledWith({
      kind: 'rename-option',
      key: 'Status',
      previous: 'Reading',
      next: 'Reviewing',
    });
    await settle();
    expect(root.textContent).toContain('Updated 1 items; skipped 1.');

    get<HTMLButtonElement>(root, 'button[aria-label="Delete option · Status: Reviewing"]').click();
    expect(root.querySelector('dialog')).toBeNull();
    expect(
      root.querySelector(
        'button[aria-label="Remove definition and clear values · Status: Reviewing"]',
      ),
    ).not.toBeNull();
    get<HTMLButtonElement>(
      root,
      'button[aria-label="Remove definition only · Status: Reviewing"]',
    ).click();
    expect(host.change).toHaveBeenLastCalledWith({
      kind: 'delete-option',
      key: 'Status',
      option: 'Reviewing',
      clean: false,
    });
    await settle();
    get<HTMLButtonElement>(root, 'button[aria-label="Delete property · Memo"]').click();
    get<HTMLButtonElement>(
      root,
      'button[aria-label="Remove definition and clear values · Memo"]',
    ).click();
    expect(host.change).toHaveBeenLastCalledWith({
      kind: 'delete-property',
      key: 'Memo',
      clean: true,
    });
    await settle();
    expect(root.textContent).toContain('Updated 1 items; skipped 1.');
  });

  it('bounds the mounted window, follows arrows at the end, and resets the viewport on sort', async () => {
    const rows = Array.from({ length: 113 }, (_, index) => ({
      ...sample,
      id: index + 1,
      title: `Item ${index + 1}`,
    }));
    const { host } = fixture(rows, { ...defaultView, columns: ['title', 'year'] });
    const { root } = attach(host);
    await settle();
    const viewport = get(root, '.zb-table-wrap');
    expect(rowIds(root)).toContain(1);
    expect(rowIds(root).length).toBeLessThan(40);
    expect(get(root, '.zb-table-status').textContent).toBe('113 items');
    await scrollGrid(viewport, 20_000);
    expect(rowIds(root).at(-1)).toBe(113);
    expect(rowIds(root)).not.toContain(1);
    cell(root, 'title', 112).focus();
    expect(focusedKey('ArrowDown', { repeat: true })).toBe(false);
    expect(document.activeElement).toBe(cell(root, 'title', 113));
    expect(focusedKey('PageDown')).toBe(true);
    header(root, 'title').click();
    click(root, 'Sort descending');
    expect(active(host).sorts).toEqual([{ column: 'title', direction: 'desc' }]);
    expect(rowIds(root)[0]).toBe(113);
  });

  it('keeps the same row in view when the native font grows at a scrolled position', async () => {
    const rows = Array.from({ length: 320 }, (_, index) => ({ ...sample, id: index + 1 }));
    const { host } = fixture(rows, { ...defaultView, columns: ['title'], sorts: [] });
    const refresh = new Map<Element, () => void>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(
          private readonly notify: (changes: Pick<ResizeObserverEntry, 'target'>[]) => void,
        ) {}
        observe(target: Element) {
          refresh.set(target, () => this.notify([{ target }]));
        }
        disconnect() {
          refresh.clear();
        }
      },
    );
    try {
      const { root } = attach(host);
      const probe = get(root, '.zb-row-probe');
      let font = 13;
      let rowHeight = 33.796875;
      vi.spyOn(probe, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, 0, font, rowHeight),
      );
      await settle();
      const viewport = get(root, '.zb-table-wrap');
      const index = 159;
      await scrollGrid(viewport, index * rowHeight + 7);
      expect(rowIds(root)).toContain(index + 1);

      font = 14.04;
      rowHeight = 36.5;
      refresh.get(probe)!();
      await vi.waitFor(() => expect(viewport.scrollTop).toBeCloseTo(index * rowHeight + 7));
      expect(rowIds(root)).toContain(index + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('moves and activates cells with plain keys, and cancels before exiting table focus', async () => {
    const { host } = fixture([sample, { ...sample, id: 2, title: 'Beta' }], {
      ...defaultView,
      columns: ['title', 'property:Score', 'property:Reviewed', 'property:Status'],
    });
    const { root } = attach(host);
    await settle();
    cell(root, 'title').focus();
    expect(focusedKey(' ')).toBe(true);
    expect(rowSelection(root, 1).checked).toBe(false);
    expect(focusedKey('ArrowDown', { shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(cell(root, 'title'));
    expect(focusedKey('ArrowDown')).toBe(false);
    expect(document.activeElement).toBe(cell(root, 'title', 2));
    expect(focusedKey('ArrowUp')).toBe(false);
    expect(focusedKey('ArrowRight')).toBe(false);
    expect(document.activeElement).toBe(cell(root, 'property:Score'));
    focusedKey('Enter');
    const field = document.activeElement as HTMLInputElement;
    type(field, '12.5');
    focusedKey('Escape');
    expect(host.setProperty).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cell(root, 'property:Score'));
    expect(focusedKey('i')).toBe(true);
    expect(focusedKey('Enter')).toBe(false);
    type(document.activeElement as HTMLInputElement, '17.5');
    focusedKey('Enter');
    await settle();
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Score', '17.5');
    expect(document.activeElement).toBe(cell(root, 'property:Score'));
    focusedKey('ArrowRight');
    focusedKey('Enter');
    await settle();
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Reviewed', true);
    focusedKey('ArrowRight');
    focusedKey('Enter');
    expect(document.activeElement?.textContent).toBe('Reading');
    focusedKey('ArrowDown');
    expect(focusedKey('Enter')).toBe(true);
    // jsdom does not generate the button click for native keyboard activation.
    (document.activeElement as HTMLButtonElement).click();
    await settle();
    expect(host.setProperty).toHaveBeenLastCalledWith(1, 'Status', 'Done');
    expect(document.activeElement).toBe(cell(root, 'property:Status'));
    for (let step = 0; step < 3; step++) focusedKey('ArrowLeft');
    focusedKey('Enter');
    expect(host.openItem).toHaveBeenLastCalledWith(1, false);
    const title = cell(root, 'title');
    const table = get(root, '.zb-table-wrap');
    rowSelection(root, 1).click();
    title.focus();
    expect(focusedKey('Escape', { repeat: true })).toBe(true);
    expect(focusedKey('Escape', { shiftKey: true })).toBe(true);
    expect(rowSelection(root, 1).checked).toBe(true);
    expect(focusedKey('Escape')).toBe(false);
    expect(rowSelection(root, 1).checked).toBe(false);
    expect(document.activeElement).toBe(title);
    expect(focusedKey('Escape')).toBe(false);
    expect(table.contains(document.activeElement)).toBe(false);
  });

  it('saves a draft exactly once on eviction and restores the active cell and selection on return', async () => {
    const rows = Array.from({ length: 320 }, (_, index) => ({
      ...sample,
      id: index + 1,
      title: `Item ${index + 1}`,
    }));
    const { host } = fixture(rows, { ...defaultView, columns: ['property:Memo'] });
    const { root } = attach(host);
    await settle();
    const viewport = get(root, '.zb-table-wrap');
    const original = cell(root, 'property:Memo');
    original.focus();
    rowSelection(root, 1).click();
    focusedKey('Enter');
    type(document.activeElement as HTMLInputElement, 'Save before recycling');
    await scrollGrid(viewport, 7200);
    expect(original.isConnected).toBe(false);
    expect(root.querySelector('.zb-editor')).toBeNull();
    expect(host.setProperty).toHaveBeenCalledExactlyOnceWith(1, 'Memo', 'Save before recycling');
    expect(document.activeElement).toBe(viewport);
    await scrollGrid(viewport, 0);
    const remounted = cell(root, 'property:Memo');
    expect(remounted).not.toBe(original);
    expect(document.activeElement).toBe(remounted);
    expect(remounted.hasAttribute('data-active-cell')).toBe(true);
    expect(remounted.textContent).toBe('Save before recycling');
    expect(rowSelection(root, 1).checked).toBe(true);
    rowSelection(root, 1).click();
    expect(rowSelection(root, 1).checked).toBe(false);
  });

  it('accepts the reserved key hint without submitting or discarding property options', async () => {
    const { host } = fixture();
    const { root } = attach(host);
    openTool(root, 'Properties');
    const field = get<HTMLInputElement>(root, 'input[aria-label="Property key"]');
    const values = get<HTMLTextAreaElement>(root, 'textarea[aria-label="Options (one per line)"]');
    type(field, 'Ordinary custom key');
    expect(root.textContent).not.toContain('Use “');
    expect(root.textContent).not.toContain('This key is reserved by Zotero.');
    changeSelection(root, 'Property type', 'multi-select');
    values.value = 'First\nSecond';

    type(field, 'DOI');
    expect(root.textContent).toContain('This key is reserved by Zotero.');
    click(root, 'Add property');
    await settle();
    expect(host.settings().properties.some(({ key }) => key === 'DOI')).toBe(false);
    expect(root.textContent).toContain('Could not save. Check that the key or option name');
    host.change.mockClear();

    click(root, 'Use “Reference DOI”');
    expect(field.value).toBe('Reference DOI');
    expect(document.activeElement).toBe(field);
    expect(values.value).toBe('First\nSecond');
    expect(root.textContent).not.toContain('This key is reserved by Zotero.');
    expect(host.change).not.toHaveBeenCalled();
    click(root, 'Add property');
    expect(host.change).toHaveBeenCalledExactlyOnceWith({
      kind: 'define',
      property: { key: 'Reference DOI', type: 'multi-select', options: ['First', 'Second'] },
    });
  });

  it('persists grouping independently of columns and suggests tags outside the filtered rows', async () => {
    const { host } = fixture(
      [
        { ...sample, title: 'Zulu', pdf: false },
        { ...sample, id: 2, title: 'Beta', year: '2025' },
        { ...sample, id: 3, title: 'Alpha', year: '2025' },
        { ...sample, id: 4, title: 'Gamma', year: '' },
      ],
      {
        ...defaultView,
        columns: ['title'],
        filters: [{ column: 'pdf', operator: 'equals', value: 'true' }],
      },
    );
    const { root } = attach(host);
    await settle();
    openTool(root, 'Grouping');
    const grouping = get<HTMLSelectElement>(root, 'select[aria-label="Group by"]');
    const candidates = Array.from(grouping.options, ({ value }) => value);
    expect(candidates).toEqual(
      expect.arrayContaining([
        '',
        'year',
        'type',
        'tags',
        'lastRead',
        'dateModified',
        'collections',
        'property:Reviewed',
        'property:Status',
      ]),
    );
    expect(candidates).not.toContain('property:Method');
    changeSelection(root, 'Group by', 'year');
    expect(active(host).group).toEqual({ column: 'year', direction: 'asc' });
    expect(rowIds(root)).toEqual([3, 2, 4]);
    expect(groupTitles(root)).toEqual(['2025 (2)', 'No value (1)']);
    changeSelection(root, 'Group direction', 'desc');
    expect(groupTitles(root)).toEqual(['2025 (2)', 'No value (1)']);

    changeSelection(root, 'Group by', 'tags');
    expect(active(host).group).toEqual({ column: 'year', direction: 'desc' });
    const tag = get<HTMLInputElement>(root, 'input[aria-label="Tag to group by"]');
    type(tag, 'exis');
    expect(tag.list?.querySelector('option')?.value).toBe('existing');
    type(tag, 'existing');
    key(tag, 'Enter');
    expect(active(host).group).toEqual({ column: 'tags', tag: 'existing', direction: 'desc' });
    expect(groupTitles(root)).toEqual(['Without tag: existing (3)']);
    expect(active(host).columns).toEqual(['title']);
    expect(rowIds(root)).toEqual([3, 2, 4]);
  });

  it('keeps one warning region for invalid filters and grouping and clears only the chosen setting', async () => {
    const { host } = fixture([sample], {
      ...defaultView,
      group: { column: 'property:Status', direction: 'asc' },
      filters: [{ column: 'tags', operator: 'contains', value: 'deleted tag' }],
    });
    const { root } = attach(host);
    await settle();
    expect(groupTitles(root)).toEqual(['Reading (1)']);
    await host.change({ kind: 'delete-property', key: 'Status', clean: false });
    const warning = get(root, '.zb-warning');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain('Unavailable filters are ignored (1).');
    expect(warning.textContent).toContain('Unavailable grouping is ignored.');
    expect(groupTitles(root)).toEqual([]);
    expect(rowIds(root)).toEqual([1]);
    expect(active(host).group).toEqual({ column: 'property:Status', direction: 'asc' });

    click(warning, 'Clear grouping');
    expect(active(host).group).toBeUndefined();
    expect(active(host).filters).toHaveLength(1);
    expect(warning.hidden).toBe(false);
    click(warning, 'Remove unavailable filters');
    expect(warning.hidden).toBe(true);
  });

  it('folds and expands a group with the keyboard while retaining the group cursor', async () => {
    const rows = Array.from({ length: 115 }, (_, index) => ({
      ...sample,
      id: index + 1,
      title: `Item ${index + 1}`,
      year: index < 62 ? '2023' : index < 113 ? '2024' : '',
    }));
    const { host } = fixture(rows, {
      ...defaultView,
      columns: ['title'],
      group: { column: 'year', direction: 'asc' },
    });
    const { root } = attach(host);
    await settle();
    expect(groupTitles(root)).toEqual(['2023 (62)']);
    cell(root, 'title').focus();
    expect(focusedKey('ArrowUp')).toBe(false);
    const firstGroup = '[aria-label="2023 (62)"]';
    get(root, firstGroup).focus();
    expect(focusedKey('Enter')).toBe(true);
    expect(focusedKey('ArrowLeft')).toBe(false);
    expect(get(root, firstGroup).getAttribute('aria-expanded')).toBe('false');
    expect(rowIds(root)[0]).toBe(63);
    expect(root.textContent).toContain('115 items');
    expect(focusedKey('ArrowRight')).toBe(false);
    expect(get(root, firstGroup).getAttribute('aria-expanded')).toBe('true');
    expect(rowIds(root)[0]).toBe(1);
    expect(focusedKey('Enter')).toBe(false);
    expect(get(root, firstGroup).getAttribute('aria-expanded')).toBe('false');
    expect(focusedKey('ArrowDown')).toBe(false);
    expect(document.activeElement).toBe(get(root, '[aria-label="2024 (51)"]').closest('td'));
    expect(focusedKey('ArrowDown')).toBe(false);
    expect(document.activeElement).toBe(cell(root, 'title', 63));
    await scrollGrid(get(root, '.zb-table-wrap'), 20_000);
    expect(rowIds(root).at(-1)).toBe(115);
    expect(groupTitles(root)).toContain('No value (2)');
  });

  it('selects Shift-click ranges across unmounted grouped rows and only counts selections in the bulk bar', async () => {
    const rows = Array.from({ length: 320 }, (_, index) => ({
      ...sample,
      id: index + 1,
      title: `Item ${index + 1}`,
      year: index < 150 ? '2023' : '2024',
    }));
    const { host } = fixture(rows, {
      ...defaultView,
      columns: ['title'],
      group: { column: 'year', direction: 'asc' },
    });
    const { root } = attach(host);
    await settle();
    rowSelection(root, 5).click();
    const viewport = get(root, '.zb-table-wrap');
    const bulk = get(root, '[aria-label="Bulk edit"]');
    const footer = get(root, '.zb-table-status');
    await scrollGrid(viewport, 7800);
    expect(rowIds(root)).not.toContain(5);
    const title = get<HTMLButtonElement>(cell(root, 'title', 235), 'button');
    title.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }),
    );
    expect(host.openItem).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cell(root, 'title', 235));
    expect(bulk.textContent).toContain('231 selected');
    expect(footer.textContent).toBe('320 items');
    await scrollGrid(viewport, 20_000);
    rowSelection(root, 320).dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true }),
    );
    expect(bulk.textContent).toContain('316 selected');
    expect(footer.textContent).toBe('320 items');
    expect(selectAllInput(root).indeterminate).toBe(true);

    selectAllInput(root).click();
    expect(root.textContent).toContain('320 selected');
    expect(selectAllInput(root).checked).toBe(true);
    expect(selectAllInput(root).indeterminate).toBe(false);
    type(get(bulk, '[aria-label="Bulk tag"]'), 'existing');
    click(bulk, 'Add tag');
    const [ids, change] = host.bulk.mock.calls[0]!;
    expect([...ids].sort((a, b) => a - b)).toEqual(rows.map(({ id }) => id));
    expect(change).toEqual({ kind: 'tag', tag: 'existing', add: true });
    expect(host.bulk).toHaveBeenCalledTimes(1);
    await settle();
    expect(root.textContent).toContain('320 selected');
    click(bulk, 'Clear selection');
    expect(selectAllInput(root).checked).toBe(false);
    expect(bulk.hidden).toBe(true);
  });

  it('retains matching selected IDs on data refresh and clears selection on context changes', async () => {
    const second = { ...sample, id: 2, title: 'Beta' };
    const { host, setRows } = fixture([sample, second]);
    const { root } = attach(host);
    const bulk = get(root, '[aria-label="Bulk edit"]');
    await settle();
    selectAllInput(root).click();
    setRows([second, { ...sample, id: 3, title: 'New item' }]);
    await settle();
    expect(rowSelection(root, 2).checked).toBe(true);
    expect(rowSelection(root, 3).checked).toBe(false);
    expect(selectAllInput(root).indeterminate).toBe(true);
    header(root, 'title').click();
    click(root, 'Sort descending');
    expect(rowSelection(root, 2).checked).toBe(true);

    openTool(root, 'View actions');
    click(root, 'Copy view');
    expect(bulk.hidden).toBe(true);
    rowSelection(root, 2).click();
    changeSelection(root, 'Scope', 'group');
    await settle();
    expect(bulk.hidden).toBe(true);
    rowSelection(root, 2).click();
    openTool(root, 'Filters');
    click(root, 'Add condition');
    expect(bulk.hidden).toBe(true);
    changeSelection(root, 'Filter condition · 1', 'contains');
    type(get(root, '[aria-label="Filter value · 1"]'), 'No match');
    expect(selectAllInput(root).disabled).toBe(true);
    expect(root.textContent).toContain('No matching items');
  });

  it('commits each bulk value or tag action once, preserving selection and a focused draft', async () => {
    const { host, notify } = fixture([sample, { ...sample, id: 2, writable: false }]);
    const { root } = attach(host);
    await settle();
    selectAllInput(root).click();
    const bulk = get(root, '[aria-label="Bulk edit"]');
    changeSelection(bulk, 'Bulk property', 'Memo');
    const memo = get<HTMLInputElement>(bulk, 'input[aria-label="Bulk value"]');
    memo.focus();
    type(memo, 'Shared note');
    notify('data');
    await settle();
    expect(document.activeElement).toBe(memo);
    click(bulk, 'Set value');
    await settle();
    expect(root.textContent).toContain('Updated 1 items; skipped 1 (1 read-only).');
    expect(cell(root, 'property:Memo', 1).textContent).toContain('Shared note');
    expect(cell(root, 'property:Memo', 2).textContent).toContain('Old note');

    changeSelection(bulk, 'Bulk property', 'Score');
    type(get(bulk, 'input[aria-label="Bulk value"]'), '-2.50');
    click(bulk, 'Set value');
    await settle();
    changeSelection(bulk, 'Bulk property', 'Reviewed');
    changeSelection(bulk, 'Bulk value', 'true');
    await settle();
    changeSelection(bulk, 'Bulk property', 'Status');
    changeSelection(bulk, 'Bulk value', 'Done');
    await settle();
    changeSelection(bulk, 'Bulk property', 'Method');
    const multi = get<HTMLSelectElement>(bulk, 'select[aria-label="Bulk value"][multiple]');
    for (const option of multi.options) option.selected = true;
    click(bulk, 'Set value');
    await settle();
    click(bulk, 'Clear property values');
    await settle();

    const tag = get<HTMLInputElement>(bulk, 'input[aria-label="Bulk tag"]');
    type(tag, 'exis');
    expect(tag.list?.querySelector('option')?.value).toBe('existing');
    type(tag, 'existing');
    click(bulk, 'Add tag');
    await settle();
    click(bulk, 'Remove tag');
    await settle();
    expect(host.bulk.mock.calls).toEqual([
      [[1, 2], { kind: 'property', key: 'Memo', value: 'Shared note' }],
      [[1, 2], { kind: 'property', key: 'Score', value: '-2.50' }],
      [[1, 2], { kind: 'property', key: 'Reviewed', value: true }],
      [[1, 2], { kind: 'property', key: 'Status', value: 'Done' }],
      [[1, 2], { kind: 'property', key: 'Method', value: ['Survey', 'Simulation'] }],
      [[1, 2], { kind: 'property', key: 'Method', value: null }],
      [[1, 2], { kind: 'tag', tag: 'existing', add: true }],
      [[1, 2], { kind: 'tag', tag: 'existing', add: false }],
    ]);
    expect(selectAllInput(root).checked).toBe(true);
    expect(bulk.textContent).toContain('2 selected');
  });

  it('keeps a localized bulk action targeted at the initial IDs even if selection changes', async () => {
    const { host } = fixture(
      [
        { ...sample, year: '' },
        { ...sample, id: 2, year: '' },
      ],
      { ...defaultView, group: { column: 'year', direction: 'asc' } },
    );
    let finish!: (value: BulkResult) => void;
    host.bulk.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { root } = attach(host, { language: 'zh-CN' });
    await settle();
    expect(groupTitles(root)).toEqual(['未设置 (2)']);
    get<HTMLInputElement>(root, 'thead input[aria-label="选择所有匹配条目"]').click();
    const bulk = get(root, '[aria-label="批量编辑"]');
    type(get(bulk, '[aria-label="批量编辑的标签"]'), 'reading');
    click(bulk, '移除标签');
    rowSelection(root, 1).click();
    expect(bulk.textContent).toContain('已选择 1 条');
    expect(host.bulk).toHaveBeenCalledExactlyOnceWith([1, 2], {
      kind: 'tag',
      tag: 'reading',
      add: false,
    });
    finish({ changed: 1, skipped: 1, readOnly: 1 });
    await settle();
    expect(root.textContent).toContain('已更新 1 条，跳过 1 条（其中 1 条只读）。');
    expect(rowSelection(root, 2).checked).toBe(true);
  });

  it('ignores stale scope loads and unsubscribes on unmount', async () => {
    const { host, handlers, notify } = fixture();
    let resolvePersonal!: (value: Catalog) => void;
    let resolveGroup!: (value: Catalog) => void;
    host.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePersonal = resolve;
        }),
    );
    host.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGroup = resolve;
        }),
    );
    const { root, teardown } = attach(host);
    changeSelection(root, 'Scope', 'group');
    resolveGroup({ rows: [{ ...sample, title: 'Group study' }], tags: new Set() });
    await settle();
    resolvePersonal({ rows: [sample], tags: new Set() });
    await settle();
    expect(root.textContent).toContain('Group study');
    expect(root.textContent).not.toContain('Alpha 1');
    teardown();
    expect(handlers.size).toBe(0);
    expect(root.children).toHaveLength(0);
    notify('data');
    expect(host.load).toHaveBeenCalledTimes(2);
  });

  it('creates interactive XHTML elements inside the owning XUL document', async () => {
    const html = 'http://www.w3.org/1999/xhtml';
    const xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
    const frame = document.body.appendChild(document.createElement('iframe'));
    const xml = frame.contentDocument!;
    xml.replaceChild(xml.createElementNS(xul, 'window'), xml.documentElement);
    const root = xml.createElementNS(html, 'main') as HTMLElement;
    xml.documentElement.append(root);
    const { host } = fixture();
    cleanups.push(mountWorkspace(root, host, { language: 'zh-CN' }));
    await settle();
    const tab = get(root, 'button[role="tab"]');
    expect(tab.ownerDocument).toBe(xml);
    expect(tab.namespaceURI).toBe(html);
    click(root, '新建视图');
    click(root, '新建看板视图');
    expect(active(host)).toMatchObject({ name: '新建视图', layout: 'board' });
    expect(get(root, '.zb-board-card').ownerDocument).toBe(xml);
    expect(get(root, '.zb-board-card').namespaceURI).toBe(html);
  });
});
