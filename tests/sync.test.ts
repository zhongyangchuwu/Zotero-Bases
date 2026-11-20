import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeSyncSnapshot } from '../src/config';
import { validateProperty } from '../src/extra';
import { createSyncController, DEFAULT_SYNC_TITLE } from '../src/sync';
import type { SyncLocation, SyncSnapshot, SyncTransport } from '../src/sync';

const DEBOUNCE = 120_000;

function snapshot(name: string): SyncSnapshot {
  return {
    schema: [{ key: 'Reading Stage', type: 'single-select', options: ['Unread', 'Done'] }],
    views: [
      {
        id: 'reading',
        name,
        scope: 'user',
        columns: ['title', 'property:Reading Stage'],
        sort: { column: 'title', direction: 'asc' },
        filters: [],
      },
    ],
  };
}

function revisionID(index: number): string {
  return index.toString(16).padStart(32, '0');
}

function deferred() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

function library() {
  const files: { id: string; text: string }[] = [];
  const observers = new Set<() => void>();
  const store = {
    files,
    waiting: false,
    reads: 0,
    refreshes: 0,
    refresh: async (): Promise<'refreshed' | 'unconfigured' | 'unavailable'> => 'refreshed',
    beforeRead: undefined as (() => Promise<void>) | undefined,
    beforeAppend: undefined as (() => Promise<void>) | undefined,
    location: undefined as SyncLocation | undefined,
    add(value: SyncSnapshot, parents: string[] = []) {
      const id = revisionID(++lastID);
      files.push({ id, text: JSON.stringify({ version: 1, id, parents, snapshot: value }) });
      return id;
    },
    changed() {
      for (const observer of observers) observer();
    },
  };
  let lastID = 0;
  const transport: SyncTransport = {
    async read() {
      store.reads++;
      await store.beforeRead?.();
      return { waiting: store.waiting, files: files.slice(), location: store.location };
    },
    newRevisionID: () => revisionID(++lastID),
    async append(id, text, location) {
      await store.beforeAppend?.();
      store.location = location;
      files.push({ id, text });
    },
    refresh() {
      store.refreshes++;
      return store.refresh();
    },
    observe(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
    async rename(location) {
      store.location = location;
      return location;
    },
    locations: () => [
      { key: '', name: '' },
      { key: 'READING', name: 'Reading' },
    ],
  };
  return { store, transport };
}

const running = new Set<{ stop(): void }>();

function profile(transport: SyncTransport, initial: SyncSnapshot) {
  const prefs = new Map<string, string>();
  const observers = new Set<() => void>();
  const applied: SyncSnapshot[] = [];
  const state = {
    value: initial,
    active: 'device-only',
    update(value: SyncSnapshot) {
      state.value = value;
      for (const observer of observers) observer();
    },
  };
  return {
    state,
    prefs,
    applied,
    start() {
      const controller = createSyncController({
        readSnapshot: () => ({ ...state.value, active: state.active }),
        decodeSnapshot: (value) => decodeSyncSnapshot(value, validateProperty),
        applySnapshot(value) {
          applied.push(value);
          state.update(value);
        },
        prefs: {
          get: (name) => prefs.get(name),
          set: (name, value) => void prefs.set(name, value),
        },
        transport,
        subscribeSettings(observer) {
          observers.add(observer);
          return () => observers.delete(observer);
        },
        setTimer(fn, delay) {
          const timer = setTimeout(fn, delay);
          return () => clearTimeout(timer);
        },
      });
      running.add(controller);
      return controller;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const controller of running) controller.stop();
  running.clear();
  vi.useRealTimers();
});

describe('private Bases sync', () => {
  it('is off until enabled, stages offline and debounces portable edits only', async () => {
    const { store, transport } = library();
    store.refresh = async () => 'unconfigured';
    const owner = profile(transport, snapshot('Inbox'));
    const sync = owner.start();
    expect(sync.status()).toMatchObject({ kind: 'off', location: { title: DEFAULT_SYNC_TITLE } });
    await sync.syncNow();
    expect(store.reads).toBe(0);
    expect(owner.prefs.size).toBe(0);

    await sync.enable();
    expect(sync.status()).toMatchObject({ kind: 'ready', busy: false });
    expect(store.files).toHaveLength(1);
    expect(JSON.parse(store.files[0]!.text)).toMatchObject({
      version: 1,
      parents: [],
      snapshot: snapshot('Inbox'),
    });
    expect(store.files[0]!.text).not.toContain('device-only');

    owner.state.active = 'another-local-view';
    owner.state.update(owner.state.value);
    expect(sync.status().kind).toBe('ready');
    owner.state.update(snapshot('Draft'));
    expect(sync.status().kind).toBe('pending');
    const refreshes = store.refreshes;
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1);
    owner.state.update(snapshot('Finished'));
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1);
    expect(store.files).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.files).toHaveLength(2);
    expect(JSON.parse(store.files[1]!.text)).toMatchObject({
      parents: [store.files[0]!.id],
      snapshot: snapshot('Finished'),
    });
    expect(store.refreshes).toBe(refreshes + 1);
    expect(sync.status().kind).toBe('ready');
  });

  it('needs an explicit cloud pull, persists the rollback and restores it without hidden local loss', async () => {
    const { store, transport } = library();
    const owner = profile(transport, snapshot('On this device'));
    const sync = owner.start();
    await sync.enable();
    const cloud = snapshot('On other device');
    const remote = store.add(cloud, [store.files[0]!.id]);
    store.changed();
    await vi.advanceTimersByTimeAsync(500);
    expect(sync.status().kind).toBe('attention');
    expect(owner.applied).toEqual([]);
    expect(store.files).toHaveLength(2);

    await sync.resolve('cloud');
    expect(owner.state.value).toEqual(cloud);
    expect(owner.state.active).toBe('device-only');
    expect(sync.status()).toMatchObject({ kind: 'ready', canRestore: true });
    expect(store.files).toHaveLength(2);
    sync.stop();

    const restarted = owner.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(restarted.status()).toMatchObject({ kind: 'ready', canRestore: true });
    await restarted.restore();
    expect(owner.state.value).toEqual(snapshot('On this device'));
    expect(restarted.status()).toMatchObject({ kind: 'pending', canRestore: false });
    await restarted.syncNow();
    expect(JSON.parse(store.files[2]!.text)).toMatchObject({
      parents: [remote],
      snapshot: snapshot('On this device'),
    });
  });

  it('keeps local only on request and parents its new revision to all concurrent carrier roots', async () => {
    const { store, transport } = library();
    const left = store.add(snapshot('Left'));
    const right = store.add(snapshot('Right'));
    const owner = profile(transport, snapshot('From me'));
    const sync = owner.start();
    await sync.enable();
    expect(sync.status().kind).toBe('attention');
    expect(owner.state.value).toEqual(snapshot('From me'));
    expect(store.files).toHaveLength(2);
    const refreshes = store.refreshes;

    await sync.resolve('local');
    expect(store.refreshes).toBe(refreshes + 1);
    expect(sync.status()).toMatchObject({ kind: 'ready', canRestore: false });
    expect(owner.applied).toEqual([]);
    expect(JSON.parse(store.files[2]!.text)).toMatchObject({
      parents: [left, right],
      snapshot: snapshot('From me'),
    });
  });

  it('does not duplicate equal revisions and resolves divergent cloud leaves deterministically', async () => {
    const { store, transport } = library();
    const first = store.add(snapshot('Same'));
    const same = snapshot('Same');
    const second = store.add({ views: same.views, schema: same.schema });
    const owner = profile(transport, same);
    const sync = owner.start();
    await sync.enable();
    expect(sync.status().kind).toBe('ready');
    expect(store.files).toHaveLength(2);

    const branched = store.add(snapshot('Diverged'), [second]);
    const another = store.add(snapshot('Also diverged'), [first]);
    await sync.syncNow();
    expect(sync.status().kind).toBe('attention');
    await sync.resolve('cloud');
    expect(owner.state.value).toEqual(snapshot('Diverged'));
    expect(JSON.parse(store.files[4]!.text)).toMatchObject({ parents: [branched, another] });
    expect(sync.status()).toMatchObject({ kind: 'ready', canRestore: true });
  });

  it('waits for known files and missing ancestors and rejects invalid remote settings', async () => {
    const { store, transport } = library();
    const owner = profile(transport, snapshot('Local'));
    const sync = owner.start();
    await sync.enable();
    owner.state.update(snapshot('Local edit'));
    store.waiting = true;
    await sync.syncNow();
    expect(sync.status().kind).toBe('waiting');
    expect(store.files).toHaveLength(1);

    store.waiting = false;
    const earlier = revisionID(30);
    const latest = store.add(snapshot('New cloud'), [earlier]);
    await sync.syncNow();
    expect(sync.status().kind).toBe('waiting');
    expect(store.files).toHaveLength(2);

    const malformed = {
      id: earlier,
      text: JSON.stringify({
        version: 1,
        id: earlier,
        parents: [],
        snapshot: { schema: [], views: [] },
      }),
    };
    store.files.push(malformed);
    await sync.syncNow();
    expect(sync.status().kind).toBe('error');
    expect(owner.applied).toEqual([]);
    expect(store.files).toHaveLength(3);

    malformed.text = JSON.stringify({
      version: 1,
      id: earlier,
      parents: [store.files[0]!.id],
      snapshot: snapshot('Older cloud'),
    });
    await sync.syncNow();
    expect(sync.status().kind).toBe('attention');
    expect(store.files.map(({ id }) => id)).toEqual([revisionID(1), latest, earlier]);
    expect(owner.state.value).toEqual(snapshot('Local edit'));
  });

  it('notices remote revisions without a native notification', async () => {
    const { store, transport } = library();
    const owner = profile(transport, snapshot('Local'));
    const sync = owner.start();
    await sync.enable();
    store.add(snapshot('Cloud'), [store.files[0]!.id]);
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 500);
    expect(sync.status().kind).toBe('attention');
    expect(owner.applied).toEqual([]);
  });

  it('rereads after a native upload and shows a branch that arrived during that refresh', async () => {
    const { store, transport } = library();
    const owner = profile(transport, snapshot('Original'));
    const sync = owner.start();
    await sync.enable();
    store.refresh = async () => {
      if (store.files.length === 2) store.add(snapshot('Concurrent edit'), [store.files[0]!.id]);
      return 'refreshed';
    };
    owner.state.update(snapshot('Local edit'));
    await sync.syncNow();
    expect(store.files).toHaveLength(3);
    expect(sync.status().kind).toBe('attention');
    expect(owner.applied).toEqual([]);
  });

  it('does not apply a cloud choice on top of a local edit made during the recheck', async () => {
    const { store, transport } = library();
    store.add(snapshot('Cloud'));
    const owner = profile(transport, snapshot('Local'));
    const sync = owner.start();
    await sync.enable();
    const entered = deferred();
    const unblock = deferred();
    store.beforeRead = async () => {
      entered.release();
      await unblock.wait;
    };
    const resolution = sync.resolve('cloud');
    await entered.wait;
    expect(sync.status().busy).toBe(true);
    owner.state.update(snapshot('New local edit'));
    unblock.release();
    await resolution;
    expect(sync.status()).toMatchObject({ kind: 'attention', busy: false, canRestore: false });
    expect(owner.state.value).toEqual(snapshot('New local edit'));
    expect(owner.applied).toEqual([]);
  });

  it('retains the newest local edit if an earlier snapshot is in flight', async () => {
    const { store, transport } = library();
    const owner = profile(transport, snapshot('Original'));
    const sync = owner.start();
    await sync.enable();
    const entered = deferred();
    const unblock = deferred();
    store.beforeAppend = async () => {
      entered.release();
      await unblock.wait;
    };
    owner.state.update(snapshot('Sent first'));
    const upload = sync.syncNow();
    await entered.wait;
    owner.state.update(snapshot('Edited during send'));
    unblock.release();
    await upload;
    expect(sync.status().kind).toBe('pending');
    expect(JSON.parse(store.files[1]!.text).snapshot).toEqual(snapshot('Sent first'));
    expect(owner.applied).toEqual([]);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(JSON.parse(store.files[2]!.text)).toMatchObject({
      parents: [store.files[1]!.id],
      snapshot: snapshot('Edited during send'),
    });
    expect(sync.status().kind).toBe('ready');
  });

  it('retains its baseline across restart and does not recreate a deleted or not-yet-present carrier', async () => {
    const { store, transport } = library();
    const owner = profile(transport, snapshot('Original'));
    const sync = owner.start();
    await sync.enable();
    sync.stop();
    const reads = store.reads;
    owner.state.update(snapshot('Saved while stopped'));
    store.changed();
    await vi.advanceTimersByTimeAsync(DEBOUNCE * 2);
    expect(store.reads).toBe(reads);

    const restarted = owner.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(restarted.status().kind).toBe('pending');
    await restarted.syncNow();
    expect(store.files).toHaveLength(2);
    store.files.length = 0;
    await restarted.syncNow();
    expect(restarted.status().kind).toBe('waiting');
    expect(store.files).toHaveLength(0);
  });

  it('does not create a replacement when configured native refresh fails before first discovery', async () => {
    const { store, transport } = library();
    store.refresh = async () => 'unavailable';
    const owner = profile(transport, snapshot('Local'));
    const sync = owner.start();
    await sync.enable();
    expect(sync.status().kind).toBe('waiting');
    expect(store.files).toHaveLength(0);
    store.refresh = async () => {
      store.add(snapshot('Cloud'));
      return 'refreshed';
    };
    await sync.syncNow();
    expect(sync.status().kind).toBe('attention');
    expect(store.files).toHaveLength(1);
  });

  it('uses the chosen carrier location and exposes native collection choices', async () => {
    const { store, transport } = library();
    const owner = profile(transport, snapshot('Orig'));
    const sync = owner.start();
    const location = { title: 'Bases settings', collection: 'READING' };
    expect(sync.locations()).toContainEqual({ key: 'READING', name: 'Reading' });
    await sync.rename(location);
    await sync.enable();
    expect(sync.status().location).toEqual(location);
    expect(store.location).toEqual(location);
    expect(store.files).toHaveLength(1);
  });
});
