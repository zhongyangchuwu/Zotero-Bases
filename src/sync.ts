import type { Prefs } from './config';
import type { Property, View } from './contracts';

export interface SyncSnapshot {
  readonly schema: readonly Property[];
  readonly views: readonly View[];
}

export interface SyncLocation {
  readonly title: string;
  readonly collection?: string;
}

export interface SyncStatus {
  readonly kind: 'off' | 'ready' | 'pending' | 'attention' | 'waiting' | 'error';
  readonly location: SyncLocation;
  readonly canRestore: boolean;
  readonly busy: boolean;
}

export interface SyncPort {
  status(): SyncStatus;
  subscribe(fn: () => void): () => void;
  enable(): Promise<void>;
  syncNow(): Promise<void>;
  resolve(side: 'cloud' | 'local'): Promise<void>;
  restore(): Promise<void>;
  rename(location: SyncLocation): Promise<void>;
  locations(): readonly SyncCollection[];
}

interface SyncCollection {
  readonly key: string;
  readonly name: string;
}

interface SyncFile {
  readonly id: string;
  readonly text: string;
}

export interface SyncTransport {
  read(): Promise<{
    readonly location?: SyncLocation;
    readonly files: readonly SyncFile[];
    readonly waiting: boolean;
  }>;
  newRevisionID(): string;
  append(id: string, text: string, location: SyncLocation): Promise<void>;
  refresh(): Promise<'refreshed' | 'unconfigured' | 'unavailable'>;
  observe(fn: () => void): () => void;
  rename(location: SyncLocation): Promise<SyncLocation>;
  locations(): readonly SyncCollection[];
}

interface Options {
  readSnapshot(): SyncSnapshot;
  decodeSnapshot(value: unknown): SyncSnapshot | undefined;
  applySnapshot(value: SyncSnapshot): void;
  prefs: Pick<Prefs, 'get' | 'set'>;
  transport: SyncTransport;
  subscribeSettings(fn: () => void): () => void;
  setTimer(fn: () => void, delay: number): () => void;
  logError?(error: unknown): void;
}

export const DEFAULT_SYNC_TITLE = '[Zotero Bases] Sync — Do Not Delete';
export const SYNC_REVISION_ID = /^[0-9a-f]{32}$/u;
const STATE_PREF = 'extensions.zotero-bases.sync.v1';
const VERSION = 1;
const INTERVAL = 120_000;
const OBSERVE_DELAY = 400;

interface State {
  enabled: boolean;
  location?: SyncLocation;
  baseline?: SyncSnapshot;
  rollback?: SyncSnapshot;
}

interface Content {
  snapshot: SyncSnapshot;
  key: string;
}

interface Revision extends Content {
  id: string;
  parents: readonly string[];
}

type Stop = () => void;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function content(snapshot: SyncSnapshot): Content {
  const { schema, views } = snapshot;
  const portable = { schema, views };
  const key = JSON.stringify(portable, (_name: string, value: unknown) =>
    object(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
  return { snapshot: portable, key };
}

function readState({ prefs, decodeSnapshot, logError }: Options): State {
  const raw = prefs.get(STATE_PREF, true);
  if (typeof raw !== 'string') return { enabled: false };
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== VERSION || typeof value.enabled !== 'boolean') {
      throw new Error('Invalid Bases sync preference');
    }
    const { location, baseline, rollback, enabled } = value;
    let savedLocation: SyncLocation | undefined;
    if (location !== undefined) {
      if (
        !object(location) ||
        typeof location.title !== 'string' ||
        !location.title.trim() ||
        (location.collection !== undefined && typeof location.collection !== 'string')
      ) {
        throw new Error('Invalid Bases sync location');
      }
      savedLocation = { title: location.title, collection: location.collection };
    }
    const saved = baseline === undefined ? undefined : decodeSnapshot(baseline);
    const backup = rollback === undefined ? undefined : decodeSnapshot(rollback);
    if ((baseline !== undefined && !saved) || (rollback !== undefined && !backup)) {
      throw new Error('Invalid Bases sync backup or baseline');
    }
    return {
      enabled,
      location: savedLocation,
      baseline: saved,
      rollback: backup,
    };
  } catch (error) {
    logError?.(error);
    return { enabled: false };
  }
}

