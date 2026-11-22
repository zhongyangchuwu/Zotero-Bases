import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_PREF, VIEWS_PREF } from '../src/config';
import { createWorkspaceHost } from '../src/data';
import type { LibraryOwner, Prefs, ZoteroData } from '../src/data';
import type { Property } from '../src/contracts';

type Item = Awaited<ReturnType<ZoteroData['Items']['getAll']>>[number];
type Collection = ReturnType<ZoteroData['Collections']['getByLibrary']>[number];

function nativeItem(
  id: number,
  libraryID: number,
  initialExtra = '',
  flags: {
    deleted?: boolean;
    feed?: boolean;
    readOnly?: boolean;
    fail?: boolean;
    parentID?: number;
    pdf?: boolean;
    regular?: boolean;
    attachments?: readonly number[];
    best?: Item;
  } = {},
) {
  let extra = initialExtra;
  let onDisk = initialExtra;
  let tags = [{ tag: 'automatic', type: 1 }];
  const item = {
    id,
    libraryID,
    parentID: flags.parentID ?? false,
    deleted: flags.deleted ?? false,
    isFeedItem: flags.feed ?? false,
    dateAdded: '2026-05-24 20:52:26',
    itemTypeID: 11,
    isRegularItem: () => flags.regular ?? true,
    isEditable: () => !flags.readOnly,
    isPDFAttachment: () => flags.pdf ?? false,
    getField: (field: string) => {
      if (field === 'extra') return extra;
      if (field === 'title') return `Item ${id}`;
      if (field === 'year') return '2025';
      if (field === 'publicationTitle') return 'Science';
      return '';
    },
    setField(_field: 'extra', value: string) {
      extra = value;
    },
    getCreators: () => [{ firstName: 'Ada', lastName: 'Lovelace', fieldMode: 0 }],
    getTags: () => tags.slice(),
    addTag(tag: string) {
      tags = [...tags.filter((entry) => entry.tag !== tag), { tag, type: 0 }];
    },
    removeTag(tag: string) {
      tags = tags.filter((entry) => entry.tag !== tag);
    },
    getAttachments: () => flags.attachments ?? [],
    async getBestAttachment(): Promise<Item | false> {
      return flags.best ?? false;
    },
    saveTx: vi.fn(async () => {
      if (flags.fail) {
        extra = onDisk;
        throw new Error('Native save failed');
      }
      onDisk = extra;
    }),
    savedExtra: () => onDisk,
  } satisfies Item & { savedExtra: () => string };
  return item;
}

