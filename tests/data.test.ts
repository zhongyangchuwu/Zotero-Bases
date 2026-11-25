import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_PREF, TAG_COLORS_PREF, VIEWS_PREF } from '../src/config';
import { createWorkspaceHost } from '../src/data';
import type { LibraryOwner, Prefs, ZoteroData } from '../src/data';
import type { AttachmentKind, Property } from '../src/contracts';

type Item = Awaited<ReturnType<ZoteroData['Items']['getAll']>>[number];
type Collection = ReturnType<ZoteroData['Collections']['getByLibrary']>[number];
type ItemDataTypes = Parameters<ZoteroData['Items']['loadDataTypes']>[1];
type NativeObserver = Parameters<ZoteroData['Notifier']['registerObserver']>[0];

const journalArticle = 4;
const book = 2;
const software = 32;
const conferencePaper = 33;
const commonFields = [
  'title',
  'date',
  'citationKey',
  'DOI',
  'url',
  'shortTitle',
  'rights',
  'extra',
];
const archivedFields = ['archive', 'archiveLocation', 'callNumber'];
const fieldsByType = new Map<number, readonly string[]>([
  [
    journalArticle,
    [
      ...commonFields,
      ...archivedFields,
      'publicationTitle',
      'publisher',
      'place',
      'journalAbbreviation',
      'volume',
      'issue',
      'pages',
      'series',
      'seriesTitle',
      'language',
      'accessDate',
    ],
  ],
  [book, [...commonFields, ...archivedFields, 'publisher', 'edition', 'numPages', 'language']],
  [software, [...commonFields, ...archivedFields, 'company', 'seriesTitle']],
  [conferencePaper, [...commonFields, ...archivedFields, 'proceedingsTitle', 'publisher', 'pages']],
]);
const baseFieldsByType = new Map<number, Readonly<Record<string, string>>>([
  [software, { publisher: 'company' }],
  [conferencePaper, { publicationTitle: 'proceedingsTitle' }],
]);
const fieldNames = [...new Set([...fieldsByType.values()].flat())];
const fieldIDs = new Map(fieldNames.map((name, index) => [name, index + 1]));

