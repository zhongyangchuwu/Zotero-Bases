// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeSchema } from '../src/config';
import type {
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
import { validateProperty, writeProperty } from '../src/extra';
import { mountWorkspace } from '../src/workspace';

const properties: readonly Property[] = [
  { key: 'Memo', type: 'text' },
  { key: 'Score', type: 'number' },
  { key: 'Reviewed', type: 'checkbox' },
  { key: 'Status', type: 'single-select', options: ['Reading', 'Done'] },
  { key: 'Method', type: 'multi-select', options: ['Survey', 'Simulation'] },
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
  sort: { column: 'title', direction: 'asc' },
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

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

function fixture(rows: readonly Row[] = [sample], view: View = defaultView) {
  let entries = rows;
  let settings: Preferences = { properties, views: [view], active: view.id };
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
      }),
    ),
    change: vi.fn(async (change: ConfigChange): Promise<MutationResult> => {
      if (change.kind === 'views') {
        settings = { ...settings, views: change.views, active: change.active };
        notify('settings');
        return { changed: 0, skipped: 0 };
      }
      const update = changeSchema(settings.properties, change, validateProperty);
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
    openItem: vi.fn(async (_id: number, _pdf: boolean): Promise<void> => {}),
    subscribe: vi.fn((listener: Parameters<WorkspaceHost['subscribe']>[0]) => {
      handlers.add(listener);
      return () => handlers.delete(listener);
    }),
  } satisfies WorkspaceHost;
  return { host, notify, handlers };
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
    (element) => element.textContent === caption,
  );
  if (!found) throw new Error(`Missing button: ${caption}`);
  found.click();
}

function changeSelection(root: ParentNode, label: string, value: string): void {
  const field = get<HTMLSelectElement>(root, `select[aria-label="${label}"]`);
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function type(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(element: HTMLElement, name: string): void {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
}

function openDetails(root: ParentNode, title: string): void {
  const summary = [...root.querySelectorAll<HTMLElement>('summary')].find(
    (node) => node.textContent === title,
  );
  if (!summary) throw new Error(`Missing section ${title}`);
  summary.click();
}

function active(host: WorkspaceHost): View {
  const settings = host.settings();
  return settings.views.find((view) => view.id === settings.active)!;
}

function cell(root: ParentNode, column: Column, id = 1): HTMLTableCellElement {
  return get(root, `tr[data-item-id="${id}"] td[data-column="${column}"]`);
}

async function settle(): Promise<void> {
  // Let host results, data reloads and the deferred focus render resolve.
  for (let index = 0; index < 4; index++) await Promise.resolve();
}

describe('Zotero Bases workspace', () => {
  it('writes view controls immediately and keeps a focused filter input through settings notifications', async () => {
    const { host } = fixture([sample, { ...sample, id: 2, title: 'Beta' }]);
    const popOut = vi.fn();
    const { root } = attach(host, { language: 'en', popOut });
    await settle();
    click(root, 'Open in new window');
    expect(popOut).toHaveBeenCalledTimes(1);
    click(root, 'New view');
    const created = active(host);
    expect(created).toMatchObject({ name: 'New view', scope: 'personal' });
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('New view');
    changeSelection(root, 'Scope', 'group');
    expect(active(host).scope).toBe('group');
    expect(host.load).toHaveBeenLastCalledWith('group');

    openDetails(root, 'Columns');
    get<HTMLInputElement>(root, 'input[data-focus="year"]').click();
    expect(active(host).columns).not.toContain('year');
    changeSelection(root, 'Sort direction', 'desc');
    expect(active(host).sort).toEqual({ column: 'title', direction: 'desc' });
    openDetails(root, 'Filters');
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
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    field.blur();
    await settle();

    click(root, 'Copy view');
    expect(active(host)).toMatchObject({ name: 'New view (copy)', scope: 'group' });
    expect(active(host).id).not.toBe(created.id);
    expect(active(host).filters[0]?.value).toBe('Alpha 1');
    click(root, 'Rename view');
    const name = get<HTMLInputElement>(root, 'input[aria-label="View name"]');
    name.value = 'Reading list';
    key(name, 'Enter');
    expect(active(host).name).toBe('Reading list');
    click(root, 'Delete view');
    expect(active(host).id).toBe(created.id);
    click(root, 'Library');
    expect(active(host).id).toBe('default');
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
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.textContent).toContain('Unavailable filters are ignored (2).');
    click(root, 'Remove unavailable filters');
    expect(host.change).toHaveBeenCalledTimes(1);
    expect(active(host).filters).toEqual([{ column: 'pdf', operator: 'equals', value: 'true' }]);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
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
    const row = get<HTMLTableRowElement>(root, 'tr[data-item-id="1"]');
    key(row, 'Enter');
    expect(host.openItem).toHaveBeenLastCalledWith(1, true);
    cell(root, 'year').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(host.openItem.mock.calls).toEqual([
      [1, false],
      [1, true],
      [1, true],
    ]);
  });

  it('defines properties, renames their labels and offers two inline deletion actions with a partial summary', async () => {
    const { host } = fixture([sample, { ...sample, id: 2, writable: false }]);
    const { root } = attach(host);
    openDetails(root, 'Properties');
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

  it('bounds the table DOM, pages through all results and saves a header sort', async () => {
    const rows = Array.from({ length: 113 }, (_, index) => ({
      ...sample,
      id: index + 1,
      title: `Item ${index + 1}`,
    }));
    const { host } = fixture(rows, { ...defaultView, columns: ['title', 'year'] });
    const { root } = attach(host);
    await settle();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(root.textContent).toContain('1–50 of 113 items');
    click(root, 'Next page');
    click(root, 'Next page');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(13);
    expect(root.textContent).toContain('101–113 of 113 items');
    get<HTMLButtonElement>(root, 'button[aria-label="Sort by · Title"]').click();
    expect(active(host).sort).toEqual({ column: 'title', direction: 'desc' });
    expect(root.querySelector('tbody tr')?.textContent).toContain('Item 113');
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
    const xml = document.implementation.createDocument(xul, 'window');
    const root = xml.createElementNS(html, 'main') as HTMLElement;
    xml.documentElement.append(root);
    const { host } = fixture();
    cleanups.push(mountWorkspace(root, host, { language: 'zh-CN' }));
    await settle();
    const tab = get(root, 'button[role="tab"]');
    expect(tab.ownerDocument).toBe(xml);
    expect(tab.namespaceURI).toBe(html);
    click(root, '新建视图');
    expect(active(host).name).toBe('新建视图');
  });
});
