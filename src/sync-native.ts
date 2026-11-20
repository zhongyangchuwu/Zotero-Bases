import { BASES_SYNC_MARKER, isBasesSyncCarrier } from './sync-marker';
import { DEFAULT_SYNC_TITLE, SYNC_REVISION_ID } from './sync';
import type { SyncLocation, SyncTransport } from './sync';

const FILE_PATTERN = /^zotero-bases-sync-([0-9a-f]{32})\.json$/u;
const JSON_TYPE = 'application/json';
const MAX_BYTES = 1024 * 1024;
const TEMP_PREFIX = 'zotero-bases-sync-';

interface CarrierItem {
  readonly id: number;
  readonly key: string;
  libraryID: number;
  readonly deleted: boolean;
  readonly parentID: number | false | null;
  readonly attachmentContentType: string;
  readonly attachmentPath: string;
  readonly attachmentFilename?: string;
  isEditable(): boolean;
  isRegularItem(): boolean;
  isStoredFileAttachment(): boolean;
  getField(field: string): string;
  setField(field: 'title' | 'extra', value: string): void;
  getAttachments(includeTrashed: false): readonly number[];
  getNotes(includeTrashed: false): readonly number[];
  getCollections(includeTrashed: false): readonly number[];
  setCollections(ids: number[]): void;
  getFilePathAsync(): Promise<string | false>;
  saveTx(): Promise<unknown>;
  eraseTx(): Promise<unknown>;
}

