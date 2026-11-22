import { changeSchema, createConfig, SCHEMA_PREF, VIEWS_PREF } from './config';
import type { Prefs } from './config';
import type { Catalog, Property, PropertyValue, Row, Scope, WorkspaceHost } from './contracts';
import { isReservedPropertyKey, readProperty, validateProperty, writeProperty } from './extra';
import { isBasesSyncCarrier } from './sync-marker';

export type { Prefs } from './config';

interface NativeLibrary {
  readonly libraryID: number;
  readonly libraryType: string;
  readonly libraryTypeID: number;
  readonly name: string;
  readonly editable: boolean;
  readonly archived: boolean;
}

interface NativeTag {
  readonly tag: string;
}

type ItemData = 'itemData' | 'creators' | 'tags' | 'childItems';

interface NativeItem {
  readonly id: number;
  readonly libraryID: number;
  readonly itemTypeID: number;
  readonly parentID: number | false | null;
  readonly isFeedItem: boolean;
  readonly deleted: boolean;
  readonly dateAdded: string;
  isRegularItem(): boolean;
  isEditable(): boolean;
  isPDFAttachment(): boolean;
  getField(field: string, unformatted?: boolean, includeBaseMapped?: boolean): string;
  setField(field: 'extra', value: string): void;
  getCreators(): readonly { firstName: string; lastName: string; fieldMode: number }[];
  getTags(): readonly NativeTag[];
  addTag(tag: string): void;
  removeTag(tag: string): void;
  getAttachments(includeTrashed?: boolean): readonly number[];
  getBestAttachment(): Promise<NativeItem | false>;
  saveTx(): Promise<unknown>;
}

interface NativeCollection {
  readonly id: number;
  readonly libraryID: number;
  readonly key: string;
  readonly parentID: number | false | null;
  readonly deleted: boolean;
  readonly name: string;
  loadDataType(type: 'childItems'): Promise<void>;
  getChildItems(asIDs: false, includeTrashed: false): readonly NativeItem[];
}

export interface ZoteroData {
  readonly Libraries: {
    getAll(): readonly NativeLibrary[];
    get(id: number): NativeLibrary | false;
  };
  readonly Items: {
    getAll(libraryID: number, onlyTopLevel: true, includeDeleted: false): Promise<NativeItem[]>;
    getAsync(id: number): Promise<NativeItem | false | undefined>;
    getAsync(ids: readonly number[]): Promise<NativeItem[]>;
    loadDataTypes(items: readonly NativeItem[], types: readonly ItemData[]): Promise<void>;
  };
  readonly Collections: {
    getByLibrary(id: number, recursive: true, includeTrashed: false): readonly NativeCollection[];
    getByLibraryAndKeyAsync(id: number, key: string): Promise<NativeCollection | false>;
  };
  readonly Tags: {
    getAll(libraryID: number): readonly NativeTag[] | Promise<readonly NativeTag[]>;
  };
  readonly ItemFields: { getAll(): readonly { name: string }[] };
  readonly ItemTypes: { getLocalizedString(id: number): string };
  readonly Utilities: {
    readonly Internal: {
      extractExtraFields(extra: string): {
        readonly itemType: string | null;
        readonly fields: ReadonlyMap<string, string>;
        readonly creators: readonly unknown[];
      };
    };
  };
  readonly Notifier: {
    registerObserver(observer: { notify(): void }, types: string[], name: string): string;
    unregisterObserver(id: string): void;
  };
}

export interface LibraryOwner {
  readonly ZoteroPane: {
    getSelectedCollections(): readonly NativeCollection[];
    getSelectedLibraryIDs(): readonly number[];
    selectItem(id: number): Promise<unknown>;
    viewAttachment(id: number): Promise<unknown>;
  };
}

// Zotero caches native Item objects. Serialize read-modify-save across tab and popout hosts.
const pendingWrites = new WeakMap<ZoteroData, Promise<unknown>>();
const batchNotifications = new WeakMap<ZoteroData, Set<() => void>>();

function accessible(library: NativeLibrary | false): library is NativeLibrary {
  return !!library && (library.libraryType === 'user' || library.libraryType === 'group');
}

function scopeID(library: NativeLibrary): string {
  return library.libraryType === 'user' ? 'user' : `group:${library.libraryTypeID}`;
}

function ordinaryShape(item: NativeItem): boolean {
  return !item.deleted && !item.isFeedItem && item.isRegularItem();
}

function ordinary(item: NativeItem): boolean {
  return ordinaryShape(item) && !isBasesSyncCarrier(item.getField('extra'));
}

