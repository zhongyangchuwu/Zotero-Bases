// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { SyncPort, SyncStatus } from '../src/sync';
import { mountSyncControls } from '../src/sync-controls';

function fixture() {
  const parent = document.createElement('div');
  document.body.append(parent);
  let state: SyncStatus = {
    kind: 'off',
    location: { title: '[Zotero Bases] Sync — Do Not Delete' },
    busy: false,
    canRestore: false,
  };
  let observer: (() => void) | undefined;
  const update = (next: Partial<SyncStatus>) => {
    state = { ...state, ...next };
    observer?.();
  };
  const sync = {
    status: () => state,
    subscribe: (next: () => void) => {
      observer = next;
      return () => {
        observer = undefined;
      };
    },
    enable: vi.fn(async () => update({ kind: 'ready' })),
    syncNow: vi.fn(async () => update({ kind: 'attention' })),
    resolve: vi.fn(async (side: 'cloud' | 'local') =>
      update({ kind: 'ready', canRestore: side === 'cloud' }),
    ),
    restore: vi.fn(async () => update({ kind: 'pending', canRestore: false })),
    rename: vi.fn(async (location: SyncStatus['location']) => update({ location })),
    locations: () => [{ key: 'COLLKEY1', name: 'Reading' }],
  } satisfies SyncPort;
  const detach = mountSyncControls(parent, sync, 'zh-CN');
  const button = (text: string) =>
    [...parent.querySelectorAll('button')].find((entry) => entry.textContent === text)!;
  const clean = () => {
    detach();
    parent.remove();
  };
  return { parent, sync, update, button, clean };
}

async function click(button: HTMLButtonElement) {
  expect(button.hidden).toBe(false);
  expect(button.closest('details[hidden]')).toBeNull();
  button.click();
  await Promise.resolve();
}

describe('library sync surface', () => {
  it('enables without a form, opens conflict choices, and applies or overwrites with one click', async () => {
    const { parent, sync, update, button, clean } = fixture();
    try {
      expect(parent.querySelector('details')?.hidden).toBe(true);
      await click(button('开启文库同步'));
      expect(sync.enable).toHaveBeenCalledOnce();
      await click(button('立即同步'));
      expect(parent.querySelector('details')?.open).toBe(true);
      expect(parent.querySelector('dialog')).toBeNull();
      await click(button('应用云端定义与视图'));
      expect(sync.resolve).toHaveBeenLastCalledWith('cloud');
      await click(button('恢复应用云端前的本机设置'));
      expect(sync.restore).toHaveBeenCalledOnce();
      update({ kind: 'attention', busy: true });
      expect(button('以本机为准覆盖云端').disabled).toBe(true);
      update({ busy: false });
      await click(button('以本机为准覆盖云端'));
      expect(sync.resolve).toHaveBeenLastCalledWith('local');
      expect(button('应用云端定义与视图').hidden).toBe(true);
    } finally {
      clean();
    }
  });

  it('opens location controls with the native choices and submits a rename without changing sync choice', async () => {
    const { parent, sync, button, clean } = fixture();
    try {
      await click(button('开启文库同步'));
      const location = parent.querySelector<HTMLDetailsElement>('details details')!;
      expect(location.open).toBe(false);
      location.open = true;
      location.dispatchEvent(new Event('toggle'));
      const title = location.querySelector('input')!;
      const collection = location.querySelector('select')!;
      expect(title.value).toBe('[Zotero Bases] Sync — Do Not Delete');
      expect([...collection.options].map((option) => option.text)).toEqual(['我的文库', 'Reading']);
      title.value = 'Literature configuration';
      collection.value = 'COLLKEY1';
      await click(button('保存位置与名称'));
      expect(sync.rename).toHaveBeenCalledExactlyOnceWith({
        title: 'Literature configuration',
        collection: 'COLLKEY1',
      });
      expect(sync.resolve).not.toHaveBeenCalled();
    } finally {
      clean();
    }
  });
});