function harness(items: readonly Item[] = [], collectionItems: readonly Item[] = []) {
  const libraries = [
    {
      libraryID: 1,
      libraryType: 'user',
      libraryTypeID: 0,
      name: 'My Library',
      editable: true,
      archived: false,
    },
    {
      libraryID: 8,
      libraryType: 'group',
      libraryTypeID: 73,
      name: 'Shared',
      editable: true,
      archived: false,
    },
    {
      libraryID: 9,
      libraryType: 'group',
      libraryTypeID: 74,
      name: 'Read only',
      editable: false,
      archived: false,
    },
    {
      libraryID: 10,
      libraryType: 'group',
      libraryTypeID: 75,
      name: 'Archived',
      editable: true,
      archived: true,
    },
    {
      libraryID: 11,
      libraryType: 'feed',
      libraryTypeID: 76,
      name: 'Feed',
      editable: true,
      archived: false,
    },
  ];
  const child: Collection = {
    id: 15,
    libraryID: 8,
    key: 'CHILD007',
    parentID: 14,
    deleted: false,
    name: 'Child',
    loadDataType: async () => {},
    getChildItems: () => collectionItems,
  };
  const root: Collection = { ...child, id: 14, key: 'ROOT0007', parentID: false, name: 'Root' };
  const raw = new Map<string, string>();
  const prefObservers = new Map<symbol, { key: string; listener: () => void }>();
  const nativeObservers = new Map<string, { observer: { notify(): void }; types: string[] }>();
  const prefs: Prefs = {
    get: (key) => raw.get(key),
    set(key, value) {
      raw.set(key, value);
      for (const observer of prefObservers.values()) if (observer.key === key) observer.listener();
    },
    registerObserver(key, listener) {
      const id = Symbol();
      prefObservers.set(id, { key, listener });
      return id;
    },
    unregisterObserver(id) {
      prefObservers.delete(id);
    },
  };
  const byID = new Map(items.map((item) => [item.id, item]));
  async function getAsync(id: number): Promise<Item | undefined>;
  async function getAsync(ids: readonly number[]): Promise<Item[]>;
  async function getAsync(id: number | readonly number[]) {
    return typeof id === 'number' ? byID.get(id) : id.flatMap((id) => byID.get(id) ?? []);
  }
  const loadDataTypes = vi.fn(async (_items: readonly Item[]) => {});
  const zotero: ZoteroData = {
    Libraries: {
      getAll: () => libraries,
      get: (id) => libraries.find(({ libraryID }) => libraryID === id) ?? false,
    },
    Items: {
      getAll: async (id) => items.filter((item) => item.libraryID === id && !item.parentID),
      getAsync,
      loadDataTypes,
    },
    Collections: {
      getByLibrary: (id) => (id === 8 ? [root, child] : []),
      getByLibraryAndKeyAsync: async (id, key) =>
        [root, child].find((collection) => collection.libraryID === id && collection.key === key) ??
        false,
    },
    Tags: {
      getAll: (id) => {
        if (id === 1) return [{ tag: 'Elsewhere' }];
        if (id === 8) return Promise.resolve([{ tag: 'automatic' }, { tag: 'elsewhere' }]);
        return [{ tag: id === 11 ? 'Feed only' : 'Other group' }];
      },
    },
    ItemFields: { getAll: () => [{ name: 'newZoteroField' }] },
    ItemTypes: { getLocalizedString: () => 'Journal Article' },
    Utilities: {
      Internal: {
        extractExtraFields(extra) {
          return {
            itemType: null,
            fields: new Map(
              /^(?:Special CSL Field|Status):/u.test(extra) ? [['mapped', 'book']] : [],
            ),
            creators: [],
          };
        },
      },
    },
    Notifier: {
      registerObserver(observer, types) {
        const id = String(nativeObservers.size);
        nativeObservers.set(id, { observer, types });
        return id;
      },
      unregisterObserver(id) {
        nativeObservers.delete(id);
      },
    },
  };
  const owner = {
    ZoteroPane: {
      getSelectedLibraryIDs: () => [8],
      getSelectedCollections: () => [child],
      selectItem: vi.fn(async (_id: number) => {}),
      viewAttachment: vi.fn(async (_id: number) => {}),
    },
  } satisfies LibraryOwner;
  return {
    zotero,
    owner,
    prefs,
    libraries,
    loadDataTypes,
    prefObservers,
    nativeObservers,
    host: createWorkspaceHost(zotero, prefs, owner),
  };
}

const stage = {
  key: 'Reading Stage',
  type: 'multi-select',
  options: ['To Read', 'Done'],
} satisfies Property;