function fieldName(field: string | number): string {
  const name = typeof field === 'number' ? fieldNames[field - 1] : field;
  if (!name || !fieldIDs.has(name)) throw new Error(`Unknown native field: ${field}`);
  return name;
}

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
    dateAdded?: string;
    attachment?: AttachmentKind | 'linked-url';
    regular?: boolean;
    typeID?: number;
    fields?: Readonly<Record<string, string>>;
    collections?: readonly number[];
    trashedCollections?: readonly number[];
    notes?: readonly number[];
    trashedNotes?: readonly number[];
    attachments?: readonly number[];
    trashedAttachments?: readonly number[];
    lastRead?: number;
    best?: Item;
  } = {},
) {
  let extra = initialExtra;
  let onDisk = initialExtra;
  let tags = [{ tag: 'automatic', type: 1 }];
  const itemTypeID = flags.typeID ?? journalArticle;
  const values: Readonly<Record<string, string>> = flags.fields ?? {
    date: '2025-00-00 2025',
    publicationTitle: 'Science',
  };
  const item = {
    id,
    libraryID,
    parentID: flags.parentID ?? false,
    deleted: flags.deleted ?? false,
    isFeedItem: flags.feed ?? false,
    dateAdded: flags.dateAdded ?? '2026-05-24 20:52:26',
    dateModified: '2026-05-26 09:02:15',
    attachmentLastRead: flags.lastRead ?? (flags.parentID ? null : undefined),
    itemTypeID,
    isRegularItem: () => flags.regular ?? !flags.attachment,
    isEditable: () => !flags.readOnly,
    isPDFAttachment: () => flags.attachment === 'pdf',
    isEPUBAttachment: () => flags.attachment === 'epub',
    isSnapshotAttachment: () => flags.attachment === 'snapshot',
    isFileAttachment: () => !!flags.attachment && flags.attachment !== 'linked-url',
    getField(field: string | number, unformatted = false) {
      const name = fieldName(field);
      if (!fieldsByType.get(itemTypeID)?.includes(name))
        throw new Error(`${name} is unsupported for item type ${itemTypeID}`);
      if (name === 'extra') return extra;
      if (name === 'title') return values[name] ?? `Item ${id}`;
      const value = values[name] ?? '';
      // Native getField formats multipart publication dates unless unformatted is true.
      if (
        name === 'date' &&
        !unformatted &&
        /^\d{4}-\d{2}-\d{2} /u.test(value) &&
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/u.test(value)
      )
        return value.slice(11);
      return value;
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
    getCollections: (includeTrashed: boolean) =>
      includeTrashed
        ? [...(flags.collections ?? []), ...(flags.trashedCollections ?? [])]
        : (flags.collections ?? []),
    getNotes: (includeTrashed: boolean) =>
      includeTrashed
        ? [...(flags.notes ?? []), ...(flags.trashedNotes ?? [])]
        : (flags.notes ?? []),
    getAttachments: (includeTrashed = false) =>
      includeTrashed
        ? [...(flags.attachments ?? []), ...(flags.trashedAttachments ?? [])]
        : (flags.attachments ?? []),
    getItemLastRead(): number | null {
      return null;
    },
    getBestAttachment: vi.fn(async (): Promise<Item | false> => flags.best ?? false),
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

function nativeCollection(
  id: number,
  libraryID: number,
  name: string,
  deleted = false,
): Collection {
  return {
    id,
    libraryID,
    name,
    deleted,
    key: `COL${id}`,
    parentID: false,
    loadDataType: async () => {},
    getChildItems: () => [],
  };
}

function harness(
  items: readonly Item[] = [],
  collectionItems: readonly Item[] = [],
  additionalCollections: readonly Collection[] = [],
) {
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
  const collections = [root, child, ...additionalCollections];
  const raw = new Map<string, string>();
  const prefObservers = new Map<symbol, { key: string; listener: () => void }>();
  const nativeObservers = new Map<
    string,
    { observer: NativeObserver; types: string[]; priority: number | undefined }
  >();
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
  const cachedAttachments = new Map<number, Item>();
  for (const item of new Set([...items, ...collectionItems])) {
    if (!item.isRegularItem()) continue;
    item.getItemLastRead = () => {
      let max: number | null = null;
      for (const id of item.getAttachments(false)) {
        const attachment = cachedAttachments.get(id);
        if (!attachment && byID.has(id)) throw new Error(`Attachment ${id} not loaded`);
        const lastRead = attachment?.attachmentLastRead;
        if (lastRead != null && (max === null || lastRead > max)) max = lastRead;
      }
      return max;
    };
  }
  const getAsyncCalls: (number | readonly number[])[] = [];
  async function getAsync(id: number): Promise<Item | undefined>;
  async function getAsync(ids: readonly number[]): Promise<Item[]>;
  async function getAsync(id: number | readonly number[]) {
    getAsyncCalls.push(id);
    if (typeof id === 'number') return byID.get(id);
    const found = id.flatMap((id) => byID.get(id) ?? []);
    for (const item of found) cachedAttachments.set(item.id, item);
    return found;
  }
  const loadDataTypes = vi.fn(async (_items: readonly Item[], _types: ItemDataTypes) => {});
  const getByLibrary = vi.fn((id: number, _recursive: true, includeTrashed: false) =>
    collections.filter(
      (collection) => collection.libraryID === id && (includeTrashed || !collection.deleted),
    ),
  );
  const getColors = vi.fn((_id: number) => new Map<string, { color: string; position: number }>());
  const zotero: ZoteroData = {
    Libraries: {
      userLibraryID: 1,
      getAll: () => libraries,
      get: (id) => libraries.find(({ libraryID }) => libraryID === id) ?? false,
    },
    Items: {
      getAll: async (id) => items.filter((item) => item.libraryID === id && !item.parentID),
      getAsync,
      loadDataTypes,
    },
    Collections: {
      getByLibrary,
      getByLibraryAndKeyAsync: async (id, key) =>
        collections.find((collection) => collection.libraryID === id && collection.key === key) ??
        false,
    },
    Tags: {
      getAll: (id) => {
        if (id === 1) return [{ tag: 'Elsewhere' }];
        if (id === 8) return Promise.resolve([{ tag: 'automatic' }, { tag: 'elsewhere' }]);
        return [{ tag: id === 11 ? 'Feed only' : 'Other group' }];
      },
      getColors,
    },
    ItemFields: {
      getAll: () => [...fieldNames, 'newZoteroField'].map((name) => ({ name })),
      getID: (field) => fieldIDs.get(field) ?? false,
      getFieldIDFromTypeAndBase(typeID, field) {
        const name = fieldName(field);
        const mapped = baseFieldsByType.get(typeID)?.[name] ?? name;
        return fieldsByType.get(typeID)?.includes(mapped) ? (fieldIDs.get(mapped) ?? false) : false;
      },
      isValidForType: (field, typeID) =>
        fieldsByType.get(typeID)?.includes(fieldName(field)) ?? false,
    },
    ItemTypes: {
      getLocalizedString: () => 'Journal Article',
      getName: (id) => (id === book ? 'book' : 'journalArticle'),
    },
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
      registerObserver(observer, types, _name, priority) {
        const id = String(nativeObservers.size);
        nativeObservers.set(id, { observer, types, priority });
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
    getAsyncCalls,
    getByLibrary,
    getColors,
    prefObservers,
    nativeObservers,
    emit(action: string, type: string, ids: readonly (string | number)[]) {
      const observers = [...nativeObservers.values()].sort(
        (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
      );
      for (const { observer, types } of observers)
        if (types.includes(type)) observer.notify(action, type, ids);
    },
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
    const pdf = nativeItem(3, 8, '', { parentID: 1, attachment: 'pdf' });
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
    expect(catalog).toMatchObject({
      rows: [
        {
          id: 1,
          title: 'Item 1',
          creators: 'Ada Lovelace',
          year: '2025',
          source: 'Science',
          type: 'Journal Article',
          itemType: 'journalArticle',
          added: '2026-05-24 20:52:26',
          pdf: true,
          attachment: 'pdf',
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

  it('copies native tag colors once per represented library and refreshes after the native cache', async () => {
    const personal = nativeItem(1, 1);
    const groupA = nativeItem(2, 8);
    const groupB = nativeItem(3, 8);
    const { host, getColors, zotero, emit } = harness([personal, groupA, groupB], [groupA, groupB]);
    const groupColor = { color: '#A1B2C3', position: 0 };
    const group = new Map([
      ['Cafe\u0301', groupColor],
      ['café', { color: '#fff', position: 1 }],
      ['Invalid hex', { color: '#00000G', position: 2 }],
      ['Not hex', { color: 'var(--blocked)', position: 3 }],
    ]);
    const user = new Map([['Café', { color: '#224466', position: 0 }]]);
    getColors.mockImplementation((id) => (id === 8 ? group : user));

    const initial = await host.load('group:73/CHILD007');
    expect(getColors.mock.calls).toEqual([[8]]);
    const copied = initial.rows[0]?.nativeTagColors;
    expect(copied).toEqual(
      new Map([
        ['Café', '#A1B2C3'],
        ['café', '#fff'],
      ]),
    );
    expect(copied).not.toBe(group);
    expect(initial.rows[1]?.nativeTagColors).toBe(copied);

    getColors.mockClear();
    const all = await host.load('all');
    expect(getColors.mock.calls).toEqual([[1], [8]]);
    expect(all.rows.find(({ id }) => id === personal.id)?.nativeTagColors?.get('Café')).toBe(
      '#224466',
    );

    const listener = vi.fn();
    const stop = host.subscribe((kind) => listener(kind, groupColor.color));
    zotero.Notifier.registerObserver(
      {
        notify(_action, _type, ids) {
          if (!ids.includes('8/tagColors')) return;
          groupColor.color = '#CCDD00';
          emit('redraw', 'item', [groupA.id, groupB.id]);
        },
      },
      ['setting'],
      'tags',
    );
    emit('modify', 'setting', ['8/unrelated']);
    expect(listener).not.toHaveBeenCalled();
    emit('modify', 'setting', ['8/tagColors']);
    expect(listener).toHaveBeenCalledExactlyOnceWith('data', '#CCDD00');
    expect(copied?.get('Café')).toBe('#A1B2C3');
    const updated = await host.load('group:73/CHILD007');
    expect(updated.rows[0]?.nativeTagColors?.get('Café')).toBe('#CCDD00');
    stop();
  });

  it('loads 322 Zotero rows in batches with type-valid bibliographic fields and cached child metadata', async () => {
    const recent = Date.UTC(2026, 4, 28, 12, 30) / 1_000;
    const pdf = nativeItem(500, 1, '', {
      parentID: 1,
      attachment: 'pdf',
      lastRead: recent,
    });
    const snapshot = nativeItem(501, 1, '', {
      parentID: 1,
      attachment: 'snapshot',
      lastRead: recent - 60,
    });
    const trashedPDF = nativeItem(502, 1, '', {
      parentID: 1,
      deleted: true,
      attachment: 'pdf',
      lastRead: recent + 60,
    });
    const paper = nativeItem(1, 1, '', {
      collections: [21, 22, 23],
      trashedCollections: [24],
      notes: [601, 602],
      trashedNotes: [603],
      attachments: [500, 501],
      trashedAttachments: [502],
      fields: {
        citationKey: 'lovelaceNotes2025',
        publicationTitle: 'Journal of Computing',
        date: '2025-00-00 Spring 2025',
        DOI: '10.1234/notes',
        url: 'https://example.org/article',
        journalAbbreviation: 'J. Comput.',
        publisher: 'Example Press',
        shortTitle: 'Notes',
        volume: '12',
        issue: '3',
        pages: '123–130',
        language: 'en',
        series: 'Computing',
        seriesTitle: 'Computing History',
        callNumber: 'QA76',
        place: 'London',
        accessDate: '2026-05-20 11:30:12',
        archive: 'Example Archive',
        archiveLocation: 'Box 7',
        rights: 'CC BY 4.0',
      },
    });
    const volume = nativeItem(2, 1, '', {
      typeID: book,
      fields: { date: '0000-00-00 in press', edition: '2nd', numPages: '260', publisher: 'Books' },
    });
    const program = nativeItem(3, 8, '', {
      typeID: software,
      collections: [15],
      fields: { company: 'Software Press', seriesTitle: 'Tools' },
    });
    const proceedings = nativeItem(4, 8, '', {
      typeID: conferencePaper,
      fields: { proceedingsTitle: 'Computing Conference', publisher: 'Society' },
    });
    const ordinary = Array.from({ length: 318 }, (_, index) =>
      nativeItem(10 + index, index % 2 ? 8 : 1),
    );
    const candidates = [paper, volume, program, proceedings, ...ordinary];
    const { host, loadDataTypes, getAsyncCalls, getByLibrary } = harness(
      [...candidates, pdf, snapshot, trashedPDF],
      [],
      [
        nativeCollection(21, 1, 'Zeta'),
        nativeCollection(22, 1, 'Alpha'),
        nativeCollection(23, 1, 'Alpha'),
        nativeCollection(24, 1, 'Trashed', true),
        nativeCollection(25, 1, 'Empty Collection'),
      ],
    );
    const loaded = new Set<ItemDataTypes[number]>();
    loadDataTypes.mockImplementation(async (items, types) => {
      if (items.includes(paper)) for (const type of types) loaded.add(type);
    });
    const getNotes = paper.getNotes;
    vi.spyOn(paper, 'getNotes').mockImplementation((includeTrashed) => {
      if (!loaded.has('childItems')) throw new Error('Child items not loaded');
      return getNotes(includeTrashed);
    });
    const getCollections = paper.getCollections;
    vi.spyOn(paper, 'getCollections').mockImplementation((includeTrashed) => {
      if (!loaded.has('collections')) throw new Error('Collections not loaded');
      return getCollections(includeTrashed);
    });
    const getField = paper.getField;
    vi.spyOn(paper, 'getField').mockImplementation((field, unformatted) => {
      if (!loaded.has('itemData')) throw new Error('Item fields not loaded');
      return getField(field, unformatted);
    });

    const catalog = await host.load('all');
    expect(catalog.rows).toHaveLength(322);
    expect(new Set(catalog.rows.map(({ id }) => id)).size).toBe(322);
    expect(loadDataTypes).toHaveBeenCalledTimes(1);
    expect(loadDataTypes.mock.calls[0]?.[0]).toHaveLength(candidates.length);
    expect(loaded).toEqual(new Set(['itemData', 'creators', 'tags', 'childItems', 'collections']));
    expect(getAsyncCalls).toEqual([[500, 501]]);
    expect(getByLibrary.mock.calls).toEqual([
      [1, true, false],
      [8, true, false],
    ]);
    expect(catalog.collections).toEqual(
      new Set(['Alpha', 'Zeta', 'Child', 'Root', 'Empty Collection']),
    );
    const rows = new Map(catalog.rows.map((row) => [row.id, row]));
    expect(rows.get(paper.id)).toMatchObject({
      citationKey: 'lovelaceNotes2025',
      source: 'Journal of Computing',
      year: '2025',
      date: '2025-00-00 Spring 2025',
      dateModified: '2026-05-26 09:02:15',
      lastRead: '2026-05-28T12:30:00.000Z',
      collections: ['Alpha', 'Zeta'],
      notesCount: '2',
      attachmentsCount: '2',
      pdf: true,
      doi: '10.1234/notes',
      url: 'https://example.org/article',
      journalAbbreviation: 'J. Comput.',
      publisher: 'Example Press',
      shortTitle: 'Notes',
      volume: '12',
      issue: '3',
      pages: '123–130',
      language: 'en',
      series: 'Computing',
      seriesTitle: 'Computing History',
      callNumber: 'QA76',
      place: 'London',
      accessDate: '2026-05-20 11:30:12',
      archive: 'Example Archive',
      archiveLocation: 'Box 7',
      rights: 'CC BY 4.0',
    });
    expect(rows.get(volume.id)).toMatchObject({
      itemType: 'book',
      source: 'Books',
      date: '0000-00-00 in press',
      year: '',
      edition: '2nd',
      journalAbbreviation: '',
      seriesTitle: '',
      pages: '',
      notesCount: '0',
      attachmentsCount: '0',
      lastRead: '',
      collections: [],
    });
    expect(rows.get(program.id)).toMatchObject({
      publisher: 'Software Press',
      source: 'Software Press',
      seriesTitle: 'Tools',
      accessDate: '',
      language: '',
      doi: '',
      date: '',
      collections: ['Child'],
    });
    expect(rows.get(proceedings.id)?.source).toBe('Computing Conference');
  });

  it('leaves unknown host fields blank without calling getField or base mapping for them', async () => {
    const item = nativeItem(1, 1, '', { fields: { publisher: 'Press' } });
    const { host, zotero } = harness([item]);
    const getID = zotero.ItemFields.getID;
    const getField = item.getField;
    vi.spyOn(zotero.ItemFields, 'getID').mockImplementation((field) =>
      field === 'publisher' ? false : getID(field),
    );
    vi.spyOn(item, 'getField').mockImplementation((field, unformatted) => {
      if (fieldName(field) === 'publisher') throw new Error('Field absent from host schema');
      return getField(field, unformatted);
    });
    expect((await host.load('user')).rows[0]).toMatchObject({ publisher: '', source: '' });
  });

  it('invalidates memberships and changed last-read timestamps after the native read observer', async () => {
    const memberships: number[] = [];
    const pdf = nativeItem(2, 8, '', { parentID: 1, attachment: 'pdf' });
    const paper = nativeItem(1, 8, '', { attachments: [2], collections: memberships });
    const { host, emit, nativeObservers, getAsyncCalls } = harness([paper, pdf]);
    expect((await host.load('group:73')).rows[0]).toMatchObject({ collections: [], lastRead: '' });

    const listener = vi.fn();
    const stop = host.subscribe(listener);
    expect([...nativeObservers.values()][0]?.priority).toBeGreaterThan(100);

    memberships.push(15);
    emit('add', 'collection-item', ['15-1']);
    expect(listener).toHaveBeenCalledExactlyOnceWith('data');
    expect((await host.load('group:73')).rows[0]?.collections).toEqual(['Child']);

    listener.mockClear();
    getAsyncCalls.length = 0;
    emit('pageChange', 'file', [pdf.id]);
    emit('modify', 'setting', ['1/lastRead_u_ABCD1234', '8/lastRead_g73_ABCD1234', '1/color']);
    pdf.attachmentLastRead = Date.UTC(2026, 4, 28, 12, 30) / 1_000;
    emit('modify', 'file', [pdf.id]);
    expect(listener).not.toHaveBeenCalled();

    emit('open', 'file', [pdf.id]);
    expect(listener).toHaveBeenCalledExactlyOnceWith('data');
    expect(getAsyncCalls).toEqual([]);
    expect((await host.load('group:73')).rows[0]?.lastRead).toBe('2026-05-28T12:30:00.000Z');

    listener.mockClear();
    emit('pageChange', 'file', [pdf.id]);
    expect(listener).not.toHaveBeenCalled();
    pdf.attachmentLastRead += 5 * 60;
    emit('pageChange', 'file', [pdf.id]);
    expect(listener).toHaveBeenCalledExactlyOnceWith('data');
    expect((await host.load('group:73')).rows[0]?.lastRead).toBe('2026-05-28T12:35:00.000Z');

    listener.mockClear();
    pdf.attachmentLastRead = null;
    emit('delete', 'setting', ['1/lastRead_g73_ABCD1234']);
    expect(listener).toHaveBeenCalledExactlyOnceWith('data');
    expect((await host.load('group:73')).rows[0]?.lastRead).toBe('');
    stop();
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

  it.each([
    { property: { key: 'Stars', type: 'rating' }, value: '4', invalid: '04' },
    {
      property: { key: 'Project Link', type: 'url' },
      value: 'https://example.org/repo',
      invalid: 'javascript:void(0)',
    },
    { property: { key: 'Read On', type: 'date' }, value: '2024-02-29', invalid: '2024-02-30' },
  ] as const)(
    'validates, bulk edits, and cleans up $property.type Extra',
    async ({ property, value, invalid }) => {
      const { key } = property;
      const before = `DOI: preserve\r\n${key}: ${value}\n${key}-notes: keep\n${key}: ${invalid}\nFree text`;
      const first = nativeItem(1, 1, before);
      const second = nativeItem(2, 8, 'First line\n');
      const unselected = nativeItem(3, 1, before);
      const { host } = harness([first, second, unselected]);
      await host.change({ kind: 'define', property });
      expect(host.settings().properties).toEqual([property]);
      await expect(host.setProperty(1, key, invalid)).rejects.toThrow();
      await expect(host.bulk([1, 2], { kind: 'property', key, value: invalid })).rejects.toThrow();
      expect(first.saveTx).not.toHaveBeenCalled();
      expect(second.saveTx).not.toHaveBeenCalled();

      await expect(host.bulk([1, 2], { kind: 'property', key, value })).resolves.toEqual({
        changed: 2,
        skipped: 0,
        readOnly: 0,
      });
      expect(first.savedExtra()).toBe(
        `DOI: preserve\r\n${key}-notes: keep\n${key}: ${value}\nFree text`,
      );
      expect(second.savedExtra()).toBe(`First line\n${key}: ${value}`);
      expect(unselected.savedExtra()).toBe(before);
      expect(unselected.saveTx).not.toHaveBeenCalled();

      await expect(host.bulk([2], { kind: 'property', key, value: null })).resolves.toEqual({
        changed: 1,
        skipped: 0,
        readOnly: 0,
      });
      expect(second.savedExtra()).toBe('First line\n');
      await expect(host.change({ kind: 'delete-property', key, clean: true })).resolves.toEqual({
        changed: 2,
        skipped: 0,
      });
      const remaining = `DOI: preserve\r\n${key}-notes: keep\nFree text`;
      expect(first.savedExtra()).toBe(remaining);
      expect(unselected.savedExtra()).toBe(remaining);
      expect(host.settings().properties).toEqual([]);
    },
  );

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
    const { host, zotero, prefs, owner, emit } = harness([first, second]);
    const other = createWorkspaceHost(zotero, prefs, owner);
    const listener = vi.fn();
    const otherListener = vi.fn();
    const stop = host.subscribe(listener);
    const stopOther = other.subscribe(otherListener);
    for (const item of [first, second]) {
      item.saveTx.mockImplementation(async () => {
        emit('modify', 'item', [item.id]);
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

  it('sets option colors on the definition only and keeps them through option edits', async () => {
    const extra = 'Reading Stage: To Read; Done\r\nDOI: untouched';
    const item = nativeItem(1, 1, extra);
    const { host, loadDataTypes, prefs } = harness([item]);
    await host.change({ kind: 'define', property: stage });
    await expect(
      host.change({
        kind: 'set-option-color',
        key: 'reading stage',
        option: ' To Read ',
        color: 'amber',
      }),
    ).resolves.toEqual({ changed: 0, skipped: 0 });
    expect(loadDataTypes).not.toHaveBeenCalled();
    expect(item.saveTx).not.toHaveBeenCalled();
    expect(item.savedExtra()).toBe(extra);
    expect(JSON.parse(prefs.get(SCHEMA_PREF, true) as string)).toEqual([
      { ...stage, optionColors: { 'To Read': 'amber' } },
    ]);
    await expect(
      host.change({ kind: 'set-option-color', key: stage.key, option: 'Absent', color: 'sky' }),
    ).rejects.toThrow(/Option no longer exists/);

    const stale = host.settings().properties[0]!;
    await host.change({
      kind: 'set-option-color',
      key: stage.key,
      option: 'To Read',
      color: 'violet',
    });
    await host.change({ kind: 'set-option-color', key: stage.key, option: 'Done', color: 'green' });
    await host.change({
      kind: 'define',
      property: { ...stale, options: [...stage.options, 'Later'] },
    });
    expect(host.settings().properties).toEqual([
      {
        ...stage,
        options: ['To Read', 'Done', 'Later'],
        optionColors: { 'To Read': 'violet', Done: 'green' },
      },
    ]);

    await host.change({
      kind: 'rename-option',
      key: stage.key,
      previous: 'To Read',
      next: ' Cafe\u0301 ',
    });
    expect(host.settings().properties[0]?.optionColors).toEqual({ Café: 'violet', Done: 'green' });
    expect(item.savedExtra()).toBe('Reading Stage: Café; Done\r\nDOI: untouched');
    await host.change({ kind: 'delete-option', key: stage.key, option: 'Done', clean: false });
    expect(host.settings().properties[0]?.optionColors).toEqual({ Café: 'violet' });
    await host.change({
      kind: 'set-option-color',
      key: stage.key,
      option: 'Café',
      color: undefined,
    });
    expect(host.settings().properties).toEqual([{ ...stage, options: ['Café', 'Later'] }]);
    expect(item.saveTx).toHaveBeenCalledTimes(1);
    expect(item.savedExtra()).toBe('Reading Stage: Café; Done\r\nDOI: untouched');
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

  it('persists and observes view and tag-color changes immediately during schema cleanup', async () => {
    const item = nativeItem(1, 1, 'Reading Stage: To Read');
    const { host, owner, prefs, zotero } = harness([item]);
    const other = createWorkspaceHost(zotero, prefs, owner);
    const listener = vi.fn();
    const stop = other.subscribe(listener);
    await host.change({ kind: 'define', property: stage });
    const saveStarted = new Promise<() => void>((start) => {
      item.saveTx.mockImplementationOnce(() => new Promise<void>((resume) => start(resume)));
    });
    const cleanup = host.change({ kind: 'delete-property', key: stage.key, clean: true });
    const resume = await saveStarted;
    listener.mockClear();
    try {
      const settings = host.settings();
      const view = { ...settings.views[0]!, name: 'No waiting' };
      const saveView = host.change({ kind: 'views', views: [view], active: view.id });
      expect(host.settings().views[0]?.name).toBe('No waiting');
      await saveView;
      const setColor = host.change({
        kind: 'set-tag-color',
        target: 'prefix',
        name: 'Café:',
        color: 'orange',
      });
      expect(other.settings().tagColors).toEqual([
        { kind: 'prefix', name: 'Café:', color: 'orange' },
      ]);
      await setColor;
      const resetColor = other.change({
        kind: 'set-tag-color',
        target: 'prefix',
        name: 'Cafe\u0301:',
        color: undefined,
      });
      expect(host.settings().tagColors).toEqual([]);
      await resetColor;
      expect(listener.mock.calls).toEqual([['settings'], ['settings'], ['settings']]);
    } finally {
      stop();
      resume();
      await cleanup;
    }
  });

  it('displays and opens the same ranked file without a per-row best-attachment query', async () => {
    const url = 'https://example.org/paper';
    function child(
      id: number,
      parentID: number,
      attachment: AttachmentKind | 'linked-url',
      day: number,
      url?: string,
    ) {
      return nativeItem(id, 1, '', {
        parentID,
        attachment,
        dateAdded: `2026-05-${String(day).padStart(2, '0')} 10:00:00`,
        fields: url ? { url } : {},
      });
    }
    const betterPDF = child(10, 1, 'pdf', 5, url);
    const pdfFiles = [
      child(11, 1, 'pdf', 5, url), // same date and URL, larger ID
      child(12, 1, 'pdf', 6, url),
      child(13, 1, 'pdf', 1, 'https://example.org/other'),
      child(14, 1, 'epub', 1, url),
      betterPDF,
    ];
    const pdfParent = nativeItem(1, 1, '', {
      fields: { url },
      attachments: pdfFiles.map(({ id }) => id),
      best: pdfFiles[0],
    });
    const epub = child(20, 2, 'epub', 2, url);
    const htmlWithoutMatch = child(21, 2, 'snapshot', 1, 'https://example.org/other');
    const ebook = nativeItem(2, 1, '', {
      fields: { url },
      attachments: [htmlWithoutMatch.id, epub.id],
      best: htmlWithoutMatch,
    });
    const html = child(30, 3, 'snapshot', 1);
    const page = nativeItem(3, 1, '', { attachments: [html.id] });
    const file = child(40, 4, 'file', 1);
    const document = nativeItem(4, 1, '', { attachments: [file.id] });
    const link = child(50, 5, 'linked-url', 1, url);
    const deleted = child(51, 5, 'pdf', 1, url);
    deleted.deleted = true;
    const linksOnly = nativeItem(5, 1, '', { attachments: [link.id, deleted.id], best: link });
    const parents = [pdfParent, ebook, page, document, linksOnly];
    const { host, owner, getAsyncCalls, loadDataTypes } = harness([
      ...parents,
      ...pdfFiles,
      epub,
      htmlWithoutMatch,
      html,
      file,
      link,
      deleted,
    ]);

    const catalog = await host.load('user');
    expect(catalog.rows.map(({ attachment, pdf }) => [attachment, pdf])).toEqual([
      ['pdf', true],
      ['epub', false],
      ['snapshot', false],
      ['file', false],
      [undefined, false],
    ]);
    expect(getAsyncCalls).toHaveLength(1);
    expect(loadDataTypes).toHaveBeenCalledTimes(2);
    const [urlItems, dataTypes] = loadDataTypes.mock.calls[1]!;
    expect(new Set(urlItems.map(({ id }) => id))).toEqual(new Set([10, 11, 12, 13, 20, 21]));
    expect(dataTypes).toEqual(['itemData']);
    for (const { id } of parents) await host.openItem(id, 'attachment');
    for (const { getBestAttachment } of parents) expect(getBestAttachment).not.toHaveBeenCalled();
    expect(owner.ZoteroPane.viewAttachment.mock.calls).toEqual([[10], [20], [30], [40]]);
    expect(owner.ZoteroPane.selectItem.mock.calls).toEqual([[5]]);

    betterPDF.deleted = true;
    await host.openItem(pdfParent.id, 'attachment');
    expect(owner.ZoteroPane.viewAttachment).toHaveBeenCalledTimes(4);
    expect(owner.ZoteroPane.selectItem).toHaveBeenLastCalledWith(pdfParent.id);
  });

  it('preserves the newer catalog attachment cache and uses native ranking for an uncached click', async () => {
    const pdf = nativeItem(10, 1, '', { parentID: 1, attachment: 'pdf' });
    const paper = nativeItem(1, 1, '', { attachments: [pdf.id], best: pdf });
    const epub = nativeItem(20, 8, '', { parentID: 2, attachment: 'epub' });
    const ebook = nativeItem(2, 8, '', { attachments: [epub.id] });
    const { host, owner, zotero } = harness([paper, pdf, ebook, epub]);
    let release!: (items: Item[]) => void;
    const delayed = new Promise<Item[]>((resolve) => {
      release = resolve;
    });
    const getAll = zotero.Items.getAll;
    vi.spyOn(zotero.Items, 'getAll').mockImplementation((id, topLevel, deleted) =>
      id === 1 ? delayed : getAll(id, topLevel, deleted),
    );

    const older = host.load('user');
    expect((await host.load('group:73')).rows[0]?.attachment).toBe('epub');
    release([paper]);
    await older;
    await host.openItem(ebook.id, 'attachment');
    await host.openItem(paper.id, 'attachment');
    expect(ebook.getBestAttachment).not.toHaveBeenCalled();
    expect(paper.getBestAttachment).toHaveBeenCalledTimes(1);
    expect(owner.ZoteroPane.viewAttachment.mock.calls).toEqual([[20], [10]]);
  });

  it('opens the native best PDF or locates the regular item and detaches all observers', async () => {
    const pdf = nativeItem(3, 8, '', { parentID: 1, attachment: 'pdf' });
    const paper = nativeItem(1, 8, '', { attachments: [3], best: pdf });
    const noPDF = nativeItem(2, 8);
    const { host, owner, nativeObservers, prefObservers, prefs } = harness([paper, noPDF, pdf]);
    await host.openItem(1, true);
    await host.openItem(2, true);
    await host.openItem(1, false);
    expect(owner.ZoteroPane.viewAttachment.mock.calls).toEqual([[3]]);
    expect(owner.ZoteroPane.selectItem.mock.calls).toEqual([[2], [1]]);

    const snapshot = nativeItem(4, 8, '', { parentID: 5, attachment: 'snapshot' });
    const otherPDF = nativeItem(6, 8, '', { parentID: 5, attachment: 'pdf' });
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
    entry.observer.notify('modify', 'item', [1]);
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
    entry.observer.notify('modify', 'item', [1]);
    prefs.set(VIEWS_PREF, '{}', true);
    prefs.set(TAG_COLORS_PREF, '[]', true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(nativeObservers.size).toBe(0);
    expect(prefObservers.size).toBe(0);
  });
});