interface Collection {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export interface NativeSyncZotero {
  readonly Libraries: {
    readonly userLibraryID: number;
    readonly userLibrary: { readonly filesEditable: boolean; readonly name: string };
  };
  readonly Users: { getCurrentUserID(): number | null };
  readonly Collections: {
    getByLibrary(id: number, recursive: true, includeTrashed: false): readonly Collection[];
  };
  readonly Item: new (type: 'document') => CarrierItem;
  readonly Items: {
    getAsync(ids: readonly number[]): Promise<CarrierItem[]>;
    loadDataTypes(
      items: readonly CarrierItem[],
      types: readonly ('itemData' | 'childItems' | 'collections')[],
    ): Promise<void>;
  };
  readonly Search: new () => {
    libraryID: number;
    addCondition(field: 'extra', op: 'contains', value: string): unknown;
    search(): Promise<number[]>;
  };
  readonly Attachments: {
    importFromFile(options: {
      file: string;
      parentItemID: number;
      title: string;
      contentType: string;
    }): Promise<unknown>;
  };
  readonly Sync: {
    readonly Runner: {
      readonly enabled: boolean;
      readonly syncInProgress: boolean;
      sync(options: {
        background: true;
        libraries: number[];
        onError(error: unknown): void;
      }): Promise<unknown>;
      downloadFile(item: CarrierItem): Promise<unknown>;
    };
    readonly Storage: {
      readonly Local: {
        getEnabledForLibrary(id: number): boolean;
        downloadAsNeeded(id: number): boolean;
      };
    };
  };
  readonly Notifier: {
    registerObserver(
      observer: { notify(event: string, type: string, ids: readonly (string | number)[]): void },
      types: string[],
      name: string,
    ): string;
    unregisterObserver(id: string): void;
  };
  getTempDirectory(): { readonly path: string };
  logError(error: unknown): void;
}

export interface NativeSyncIO {
  read(path: string, options: { maxBytes: number }): Promise<Uint8Array>;
  writeUTF8(path: string, text: string): Promise<number>;
  makeDirectory(path: string, options: { ignoreExisting: false }): Promise<void>;
  remove(path: string, options: { recursive: true; ignoreAbsent: true }): Promise<void>;
}

export interface NativeSyncPaths {
  join(...components: string[]): string;
}

export function createNativeSyncTransport(
  zotero: NativeSyncZotero,
  io: NativeSyncIO,
  paths: NativeSyncPaths,
): SyncTransport {
  const userLibraryID = () => zotero.Libraries.userLibraryID;
  const collections = () => zotero.Collections.getByLibrary(userLibraryID(), true, false);
  const runner = () => zotero.Sync.Runner;
  const storage = () => zotero.Sync.Storage.Local;
  const storageEnabled = () => runner().enabled && storage().getEnabledForLibrary(userLibraryID());
  let observed = new Set<number>();

  async function carriers(): Promise<CarrierItem[]> {
    // Search is scoped to My Library and executed in the Zotero DB. Extra text
    // may contain a substring match, but only the exact marker claims an item.
    const search = new zotero.Search();
    const libraryID = userLibraryID();
    search.libraryID = libraryID;
    search.addCondition('extra', 'contains', BASES_SYNC_MARKER);
    const ids = await search.search();
    if (!ids.length) return [];
    const items = await zotero.Items.getAsync(ids);
    await zotero.Items.loadDataTypes(items, ['itemData']);
    const marked = items.filter(
      (item) =>
        item.libraryID === libraryID &&
        !item.deleted &&
        !item.parentID &&
        item.isRegularItem() &&
        isBasesSyncCarrier(item.getField('extra')),
    );
    await zotero.Items.loadDataTypes(marked, ['childItems', 'collections']);
    return marked.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  function currentLocation(carrier: CarrierItem): SyncLocation {
    const membership = carrier.getCollections(false);
    return {
      title: carrier.getField('title') || DEFAULT_SYNC_TITLE,
      collection: membership.length
        ? collections().find(({ id }) => membership.includes(id))?.key
        : undefined,
    };
  }

  function destination(location: SyncLocation): { title: string; collection?: Collection } {
    const title = location.title.trim();
    if (!title) throw new Error('The Bases sync item needs a title');
    if (!location.collection) return { title };
    const collection = collections().find(({ key }) => key === location.collection);
    if (!collection) throw new Error('The selected Bases sync collection is unavailable');
    return { title, collection };
  }

  async function filePath(item: CarrierItem): Promise<string | false> {
    const path = await item.getFilePathAsync();
    if (path || !storageEnabled() || !storage().downloadAsNeeded(userLibraryID())) return path;
    try {
      await runner().downloadFile(item);
    } catch (error) {
      // Native storage may be offline, over quota or still transferring. Leave
      // the known revision pending rather than interpreting it as absent.
      zotero.logError(error);
    }
    return item.getFilePathAsync();
  }

  return {
    newRevisionID: () => crypto.randomUUID().replaceAll('-', ''),
    async read() {
      const roots = await carriers();
      const location = roots[0] && currentLocation(roots[0]);
      const files: { id: string; text: string }[] = [];
      const nextObserved = new Set<number>(roots.map(({ id }) => id));
      if (runner().syncInProgress) return { location, files, waiting: true };
      let waiting = false;
      for (const root of roots) {
        const ids = root.getAttachments(false);
        const attachments = ids.length ? await zotero.Items.getAsync(ids) : [];
        if (attachments.length) await zotero.Items.loadDataTypes(attachments, ['itemData']);
        let recognized = false;
        for (const item of attachments) {
          if (item.deleted || item.libraryID !== userLibraryID() || item.parentID !== root.id) {
            continue;
          }
          const title = FILE_PATTERN.exec(item.getField('title'));
          const filename = FILE_PATTERN.exec(item.attachmentFilename ?? '');
          const id = (title ?? filename)?.[1];
          if (!id) continue;
          recognized = true;
          nextObserved.add(item.id);
          if (
            !item.isStoredFileAttachment() ||
            (title && filename && title[1] !== filename[1]) ||
            (item.attachmentContentType && item.attachmentContentType !== JSON_TYPE)
          ) {
            throw new Error('Invalid Zotero Bases revision attachment');
          }
          if (!item.attachmentPath || !item.attachmentContentType) {
            waiting = true;
            continue;
          }
          if (!filename || item.attachmentPath !== `storage:${filename[0]}`) {
            throw new Error('Invalid Zotero Bases revision filename');
          }
          const path = await filePath(item);
          if (!path) {
            waiting = true;
            continue;
          }
          try {
            const bytes = await io.read(path, { maxBytes: MAX_BYTES + 1 });
            if (bytes.byteLength > MAX_BYTES) throw new Error('Bases sync revision exceeds 1 MiB');
            files.push({ id, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) });
          } catch (error) {
            if (
              typeof error !== 'object' ||
              error === null ||
              !('name' in error) ||
              error.name !== 'NotFoundError'
            ) {
              throw error;
            }
            waiting = true;
          }
        }
        // Metadata for the parent can arrive before its attachment items.
        if (!recognized) waiting = true;
      }
      observed = nextObserved;
      return { location, files, waiting };
    },
    async append(id, text, location) {
      if (!SYNC_REVISION_ID.test(id)) throw new Error('Invalid local Bases sync revision ID');
      if (new TextEncoder().encode(text).byteLength > MAX_BYTES) {
        throw new Error('Bases sync revision exceeds 1 MiB');
      }
      if (!zotero.Libraries.userLibrary.filesEditable) {
        throw new Error('Zotero personal library files are not editable');
      }
      const [existing] = await carriers();
      if (existing && !existing.isEditable())
        throw new Error('Zotero Bases sync item is read-only');
      const filename = `${TEMP_PREFIX}${id}.json`;
      const directory = paths.join(zotero.getTempDirectory().path, `${TEMP_PREFIX}${id}`);
      const file = paths.join(directory, filename);
      await io.makeDirectory(directory, { ignoreExisting: false });
      try {
        await io.writeUTF8(file, text);
        const root = existing ?? new zotero.Item('document');
        if (!existing) {
          const target = destination(location);
          root.libraryID = userLibraryID();
          root.setField('title', target.title);
          root.setField('extra', BASES_SYNC_MARKER);
          if (target.collection) root.setCollections([target.collection.id]);
          await root.saveTx();
        }
        try {
          await zotero.Attachments.importFromFile({
            file,
            parentItemID: root.id,
            title: filename,
            contentType: JSON_TYPE,
          });
        } catch (error) {
          if (!existing) {
            try {
              await zotero.Items.loadDataTypes([root], ['childItems']);
              if (!root.getAttachments(false).length && !root.getNotes(false).length) {
                await root.eraseTx();
              }
            } catch (cleanup) {
              zotero.logError(cleanup);
            }
          }
          throw error;
        }
      } finally {
        try {
          await io.remove(directory, { recursive: true, ignoreAbsent: true });
        } catch (error) {
          zotero.logError(error);
        }
      }
    },
    async refresh() {
      if (!runner().enabled) return 'unconfigured';
      // Zotero may show its first-account confirmation even in a background
      // sync. Let Zotero's own setup complete before refreshing automatically.
      if (!zotero.Users.getCurrentUserID() || runner().syncInProgress) return 'unavailable';
      if (!storage().getEnabledForLibrary(userLibraryID())) return 'unconfigured';
      let failed = false;
      const result = await runner().sync({
        background: true,
        libraries: [userLibraryID()],
        onError(error) {
          failed = true;
          zotero.logError(error);
        },
      });
      return result === false || failed ? 'unavailable' : 'refreshed';
    },
    observe(fn) {
      const id = zotero.Notifier.registerObserver(
        {
          notify(event, type, ids) {
            if (
              (type === 'sync' && event === 'finish') ||
              type === 'collection' ||
              ((type === 'item' || (type === 'file' && event !== 'pageChange')) &&
                ids.some((id) => observed.has(Number(id))))
            ) {
              fn();
            }
          },
        },
        ['item', 'file', 'sync', 'collection'],
        'zotero-bases-sync',
      );
      return () => zotero.Notifier.unregisterObserver(id);
    },
    async rename(location) {
      const { title, collection } = destination(location);
      const [root] = await carriers();
      if (root) {
        if (!root.isEditable()) throw new Error('Zotero Bases sync item is read-only');
        root.setField('title', title);
        if (currentLocation(root).collection !== collection?.key) {
          root.setCollections(collection ? [collection.id] : []);
        }
        await root.saveTx();
      }
      return { title, collection: collection?.key };
    },
    locations: () => [
      { key: '', name: zotero.Libraries.userLibrary.name },
      ...collections().map(({ key, name }) => ({ key, name })),
    ],
  };
}