describe('Zotero Bases host', () => {
  it('uses native scope identifiers and loads a global native tag catalog independent of rows', async () => {
    const pdf = nativeItem(3, 8, '', { parentID: 1, pdf: true, regular: false });
    const paper = nativeItem(1, 8, 'Reading Stage: To Read', { attachments: [3], best: pdf });
    const trashed = nativeItem(2, 8, '', { deleted: true });
    const feed = nativeItem(5, 8, '', { feed: true });
    const note = nativeItem(6, 8, '', { regular: false });
    const archived = nativeItem(4, 10);
    const { host } = harness(
      [paper, trashed, pdf, feed, note, archived],
      [paper, trashed, feed, note],
    );
    expect(host.initialScope()).toBe('group:73/CHILD007');
    expect(host.settings().views[0]?.scope).toBe('group:73/CHILD007');
    expect(host.scopes()).toContainEqual({
      id: 'group:73/CHILD007',
      label: 'Shared / Root / Child',
    });
    expect(host.scopes().some(({ label }) => label === 'Feed')).toBe(false);
    const catalog = await host.load('group:73/CHILD007');
    expect(catalog).toEqual({
      rows: [
        {
          id: 1,
          title: 'Item 1',
          creators: 'Ada Lovelace',
          year: '2025',
          source: 'Science',
          type: 'Journal Article',
          added: '2026-05-24 20:52:26',
          pdf: true,
          tags: ['automatic'],
          extra: 'Reading Stage: To Read',
          writable: true,
        },
      ],
      tags: new Set(['Elsewhere', 'elsewhere', 'automatic', 'Other group']),
    });
    expect((await host.load('all')).rows.map(({ id, writable }) => [id, writable])).toEqual([
      [1, true],
      [4, false],
    ]);
  });

  it('writes literal Extra using the latest schema, preserves unrelated data and never authorizes a reserved key', async () => {
    const item = nativeItem(1, 1, 'DOI: untouched\nReading Stage: first\nreading stage: another');
    const { host } = harness([item]);
    for (const key of ['DOI', 'New Zotero Field', 'Special CSL Field']) {
      await expect(
        host.change({ kind: 'define', property: { key, type: 'text' } }),
      ).rejects.toThrow();
      await expect(host.setProperty(1, key, 'changed')).rejects.toThrow();
    }
    const define = host.change({ kind: 'define', property: stage });
    const edit = host.setProperty(1, stage.key, ['To Read', 'Done']);
    await Promise.all([define, edit]);
    expect(item.savedExtra()).toBe('DOI: untouched\nReading Stage: To Read; Done');
    await expect(host.setProperty(1, stage.key, ['Removed'])).rejects.toThrow();
    expect(item.saveTx).toHaveBeenCalledTimes(1);
  });

  it('checks library and item permissions at mutation time and changes just one native tag', async () => {
    const item = nativeItem(1, 8);
    const lockedItem = nativeItem(2, 8, '', { readOnly: true });
    const { host, libraries, zotero, prefs, owner } = harness([item, lockedItem]);
    await host.change({ kind: 'define', property: stage });
    await expect(host.changeTag(2, 'new', true)).rejects.toThrow();
    const group = libraries[1]!;
    group.editable = false;
    await expect(host.setProperty(1, stage.key, ['Done'])).rejects.toThrow();
    await expect(host.changeTag(1, 'new', true)).rejects.toThrow();
    expect(item.saveTx).not.toHaveBeenCalled();
    group.editable = true;
    const popout = createWorkspaceHost(zotero, prefs, owner);
    await Promise.all([
      host.changeTag(1, 'automatic', true),
      host.changeTag(1, ' Keep ', true),
      popout.changeTag(1, 'Remove', true),
      host.changeTag(1, 'Remove', false),
    ]);
    expect(item.getTags()).toEqual([
      { tag: 'automatic', type: 1 },
      { tag: 'Keep', type: 0 },
    ]);
    expect(item.saveTx).toHaveBeenCalledTimes(3);
  });

  it('suggests only genuinely reserved keys using both built-in and native guards', () => {
    const { host, zotero } = harness();
    expect(host.suggestPropertyKey('Status', [])).toBe('Reading Status');
    expect(host.suggestPropertyKey('DOI', [])).toBe('Reference DOI');
    expect(host.suggestPropertyKey('Special CSL Field', [])).toBe('Reference Special CSL Field');
    expect(
      host.suggestPropertyKey('Status', [
        { key: 'reading status', type: 'text' },
        { key: 'Reading Status 2', type: 'text' },
      ]),
    ).toBe('Reading Status 3');
    expect(host.suggestPropertyKey('Ordinary', [])).toBeUndefined();
    expect(host.suggestPropertyKey('Bad: key', [])).toBeUndefined();
    expect(
      host.suggestPropertyKey('Ordinary', [{ key: 'ordinary', type: 'text' }]),
    ).toBeUndefined();
    vi.spyOn(zotero.Utilities.Internal, 'extractExtraFields').mockImplementation(() => {
      throw new Error('Native helper failed');
    });
    expect(() => host.suggestPropertyKey('Another key', [])).toThrow('Native helper failed');
  });

  it('validates suggested suffixes against native fields as well as existing names', () => {
    const { host, zotero } = harness();
    const extract = zotero.Utilities.Internal.extractExtraFields;
    vi.spyOn(zotero.Utilities.Internal, 'extractExtraFields').mockImplementation((extra) => {
      if (extra.startsWith('Reference DOI:')) {
        return { itemType: null, fields: new Map([['mapped', 'book']]), creators: [] };
      }
      return extract(extra);
    });
    expect(host.suggestPropertyKey('DOI', [])).toBe('Reference DOI 2');
    expect(host.suggestPropertyKey('DOI', [{ key: 'DOI', type: 'text' }])).toBeUndefined();
  });

  it('bulk edits distinct explicit items with partial success and validates before any writes', async () => {
    const editable = nativeItem(1, 1, 'DOI: keep\nReading Stage: To Read');
    const locked = nativeItem(2, 9, 'DOI: locked\nReading Stage: To Read');
    const failed = nativeItem(3, 8, 'Reading Stage: To Read', { fail: true });
    const unchanged = nativeItem(4, 8, 'Reading Stage: Done');
    const stale = nativeItem(5, 8, 'Reading Stage: To Read', { deleted: true });
    const { host } = harness([editable, locked, failed, unchanged, stale]);
    await host.change({ kind: 'define', property: stage });
    await expect(
      host.bulk([1, 2], {
        kind: 'property',
        key: stage.key,
        value: ['Unknown'],
      }),
    ).rejects.toThrow();
    await expect(
      host.bulk([1, 2], {
        kind: 'property',
        key: stage.key,
        value: 'invalid shape',
      }),
    ).rejects.toThrow();
    expect(editable.saveTx).not.toHaveBeenCalled();
    expect(locked.saveTx).not.toHaveBeenCalled();
    await expect(
      host.bulk([1, 1, 2, 3, 4, 5, 999], {
        kind: 'property',
        key: stage.key,
        value: ['Done'],
      }),
    ).resolves.toEqual({ changed: 1, skipped: 4, readOnly: 1 });
    expect(editable.savedExtra()).toBe('DOI: keep\nReading Stage: Done');
    expect(locked.savedExtra()).toBe('DOI: locked\nReading Stage: To Read');
    expect(failed.savedExtra()).toBe('Reading Stage: To Read');
    expect(unchanged.saveTx).not.toHaveBeenCalled();
    expect(editable.saveTx).toHaveBeenCalledTimes(1);
  });

  it('bulk changes native tags without rewriting automatic tags or counting no-ops', async () => {
    const editable = nativeItem(1, 1);
    const locked = nativeItem(2, 9);
    const { host } = harness([editable, locked]);
    await expect(host.bulk([1, 2], { kind: 'tag', tag: 'automatic', add: true })).resolves.toEqual({
      changed: 0,
      skipped: 0,
      readOnly: 0,
    });
    await expect(
      host.bulk([1, 2, 1, 999], { kind: 'tag', tag: ' New ', add: true }),
    ).resolves.toEqual({ changed: 1, skipped: 2, readOnly: 1 });
    expect(editable.getTags()).toEqual([
      { tag: 'automatic', type: 1 },
      { tag: 'New', type: 0 },
    ]);
    expect(locked.getTags()).toEqual([{ tag: 'automatic', type: 1 }]);
    await expect(host.bulk([1], { kind: 'tag', tag: 'New', add: false })).resolves.toEqual({
      changed: 1,
      skipped: 0,
      readOnly: 0,
    });
    await expect(host.bulk([1], { kind: 'tag', tag: ' ', add: true })).rejects.toThrow();
  });

  it('serializes bulk edits and checks permissions again after loading each item', async () => {
    const first = nativeItem(1, 8);
    const second = nativeItem(2, 8);
    const { host, zotero, prefs, owner, libraries } = harness([first, second]);
    const popout = createWorkspaceHost(zotero, prefs, owner);
    const started = new Promise<() => void>((resolve) => {
      first.saveTx.mockImplementationOnce(() => new Promise<void>((resume) => resolve(resume)));
    });
    const bulk = host.bulk([1, 2], { kind: 'tag', tag: 'Bulk', add: true });
    const resume = await started;
    const next = expect(popout.changeTag(1, 'After', true)).rejects.toThrow();
    libraries[1]!.editable = false;
    resume();
    await expect(bulk).resolves.toEqual({ changed: 1, skipped: 1, readOnly: 1 });
    await next;
    expect(second.saveTx).not.toHaveBeenCalled();
  });

  it('coalesces data notifications across hosts during bulk while retaining per-item saves', async () => {
    const first = nativeItem(1, 1);
    const second = nativeItem(2, 1);
    const { host, zotero, prefs, owner, nativeObservers } = harness([first, second]);
    const other = createWorkspaceHost(zotero, prefs, owner);
    const listener = vi.fn();
    const otherListener = vi.fn();
    const stop = host.subscribe(listener);
    const stopOther = other.subscribe(otherListener);
    for (const item of [first, second]) {
      item.saveTx.mockImplementation(async () => {
        for (const { observer } of nativeObservers.values()) observer.notify();
      });
    }
    await host.bulk([1, 2], { kind: 'tag', tag: 'new', add: true });
    expect(first.saveTx).toHaveBeenCalledTimes(1);
    expect(second.saveTx).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls).toEqual([['data']]);
    expect(otherListener.mock.calls).toEqual([['data']]);
    stop();
    stopOther();
  });

  it('excludes sync carriers only after item data is loaded, including mutations and cleanup', async () => {
    const carrier = nativeItem(1, 1, 'Zotero Bases Sync: v1\nReading Stage: To Read');
    const paper = nativeItem(2, 1, 'Reading Stage: To Read');
    const { host, loadDataTypes } = harness([carrier, paper], [carrier, paper]);
    const loaded = new Set<number>();
    const getField = carrier.getField;
    vi.spyOn(carrier, 'getField').mockImplementation((field) => {
      if (field === 'extra' && !loaded.has(carrier.id)) throw new Error('Unloaded item data');
      return getField(field);
    });
    loadDataTypes.mockImplementation(async (items) => {
      for (const item of items) loaded.add(item.id);
    });
    expect((await host.load('all')).rows.map(({ id }) => id)).toEqual([2]);
    loaded.clear();
    expect((await host.load('group:73/CHILD007')).rows.map(({ id }) => id)).toEqual([2]);
    await host.change({ kind: 'define', property: stage });
    await expect(host.bulk([1, 2], { kind: 'tag', tag: 'new', add: true })).resolves.toEqual({
      changed: 1,
      skipped: 1,
      readOnly: 0,
    });
    await expect(host.setProperty(1, stage.key, ['Done'])).rejects.toThrow();
    await host.change({ kind: 'delete-property', key: stage.key, clean: true });
    expect(carrier.savedExtra()).toContain('Reading Stage: To Read');
  });

  it('renames a literal option across scopes with partial success and leaves unmatched rows unchanged', async () => {
    const extra = 'DOI: 10.1234/example\nReading Stage: To Read; Unknown';
    const user = nativeItem(1, 1, extra);
    const group = nativeItem(2, 8, extra);
    const locked = nativeItem(3, 9, extra);
    const failed = nativeItem(4, 8, extra, { fail: true });
    const unaffected = nativeItem(5, 9, 'Reading Stage: Done');
    const noProperty = nativeItem(6, 9, 'Other Key: To Read');
    const failedLoad = nativeItem(7, 1, extra);
    const { host, prefs, prefObservers, loadDataTypes } = harness([
      user,
      group,
      locked,
      failed,
      unaffected,
      noProperty,
      failedLoad,
    ]);
    loadDataTypes.mockImplementation(async (items) => {
      if (items.some(({ id }) => id === failedLoad.id)) throw new Error('Native load failed');
    });
    await host.change({ kind: 'define', property: stage });
    const schemaChanges = vi.fn();
    prefs.registerObserver(SCHEMA_PREF, schemaChanges, true);
    expect(prefObservers.size).toBe(1);
    const result = await host.change({
      kind: 'rename-option',
      key: stage.key,
      previous: 'To Read',
      next: 'Reading',
    });
    expect(result).toEqual({ changed: 2, skipped: 3 });
    expect(host.settings().properties).toEqual([{ ...stage, options: ['Reading', 'Done'] }]);
    expect(schemaChanges).toHaveBeenCalledTimes(1);
    expect(user.savedExtra()).toBe('DOI: 10.1234/example\nReading Stage: Reading; Unknown');
    expect(group.savedExtra()).toBe(user.savedExtra());
    expect(locked.savedExtra()).toBe(extra);
    expect(failed.savedExtra()).toBe(extra);
    expect(unaffected.saveTx).not.toHaveBeenCalled();
    expect(noProperty.saveTx).not.toHaveBeenCalled();
    expect(failedLoad.saveTx).not.toHaveBeenCalled();
  });

  it('supports definition-only deletion and targeted option and malformed field cleanup', async () => {
    const item = nativeItem(
      1,
      1,
      'Reading Stage: To Read; Done\nScore Test: invalid\nDOI: untouched',
    );
    const locked = nativeItem(2, 9, 'Score Test: 7');
    const { host } = harness([item, locked]);
    await host.change({ kind: 'define', property: stage });
    await host.change({ kind: 'define', property: { key: 'Score Test', type: 'number' } });
    await expect(
      host.change({ kind: 'delete-option', key: stage.key, option: 'To Read', clean: false }),
    ).resolves.toEqual({ changed: 0, skipped: 0 });
    expect(item.savedExtra()).toContain('Reading Stage: To Read; Done');
    await expect(
      host.change({ kind: 'delete-option', key: stage.key, option: 'Done', clean: true }),
    ).resolves.toEqual({ changed: 1, skipped: 0 });
    expect(item.savedExtra()).toContain('Reading Stage: To Read\n');
    await expect(
      host.change({ kind: 'delete-property', key: 'Score Test', clean: true }),
    ).resolves.toEqual({ changed: 1, skipped: 1 });
    expect(item.savedExtra()).toBe('Reading Stage: To Read\nDOI: untouched');
    await expect(
      host.change({ kind: 'delete-property', key: stage.key, clean: false }),
    ).resolves.toEqual({ changed: 0, skipped: 0 });
    expect(host.settings().properties).toEqual([]);
    expect(item.savedExtra()).toBe('Reading Stage: To Read\nDOI: untouched');
    expect(locked.savedExtra()).toBe('Score Test: 7');
  });

  it('persists a view immediately even during an in-progress schema cleanup', async () => {
    const item = nativeItem(1, 1, 'Reading Stage: To Read');
    const { host } = harness([item]);
    await host.change({ kind: 'define', property: stage });
    const saveStarted = new Promise<() => void>((start) => {
      item.saveTx.mockImplementationOnce(() => new Promise<void>((resume) => start(resume)));
    });
    const cleanup = host.change({ kind: 'delete-property', key: stage.key, clean: true });
    const resume = await saveStarted;
    try {
      const settings = host.settings();
      const view = { ...settings.views[0]!, name: 'No waiting' };
      const saveView = host.change({ kind: 'views', views: [view], active: view.id });
      expect(host.settings().views[0]?.name).toBe('No waiting');
      await saveView;
    } finally {
      resume();
      await cleanup;
    }
  });

  it('opens the native best PDF or locates the regular item and detaches all observers', async () => {
    const pdf = nativeItem(3, 8, '', { parentID: 1, pdf: true, regular: false });
    const paper = nativeItem(1, 8, '', { attachments: [3], best: pdf });
    const noPDF = nativeItem(2, 8);
    const { host, owner, nativeObservers, prefObservers, prefs } = harness([paper, noPDF, pdf]);
    await host.openItem(1, true);
    await host.openItem(2, true);
    await host.openItem(1, false);
    expect(owner.ZoteroPane.viewAttachment.mock.calls).toEqual([[3]]);
    expect(owner.ZoteroPane.selectItem.mock.calls).toEqual([[2], [1]]);

    const snapshot = nativeItem(4, 8, '', { parentID: 5, regular: false });
    const otherPDF = nativeItem(6, 8, '', { parentID: 5, pdf: true, regular: false });
    const mixed = nativeItem(5, 8, '', { attachments: [4, 6], best: snapshot });
    const mixedLibrary = harness([snapshot, mixed, otherPDF]);
    await mixedLibrary.host.openItem(5, true);
    expect(mixedLibrary.owner.ZoteroPane.viewAttachment).toHaveBeenCalledExactlyOnceWith(6);
    expect(mixedLibrary.owner.ZoteroPane.selectItem).not.toHaveBeenCalled();

    const listener = vi.fn();
    const unsubscribe = host.subscribe(listener);
    const entry = [...nativeObservers.values()][0]!;
    expect(entry.types).toEqual(
      expect.arrayContaining(['item', 'tag', 'collection', 'item-tag', 'collection-item']),
    );
    entry.observer.notify();
    const settings = host.settings();
    await host.change({
      kind: 'views',
      views: [{ ...settings.views[0]!, name: 'Instant' }],
      active: settings.active,
    });
    expect(host.settings().views[0]?.name).toBe('Instant');
    expect(listener.mock.calls).toEqual([['data'], ['settings']]);
    unsubscribe();
    unsubscribe();
    entry.observer.notify();
    prefs.set(VIEWS_PREF, '{}', true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(nativeObservers.size).toBe(0);
    expect(prefObservers.size).toBe(0);
  });
});