function decodeHeads(
  files: readonly SyncFile[],
  decodeSnapshot: Options['decodeSnapshot'],
): Revision[] | 'missing-parent' {
  const revisions = new Map<string, Revision>();
  for (const { id, text } of files) {
    const value: unknown = JSON.parse(text);
    if (
      !object(value) ||
      value.version !== VERSION ||
      value.id !== id ||
      !SYNC_REVISION_ID.test(id) ||
      !Array.isArray(value.parents) ||
      !value.parents.every((parent: unknown) => {
        return typeof parent === 'string' && SYNC_REVISION_ID.test(parent) && parent !== id;
      })
    ) {
      throw new Error('Invalid Bases sync revision');
    }
    const parents = [...new Set<string>(value.parents)].sort();
    if (parents.length !== value.parents.length) throw new Error('Duplicate Bases sync parent');
    const snapshot = decodeSnapshot(value.snapshot);
    if (!snapshot) throw new Error('Invalid Bases sync settings');
    const revision = { id, parents, ...content(snapshot) };
    const duplicate = revisions.get(id);
    if (
      duplicate &&
      (duplicate.key !== revision.key || duplicate.parents.join(',') !== parents.join(','))
    ) {
      throw new Error('Inconsistent copies of a Bases sync revision');
    }
    revisions.set(id, revision);
  }

  // Walk backwards from leaves, rejecting cycles and holding writes when any
  // parent is absent. Missing metadata is not a new cloud snapshot.
  const children = new Map<string, number>();
  let missingParent = false;
  for (const { parents } of revisions.values()) {
    for (const parent of parents) {
      if (revisions.has(parent)) children.set(parent, (children.get(parent) ?? 0) + 1);
      else missingParent = true;
    }
  }
  const heads = [...revisions.values()].filter(({ id }) => !children.has(id));
  const queue = heads.slice();
  for (let index = 0; index < queue.length; index++) {
    for (const parent of queue[index]!.parents) {
      if (!revisions.has(parent)) continue;
      const count = children.get(parent)! - 1;
      children.set(parent, count);
      if (count === 0) queue.push(revisions.get(parent)!);
    }
  }
  if (queue.length !== revisions.size) throw new Error('Cyclic Bases sync revisions');
  if (missingParent) return 'missing-parent';
  return heads.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function createSyncController(options: Options): SyncPort & { stop(): void } {
  const { prefs, transport, setTimer, logError } = options;
  let state = readState(options);
  let baseline = state.baseline && content(state.baseline).key;
  let kind: SyncStatus['kind'] = state.enabled ? 'waiting' : 'off';
  let location = state.location ?? { title: DEFAULT_SYNC_TITLE };
  let busy = false;
  let stopped = false;
  let reading = false;
  let applying = false;
  let localKey: string | undefined;
  let generation = 0;
  let conflict: string | undefined;
  let tail = Promise.resolve();
  let stopSettings: Stop | undefined;
  let stopObserving: Stop | undefined;
  let cancelProbe: Stop | undefined;
  let probeQueued = false;
  let cancelPoll: Stop | undefined;
  let cancelPush: Stop | undefined;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        logError?.(error);
      }
    }
  }

  function run(action: () => Promise<void>): Promise<void> {
    tail = tail.then(async () => {
      if (stopped) return;
      busy = true;
      notify();
      try {
        await action();
      } catch (error) {
        if (!stopped) {
          kind = 'error';
          conflict = undefined;
          logError?.(error);
        }
      } finally {
        busy = false;
        if (!stopped) notify();
      }
    });
    return tail;
  }

  function save(next: State): void {
    prefs.set(STATE_PREF, JSON.stringify({ version: VERSION, ...next }), true);
    state = next;
  }

  function local(): Content {
    reading = true;
    try {
      const selected = content(options.readSnapshot());
      localKey = selected.key;
      return selected;
    } finally {
      reading = false;
    }
  }

  function laterPush(): void {
    if (stopped || cancelPush) return;
    cancelPush = setTimer(() => {
      cancelPush = undefined;
      const scheduled = generation;
      void run(async () => {
        if (scheduled === generation) await reconcile('auto');
      });
    }, INTERVAL);
  }

  function changed(): void {
    if (stopped || reading || applying) return;
    try {
      const before = localKey;
      if (before === local().key) return;
      generation++;
      cancelPush?.();
      cancelPush = undefined;
      laterPush();
      if (kind === 'ready') kind = 'pending';
    } catch (error) {
      kind = 'error';
      conflict = undefined;
      logError?.(error);
    }
    notify();
  }

  function probe(): void {
    if (stopped || cancelProbe || probeQueued) return;
    cancelProbe = setTimer(() => {
      cancelProbe = undefined;
      probeQueued = true;
      void run(async () => {
        probeQueued = false;
        await reconcile('probe');
      });
    }, OBSERVE_DELAY);
  }

  function poll(): void {
    cancelPoll = setTimer(() => {
      cancelPoll = undefined;
      probe();
      if (!stopped) poll();
    }, INTERVAL);
  }

  function watch(): void {
    stopSettings ??= options.subscribeSettings(changed);
    stopObserving ??= transport.observe(probe);
    if (!cancelPoll) poll();
  }

  async function inspect(): Promise<Revision[] | undefined> {
    const remote = await transport.read();
    if (stopped) return;
    if (remote.location) location = remote.location;
    const heads = decodeHeads(remote.files, options.decodeSnapshot);
    if (remote.waiting || heads === 'missing-parent' || (!heads.length && baseline !== undefined)) {
      kind = 'waiting';
      conflict = undefined;
      return;
    }
    return heads;
  }

  function ready(value: Content): void {
    if (value.key !== baseline) {
      save({ ...state, baseline: value.snapshot });
      baseline = value.key;
    }
    if (local().key === value.key) {
      cancelPush?.();
      cancelPush = undefined;
      kind = 'ready';
    } else {
      kind = 'pending';
      laterPush();
    }
    conflict = undefined;
  }

  async function append(value: Content, heads: readonly Revision[]): Promise<void> {
    const id = transport.newRevisionID();
    if (!SYNC_REVISION_ID.test(id)) throw new Error('Invalid local Bases sync revision ID');
    const parents = heads.map((head) => head.id);
    const record = { version: VERSION, id, parents, snapshot: value.snapshot };
    await transport.append(id, JSON.stringify(record), location);
    if (stopped) return;
    ready(value);
    // Auto and explicit writes use the same native pathway. A refresh may
    // reveal another profile's branch, even after a successful local write.
    await transport.refresh();
    if (!stopped) await reconcile('probe');
  }

  function classify(heads: readonly Revision[], selected: Content): 'done' | 'publish' {
    if (heads.length && heads.every((head) => head.key === selected.key)) {
      ready(selected);
      return 'done';
    }
    if (heads.length && !heads.every((head) => head.key === baseline)) {
      kind = 'attention';
      conflict = heads.map((head) => head.id).join(',');
      return 'done';
    }
    kind = 'pending';
    conflict = undefined;
    return 'publish';
  }

  async function reconcile(mode: 'probe' | 'auto' | 'manual'): Promise<void> {
    if (!state.enabled) return;
    const before = local().key;
    const started = generation;
    let refreshed = mode === 'manual' ? await transport.refresh() : undefined;
    if (stopped) return;
    let heads = await inspect();
    if (!heads) return;
    let selected = local();
    if (classify(heads, selected) === 'done') return;
    if (mode === 'probe' || started !== generation || before !== selected.key) {
      laterPush();
      return;
    }
    // Before creating a carrier for the first time, ask Zotero for current
    // metadata. An empty local library alone is not proof of an empty cloud.
    if (!heads.length && refreshed === undefined) {
      refreshed = await transport.refresh();
      if (stopped) return;
      heads = await inspect();
      if (!heads) return;
      selected = local();
      if (classify(heads, selected) === 'done') return;
      if (started !== generation || before !== selected.key) {
        laterPush();
        return;
      }
    }
    if (!heads.length && refreshed === 'unavailable') {
      kind = 'waiting';
      return;
    }
    await append(selected, heads);
  }

  function apply(snapshot: SyncSnapshot): void {
    applying = true;
    try {
      options.applySnapshot(snapshot);
      local();
    } finally {
      applying = false;
    }
  }

  const controller: SyncPort & { stop(): void } = {
    status: () => ({ kind, location, canRestore: !!state.rollback, busy }),
    subscribe(listener) {
      if (stopped) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    enable: () =>
      run(async () => {
        if (!state.enabled) save({ ...state, enabled: true });
        watch();
        await reconcile('manual');
      }),
    syncNow: () => run(() => reconcile('manual')),
    resolve(side) {
      const expected = conflict;
      return run(async () => {
        if (!state.enabled || expected === undefined || expected !== conflict) return;
        const before = local();
        const started = generation;
        const heads = await inspect();
        if (!heads) return;
        const selected = local();
        if (classify(heads, selected) === 'publish') {
          laterPush();
          return;
        }
        if (
          kind !== 'attention' ||
          expected !== conflict ||
          started !== generation ||
          before.key !== selected.key
        ) {
          return;
        }
        if (side === 'local') {
          await append(selected, heads);
          return;
        }
        // Concurrent leaves have no trustworthy wall-clock order. Choose the
        // first stable ID different from local; every branch remains in Zotero.
        const cloud = heads.find((head) => head.key !== selected.key)!;
        save({ ...state, rollback: selected.snapshot });
        apply(cloud.snapshot);
        if (heads.every((head) => head.key === cloud.key)) ready(cloud);
        else await append(cloud, heads);
      });
    },
    restore: () =>
      run(async () => {
        if (!state.enabled || !state.rollback) return;
        apply(state.rollback);
        save({ ...state, rollback: undefined });
        await reconcile('probe');
      }),
    rename: (next) =>
      run(async () => {
        const updated = await transport.rename(next);
        if (stopped) return;
        save({ ...state, location: updated });
        location = updated;
      }),
    locations: () => transport.locations(),
    stop() {
      if (stopped) return;
      stopped = true;
      stopSettings?.();
      stopObserving?.();
      cancelProbe?.();
      cancelPoll?.();
      cancelPush?.();
      listeners.clear();
    },
  };
  if (state.enabled) {
    watch();
    probe();
  }
  return controller;
}
