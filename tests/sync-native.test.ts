import { describe, expect, it, vi } from 'vitest';
import { BASES_SYNC_MARKER } from '../src/sync-marker';
import { createNativeSyncTransport } from '../src/sync-native';
import type { NativeSyncIO, NativeSyncZotero } from '../src/sync-native';
import { DEFAULT_SYNC_TITLE } from '../src/sync';

const ID = '12'.repeat(16);
const FILENAME = `zotero-bases-sync-${ID}.json`;
const COLLECTION = { id: 7, key: 'READING0', name: 'Reading' };

function native() {
  const items = new Map<number, Item>();
  const bytes = new Map<string, Uint8Array>();
  let next = 0;
  class Item {
    readonly id = ++next;
    readonly key = String(this.id).padStart(8, '0');
    libraryID = 1;
    deleted = false;
    parentID: number | false = false;
    attachmentContentType = '';
    attachmentPath = '';
    attachmentFilename?: string;
    collectionIDs: number[] = [];
    fields = new Map<string, string>();
    isEditable() {
      return true;
    }
    isRegularItem() {
      return !this.parentID;
    }
    isStoredFileAttachment() {
      return !!this.parentID;
    }
    getField(field: string) {
      return this.fields.get(field) ?? '';
    }
    setField(field: string, value: string) {
      this.fields.set(field, value);
    }
    getAttachments() {
      return [...items.values()].filter((item) => item.parentID === this.id).map(({ id }) => id);
    }
    getNotes() {
      return [];
    }
    getCollections() {
      return this.collectionIDs;
    }
    setCollections(ids: number[]) {
      this.collectionIDs = ids;
    }
    async getFilePathAsync() {
      const path = this.storagePath;
      return bytes.has(path) ? path : (false as const);
    }
    get storagePath() {
      return `/storage/${this.key}/${this.attachmentFilename}`;
    }
    async saveTx() {
      items.set(this.id, this);
    }
    async eraseTx() {
      items.delete(this.id);
    }
  }
  const settings = { id: null as number | null, storage: false, onDemand: false };
  const sync = vi.fn<NativeSyncZotero['Sync']['Runner']['sync']>(async () => {});
  const download = vi.fn<NativeSyncZotero['Sync']['Runner']['downloadFile']>(async () => {});
  let notice: Parameters<NativeSyncZotero['Notifier']['registerObserver']>[0] | undefined;
  const runner = { enabled: false, syncInProgress: false, sync, downloadFile: download };
  const zotero: NativeSyncZotero = {
    Libraries: { userLibraryID: 1, userLibrary: { filesEditable: true, name: 'My Library' } },
    Users: { getCurrentUserID: () => settings.id },
    Collections: { getByLibrary: () => [COLLECTION] },
    Item,
    Items: {
      getAsync: async (ids) => ids.flatMap((id) => items.get(id) ?? []),
      loadDataTypes: async () => {},
    },
    Search: class {
      libraryID = -1;
      extra = '';
      addCondition(_field: string, _op: string, value: string) {
        this.extra = value;
      }
      async search() {
        return [...items.values()]
          .filter(
            (item) =>
              item.libraryID === this.libraryID && item.getField('extra').includes(this.extra),
          )
          .map(({ id }) => id);
      }
    },
    Attachments: {
      async importFromFile({ file, parentItemID, contentType, title }) {
        const child = new Item();
        child.parentID = parentItemID;
        child.attachmentFilename = file.split('/').at(-1)!;
        child.attachmentPath = `storage:${child.attachmentFilename}`;
        child.attachmentContentType = contentType;
        child.setField('title', title);
        const data = bytes.get(file);
        if (!data) throw new Error('The source file did not exist');
        bytes.set(child.storagePath, data);
        await child.saveTx();
      },
    },
    Sync: {
      Runner: runner,
      Storage: {
        Local: {
          getEnabledForLibrary: () => settings.storage,
          downloadAsNeeded: () => settings.onDemand,
        },
      },
    },
    Notifier: {
      registerObserver(observer) {
        notice = observer;
        return 'observer';
      },
      unregisterObserver() {
        notice = undefined;
      },
    },
    getTempDirectory: () => ({ path: '/tmp' }),
    logError: vi.fn(),
  };
  const read = vi.fn<NativeSyncIO['read']>(async (path, { maxBytes }) => {
    const data = bytes.get(path);
    if (!data) throw new DOMException('File does not exist', 'NotFoundError');
    return data.subarray(0, maxBytes);
  });
  const io: NativeSyncIO = {
    read,
    async writeUTF8(path, text) {
      const data = new TextEncoder().encode(text);
      bytes.set(path, data);
      return data.byteLength;
    },
    makeDirectory: async () => {},
    async remove(directory) {
      for (const path of bytes.keys()) {
        if (path.startsWith(`${directory}/`)) bytes.delete(path);
      }
    },
  };
  return {
    Item,
    items,
    bytes,
    read,
    sync,
    download,
    settings,
    runner,
    emit: (event: string, type: string, ids: number[]) => notice?.notify(event, type, ids),
    transport: createNativeSyncTransport(zotero, io, { join: (...parts) => parts.join('/') }),
  };
}

