// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeSchema } from '../src/config';
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
    openItem: vi.fn(async (_id: number, _pdf: boolean): Promise<void> => {}),
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

  it('accepts the reserved key hint without submitting or discarding property options', async () => {
    const { host } = fixture();
    const { root } = attach(host);
    openDetails(root, 'Properties');
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
    openDetails(root, 'Grouping');
    const grouping = get<HTMLSelectElement>(root, 'select[aria-label="Group by"]');
    expect(Array.from(grouping.options, ({ value }) => value)).toEqual([
      '',
      'year',
      'type',
      'tags',
      'property:Reviewed',
      'property:Status',
    ]);
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

  it('paginates groups without duplicate items and lets a folded group expand from its header', async () => {
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
    expect(rowIds(root)).toHaveLength(50);
    expect(root.textContent).toContain('1–50 of 115 items');
    click(root, 'Next page');
    expect(groupTitles(root)).toEqual(['2023 (62)', '2024 (51)']);
    const firstGroup = '[aria-label="2023 (62)"]';
    get<HTMLButtonElement>(root, firstGroup).click();
    expect(get(root, firstGroup).getAttribute('aria-expanded')).toBe('false');
    expect(rowIds(root)).toEqual(rows.slice(62, 111).map(({ id }) => id));
    expect(root.textContent).toContain('1–50 of 54 visible rows or groups · 115 items');
    click(root, 'Next page');
    expect(rowIds(root)).toEqual([112, 113, 114, 115]);
    expect(root.textContent).toContain('51–54 of 54 visible rows or groups');
    click(root, 'Previous page');
    get<HTMLButtonElement>(root, firstGroup).click();
    const visited = rowIds(root);
    click(root, 'Next page');
    visited.push(...rowIds(root));
    click(root, 'Next page');
    visited.push(...rowIds(root));
    expect(visited).toEqual(rows.map(({ id }) => id));
    expect(groupTitles(root)).toEqual(['2024 (51)', 'No value (2)']);
  });

  it('extends a checkbox range across pages in group order and selects all through folds', async () => {
    const rows = Array.from({ length: 63 }, (_, index) => ({
      ...sample,
      id: index + 1,
      title: `Item ${63 - index}`,
      year: index < 56 ? '2023' : index < 59 ? '2024' : '2025',
    }));
    const { host } = fixture(rows, {
      ...defaultView,
      columns: ['title'],
      group: { column: 'year', direction: 'asc' },
    });
    const { root } = attach(host);
    await settle();
    rowSelection(root, 8).click();
    expect(selectAllInput(root).indeterminate).toBe(true);
    click(root, 'Next page');
    get<HTMLButtonElement>(root, '[aria-label="2024 (3)"]').click();
    const endpoint = rowSelection(root, 63);
    endpoint.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    endpoint.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    key(endpoint, 'Enter');
    expect(host.openItem).not.toHaveBeenCalled();
    expect(root.textContent).toContain('9 selected');
    expect(rowIds(root).filter((id) => rowSelection(root, id).checked)).toEqual([
      6, 5, 4, 3, 2, 1, 63,
    ]);
    expect(selectAllInput(root).indeterminate).toBe(true);

    selectAllInput(root).click();
    expect(root.textContent).toContain('63 selected');
    expect(selectAllInput(root).checked).toBe(true);
    expect(selectAllInput(root).indeterminate).toBe(false);
    const bulk = get(root, '[aria-label="Bulk edit"]');
    type(get(bulk, '[aria-label="Bulk tag"]'), 'existing');
    click(bulk, 'Add tag');
    const [ids, change] = host.bulk.mock.calls[0]!;
    expect([...ids].sort((a, b) => a - b)).toEqual(rows.map(({ id }) => id));
    expect(change).toEqual({ kind: 'tag', tag: 'existing', add: true });
    expect(host.bulk).toHaveBeenCalledTimes(1);
    await settle();
    expect(root.textContent).toContain('63 selected');
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
    get<HTMLButtonElement>(root, 'button[aria-label="Sort by · Title"]').click();
    expect(rowSelection(root, 2).checked).toBe(true);

    click(root, 'Copy view');
    expect(bulk.hidden).toBe(true);
    rowSelection(root, 2).click();
    changeSelection(root, 'Scope', 'group');
    await settle();
    expect(bulk.hidden).toBe(true);
    rowSelection(root, 2).click();
    openDetails(root, 'Filters');
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