export function createPropertyValidation(zotero: Pick<ZoteroData, 'ItemFields' | 'Utilities'>): {
  validate(property: Property): Property;
  suggestPropertyKey(key: string, existing: readonly Property[]): string | undefined;
} {
  let reserved: ReadonlySet<string> | undefined;
  const checkedKeys = new Set<string>();
  const nativeReserved = (key: string): boolean => {
    if (checkedKeys.has(key)) return false;
    const { itemType, fields, creators } = zotero.Utilities.Internal.extractExtraFields(
      `${key}: book`,
    );
    if (itemType || fields.size || creators.length) return true;
    checkedKeys.add(key);
    return false;
  };
  const validate = (property: Property): Property => {
    reserved ??= new Set(zotero.ItemFields.getAll().map(({ name }) => name));
    const normalized = validateProperty(property, reserved);
    if (nativeReserved(normalized.key)) throw new Error('Reserved Zotero Extra key');
    return normalized;
  };
  return {
    validate,
    suggestPropertyKey(raw, existing) {
      const key = raw.trim().normalize('NFC');
      if (!key || /[:\r\n\u0085\u2028\u2029]/u.test(raw)) return undefined;
      const identity = (value: string) => value.trim().normalize('NFC').toLowerCase();
      const used = new Set(existing.map((property) => identity(property.key)));
      if (used.has(identity(key))) return undefined;
      reserved ??= new Set(zotero.ItemFields.getAll().map(({ name }) => name));
      if (!isReservedPropertyKey(key, reserved) && !nativeReserved(key)) return undefined;
      const base = identity(key) === 'status' ? 'Reading Status' : `Reference ${key}`;
      for (let suffix = 1; suffix <= 1000; suffix++) {
        const candidate = suffix === 1 ? base : `${base} ${suffix}`;
        if (
          used.has(identity(candidate)) ||
          isReservedPropertyKey(candidate, reserved) ||
          nativeReserved(candidate)
        )
          continue;
        return validate({ key: candidate, type: 'text' }).key;
      }
      return undefined;
    },
  };
}

function checkOptions(
  property: Property,
  value: PropertyValue,
  existing: readonly unknown[] = [],
): void {
  if (property.type !== 'single-select' && property.type !== 'multi-select') return;
  for (const option of Array.isArray(value) ? value : [value]) {
    if (typeof option !== 'string') continue;
    const normalized = option.trim().normalize('NFC');
    if (normalized && !property.options?.includes(normalized) && !existing.includes(normalized)) {
      throw new Error('Option is no longer available');
    }
  }
}

function tagName(tag: string, add: boolean): string {
  const name = add ? tag.trim().normalize('NFC') : tag;
  if (!name) throw new Error('Tag cannot be empty');
  return name;
}

function applyTag(item: NativeItem, name: string, add: boolean): boolean {
  if (item.getTags().some(({ tag }) => tag === name) === add) return false;
  if (add) item.addTag(name);
  else item.removeTag(name);
  return true;
}