describe('Zotero native Bases storage', () => {
  it('lists the native personal-library root and collections', () => {
    const { transport } = native();
    expect(transport.locations()).toEqual([
      { key: '', name: 'My Library' },
      { key: COLLECTION.key, name: COLLECTION.name },
    ]);
  });

  it('uses the marker in the personal library and preserves other existing items and files', async () => {
    const { Item, transport, items, bytes, read } = native();
    const ordinary = new Item();
    ordinary.setField('title', DEFAULT_SYNC_TITLE);
    ordinary.setField('extra', `Not the marker: ${BASES_SYNC_MARKER}`);
    await ordinary.saveTx();
    const otherLibrary = new Item();
    otherLibrary.libraryID = 2;
    otherLibrary.setField('extra', BASES_SYNC_MARKER);
    await otherLibrary.saveTx();

    await transport.append(ID, '{"test":true}', { title: DEFAULT_SYNC_TITLE });
    const carrier = [...items.values()].find(
      (item) => item.id > otherLibrary.id && !item.parentID,
    )!;
    expect(carrier.libraryID).toBe(1);
    expect(carrier.getField('extra')).toBe(BASES_SYNC_MARKER);
    const own = items.get(carrier.getAttachments()[0]!)!;
    expect(own.attachmentFilename).toBe(FILENAME);
    expect(own.attachmentContentType).toBe('application/json');
    expect([...bytes.keys()]).toEqual([own.storagePath]);

    const foreign = new Item();
    foreign.parentID = carrier.id;
    foreign.attachmentFilename = 'notes.json';
    foreign.attachmentPath = 'storage:notes.json';
    foreign.attachmentContentType = 'application/json';
    bytes.set(foreign.storagePath, new Uint8Array([1]));
    await foreign.saveTx();
    await transport.rename({ title: 'Config', collection: COLLECTION.key });
    expect(await transport.read()).toEqual({
      location: { title: 'Config', collection: COLLECTION.key },
      waiting: false,
      files: [{ id: ID, text: '{"test":true}' }],
    });
    expect(read.mock.calls.map(([path]) => path)).toEqual([own.storagePath]);
    expect(carrier.getAttachments()).toEqual([own.id, foreign.id]);
    expect(ordinary.getField('title')).toBe(DEFAULT_SYNC_TITLE);
    expect(bytes.has(foreign.storagePath)).toBe(true);
  });

  it('requests native transfer only when configured and treats on-demand files as pending', async () => {
    const { transport, items, bytes, sync, download, runner, settings } = native();
    expect(await transport.refresh()).toBe('unconfigured');
    runner.enabled = true;
    expect(await transport.refresh()).toBe('unavailable');
    expect(sync).not.toHaveBeenCalled();
    Object.assign(settings, { id: 100, storage: true, onDemand: true });
    expect(await transport.refresh()).toBe('refreshed');
    expect(sync).toHaveBeenCalledWith({
      background: true,
      libraries: [1],
      onError: expect.any(Function),
    });

    await transport.append(ID, '{}', { title: DEFAULT_SYNC_TITLE });
    const file = [...items.values()].find((item) => item.parentID)!;
    const original = bytes.get(file.storagePath)!;
    bytes.delete(file.storagePath);
    expect(await transport.read()).toMatchObject({ waiting: true, files: [] });
    expect(download).toHaveBeenCalledWith(file);
    bytes.set(file.storagePath, original);
    expect(await transport.read()).toMatchObject({
      waiting: false,
      files: [{ id: ID, text: '{}' }],
    });
    file.attachmentPath = 'storage:../unsafe.json';
    await expect(transport.read()).rejects.toThrow('Invalid Zotero Bases revision filename');
  });

  it('ignores unrelated item events and notices relevant item, file, and sync changes', async () => {
    const { transport, items, emit } = native();
    await transport.append(ID, '{}', { title: DEFAULT_SYNC_TITLE });
    await transport.read();
    const changed = vi.fn();
    const stop = transport.observe(changed);
    const file = [...items.values()].find((item) => item.parentID)!;
    emit('modify', 'item', [999]);
    emit('pageChange', 'file', [file.id]);
    emit('start', 'sync', []);
    expect(changed).not.toHaveBeenCalled();
    emit('modify', 'item', [file.id]);
    emit('download', 'file', [file.id]);
    emit('finish', 'sync', []);
    expect(changed).toHaveBeenCalledTimes(3);
    stop();
    emit('finish', 'sync', []);
    expect(changed).toHaveBeenCalledTimes(3);
  });
});