export function createWorkspaceHost(
  zotero: ZoteroData,
  prefs: Prefs,
  owner: LibraryOwner,
): WorkspaceHost {
  const pane = owner.ZoteroPane;
  const libraries = () => zotero.Libraries.getAll().filter(accessible);
  const initialScope = () => {
    const selectedLibraries = pane.getSelectedLibraryIDs();
    if (selectedLibraries.length > 1) return 'all';
    const id = selectedLibraries[0];
    if (id === undefined) return 'user';
    const library = zotero.Libraries.get(id);
    if (!accessible(library)) return 'user';
    const selected = pane.getSelectedCollections();
    const collection = selected.length === 1 ? selected[0] : undefined;
    const root = scopeID(library);
    return collection && !collection.deleted && collection.libraryID === id
      ? `${root}/${collection.key}`
      : root;
  };

  const { validate, suggestPropertyKey } = createPropertyValidation(zotero);
  const config = createConfig(prefs, initialScope, validate);

  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const run = (pendingWrites.get(zotero) ?? Promise.resolve()).then(operation);
    pendingWrites.set(
      zotero,
      run.catch(() => undefined),
    );
    return run;
  }

  function writable(item: NativeItem): boolean {
    const library = zotero.Libraries.get(item.libraryID);
    return accessible(library) && library.editable && !library.archived && item.isEditable();
  }

  async function requireItem(id: number): Promise<NativeItem> {
    const item = await zotero.Items.getAsync(id);
    if (!item || !ordinaryShape(item) || !accessible(zotero.Libraries.get(item.libraryID))) {
      throw new Error('Item is no longer available');
    }
    await zotero.Items.loadDataTypes([item], ['itemData']);
    if (!ordinary(item)) throw new Error('Item is no longer available');
    return item;
  }

  async function itemsFor(
    scope: string,
    available: readonly NativeLibrary[],
  ): Promise<NativeItem[]> {
    if (scope === 'all') {
      const items = await Promise.all(
        available.map(({ libraryID }) => zotero.Items.getAll(libraryID, true, false)),
      );
      return items.flat().filter(ordinaryShape);
    }
    const separator = scope.indexOf('/');
    const base = separator === -1 ? scope : scope.slice(0, separator);
    const library = available.find((candidate) => scopeID(candidate) === base);
    if (!library) throw new Error('Library is no longer available');
    if (separator === -1)
      return (await zotero.Items.getAll(library.libraryID, true, false)).filter(ordinaryShape);
    const key = scope.slice(separator + 1);
    const collection = await zotero.Collections.getByLibraryAndKeyAsync(library.libraryID, key);
    if (!collection || collection.deleted) throw new Error('Collection is no longer available');
    await collection.loadDataType('childItems');
    return collection.getChildItems(false, false).filter(ordinaryShape);
  }

  async function load(scope: string): Promise<Catalog> {
    const available = libraries();
    const catalog = Promise.all(available.map(({ libraryID }) => zotero.Tags.getAll(libraryID)));
    const [candidates, libraryTags] = await Promise.all([itemsFor(scope, available), catalog]);
    const tags = new Set<string>();
    for (const list of libraryTags) for (const { tag } of list) tags.add(tag);
    if (!candidates.length) return { rows: [], tags };

    await zotero.Items.loadDataTypes(candidates, ['itemData', 'creators', 'tags', 'childItems']);
    const items = candidates.filter(ordinary);
    const attachmentIDs: number[] = [];
    for (const item of items) {
      for (const id of item.getAttachments(false)) attachmentIDs.push(id);
    }
    const pdfParents = new Set<number>();
    if (attachmentIDs.length) {
      for (const attachment of await zotero.Items.getAsync(attachmentIDs)) {
        if (!attachment.deleted && attachment.parentID && attachment.isPDFAttachment()) {
          pdfParents.add(attachment.parentID);
        }
      }
    }
    const rows: Row[] = [];
    for (const item of items) {
      rows.push({
        id: item.id,
        writable: writable(item),
        title: item.getField('title', false, true),
        creators: item
          .getCreators()
          .map(({ firstName, lastName, fieldMode }) =>
            fieldMode === 1 || !firstName ? lastName : `${firstName} ${lastName}`.trim(),
          )
          .filter(Boolean)
          .join('; '),
        year: item.getField('year').match(/^(?!0000)\d{4}\b/u)?.[0] ?? '',
        source:
          item.getField('publicationTitle', false, true) || item.getField('publisher', false, true),
        type: zotero.ItemTypes.getLocalizedString(item.itemTypeID),
        tags: item.getTags().map(({ tag }) => tag),
        pdf: pdfParents.has(item.id),
        added: item.dateAdded,
        extra: item.getField('extra'),
      });
    }
    return { rows, tags };
  }

  return {
    settings: config.settings,
    initialScope,
    scopes() {
      const scopes: Scope[] = [{ id: 'all', label: 'All libraries' }];
      for (const library of libraries()) {
        const root = scopeID(library);
        scopes.push({ id: root, label: library.name });
        const collections = zotero.Collections.getByLibrary(library.libraryID, true, false);
        const paths = new Map<number, string>();
        // getByLibrary(..., true) returns parents before their children.
        for (const collection of collections) {
          if (collection.deleted) continue;
          const parent = collection.parentID ? paths.get(collection.parentID) : undefined;
          const label = `${parent ?? library.name} / ${collection.name}`;
          paths.set(collection.id, label);
          scopes.push({ id: `${root}/${collection.key}`, label });
        }
      }
      return scopes;
    },
    load,
    suggestPropertyKey,
    async change(change) {
      if (change.kind === 'views') {
        // Views have their own preference; a long schema cleanup must not delay their save.
        config.writeViews(change);
        return { changed: 0, skipped: 0 };
      }
      return enqueue(async () => {
        const result = { changed: 0, skipped: 0 };
        const { properties, edit } = changeSchema(config.readProperties(), change, validate);
        // Don't commit a definition if the affected libraries could not even be read.
        const items = edit ? await itemsFor('all', libraries()) : [];
        let batchLoaded = true;
        if (items.length) {
          try {
            await zotero.Items.loadDataTypes(items, ['itemData']);
          } catch {
            batchLoaded = false;
          }
        }
        config.writeSchema(properties);
        if (!edit) return result;
        for (const item of items) {
          if (!ordinaryShape(item)) continue;
          try {
            if (!batchLoaded) {
              // Isolate failed loads so one inaccessible item cannot stop the rest.
              await zotero.Items.loadDataTypes([item], ['itemData']);
            }
            if (!ordinary(item)) continue;
            const extra = item.getField('extra');
            const updated = edit(extra);
            if (extra === updated) continue;
            if (!writable(item)) {
              result.skipped++;
              continue;
            }
            item.setField('extra', updated);
            await item.saveTx();
            result.changed++;
          } catch {
            // Native saveTx rolls back and restores the cached item after a failure.
            result.skipped++;
          }
        }
        return result;
      });
    },
    setProperty(id, key, value) {
      return enqueue(async () => {
        const property = config.readProperties().find((property) => property.key === key);
        if (!property) throw new Error('Property is no longer available');
        const item = await requireItem(id);
        if (!ordinary(item) || !writable(item)) throw new Error('Item is read-only');
        const before = item.getField('extra');
        const stored = readProperty(before, property);
        checkOptions(property, value, Array.isArray(stored) ? stored : [stored]);
        const after = writeProperty(before, property, value);
        if (before === after) return;
        item.setField('extra', after);
        await item.saveTx();
      });
    },
    changeTag(id, tag, add) {
      return enqueue(async () => {
        const name = tagName(tag, add);
        const item = await requireItem(id);
        await zotero.Items.loadDataTypes([item], ['tags']);
        if (!ordinary(item) || !writable(item)) throw new Error('Item is read-only');
        if (!applyTag(item, name, add)) return;
        await item.saveTx();
      });
    },
    bulk(ids, change) {
      return enqueue(async () => {
        const result = { changed: 0, skipped: 0, readOnly: 0 };
        const property =
          change.kind === 'property'
            ? config.readProperties().find((candidate) => candidate.key === change.key)
            : undefined;
        if (change.kind === 'property') {
          if (!property) throw new Error('Property is no longer available');
          writeProperty('', property, change.value);
          checkOptions(property, change.value);
        }
        const name = change.kind === 'tag' ? tagName(change.tag, change.add) : undefined;
        const notifications = new Set<() => void>();
        batchNotifications.set(zotero, notifications);
        try {
          for (const id of new Set(ids)) {
            try {
              const item = await requireItem(id);
              if (change.kind === 'tag') await zotero.Items.loadDataTypes([item], ['tags']);
              if (!ordinary(item) || !accessible(zotero.Libraries.get(item.libraryID))) {
                result.skipped++;
                continue;
              }
              const before = change.kind === 'property' ? item.getField('extra') : '';
              const after =
                change.kind === 'property' ? writeProperty(before, property!, change.value) : '';
              const needsChange =
                change.kind === 'property'
                  ? before !== after
                  : item.getTags().some(({ tag }) => tag === name) !== change.add;
              if (!needsChange) continue;
              if (!writable(item)) {
                result.readOnly++;
                result.skipped++;
                continue;
              }
              if (change.kind === 'property') item.setField('extra', after);
              else applyTag(item, name!, change.add);
              await item.saveTx();
              result.changed++;
            } catch {
              result.skipped++;
            }
          }
        } finally {
          batchNotifications.delete(zotero);
          for (const notify of notifications) notify();
        }
        return result;
      });
    },
    async openItem(id, pdf) {
      const item = await requireItem(id);
      if (pdf) {
        await zotero.Items.loadDataTypes([item], ['itemData', 'childItems']);
        const best = await item.getBestAttachment();
        const attachment =
          best && !best.deleted && best.isPDFAttachment()
            ? best
            : (await zotero.Items.getAsync(item.getAttachments(false))).find(
                (candidate) => !candidate.deleted && candidate.isPDFAttachment(),
              );
        if (attachment) {
          await pane.viewAttachment(attachment.id);
          return;
        }
      }
      await pane.selectItem(item.id);
    },
    subscribe(listener) {
      let active = true;
      const settings = () => {
        if (active) listener('settings');
      };
      const data = () => {
        if (active) listener('data');
      };
      const notifierID = zotero.Notifier.registerObserver(
        {
          notify() {
            const batch = batchNotifications.get(zotero);
            if (batch) batch.add(data);
            else data();
          },
        },
        ['item', 'tag', 'item-tag', 'collection', 'collection-item', 'group'],
        'zotero-bases',
      );
      const prefObservers: symbol[] = [];
      const detach = () => {
        if (!active) return;
        active = false;
        zotero.Notifier.unregisterObserver(notifierID);
        for (const id of prefObservers) prefs.unregisterObserver(id);
      };
      try {
        prefObservers.push(prefs.registerObserver(SCHEMA_PREF, settings, true));
        prefObservers.push(prefs.registerObserver(VIEWS_PREF, settings, true));
      } catch (error) {
        detach();
        throw error;
      }
      return detach;
    },
  };
}
