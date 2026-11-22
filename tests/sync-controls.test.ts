// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { SyncPort, SyncStatus } from '../src/sync';
import { mountSyncBadge, mountSyncControls } from '../src/sync-controls';

function fixture() {
  const parent = document.createElement('div');
  document.body.append(parent);
  let state: SyncStatus = {
    kind: 'off',
    location: { title: '[Zotero Bases] Sync — Do Not Delete' },
    busy: false,
    canRestore: false,
  };
  const observers = new Set<() => void>();
  const update = (next: Partial<SyncStatus>) => {
    state = { ...state, ...next };
    for (const observer of observers) observer();
  };
  const sync = {
    status: () => state,
    subscribe: (next: () => void) => {
      observers.add(next);
      return () => observers.delete(next);
    },
    enable: vi.fn(async () => update({ kind: 'ready' })),
    disable: vi.fn(async () => update({ kind: 'off' })),
    syncNow: vi.fn(async () => update({ kind: 'attention' })),
    resolve: vi.fn(async (side: 'cloud' | 'local') =>
      update({ kind: 'ready', canRestore: side === 'cloud' }),
    ),
    restore: vi.fn(async () => update({ kind: 'pending', canRestore: false })),
    rename: vi.fn(async (location: SyncStatus['location']) => update({ location })),
    locations: () => [{ key: 'COLLKEY1', name: 'Reading' }],
  } satisfies SyncPort;
  const panel = mountSyncControls(parent, sync, 'zh-CN');
  const button = (text: string) =>
    [...parent.querySelectorAll('button')].find((entry) => entry.textContent === text)!;
  const clean = () => {
    panel.dispose();
    parent.remove();
  };
  return { parent, sync, update, button, clean, panel, observers };
}

async function click(button: HTMLButtonElement) {
  expect(button.hidden).toBe(false);
  expect(button.closest('details[hidden]')).toBeNull();
  button.click();
  await Promise.resolve();
}

describe('library sync surface', () => {
  it('enables and disables sync and presents one-click conflict choices inline', async () => {
    const { parent, sync, update, button, clean } = fixture();
    try {
      expect(parent.querySelector('details')?.hidden).toBe(true);
      await click(button('开启文库同步'));
      expect(sync.enable).toHaveBeenCalledOnce();
      await click(button('立即同步'));
      expect(button('应用云端定义与视图').closest('details')).toBeNull();
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
      await click(button('关闭文库同步'));
      expect(sync.disable).toHaveBeenCalledOnce();
      expect(button('立即同步').hidden).toBe(true);
      expect(button('开启文库同步').hidden).toBe(false);
    } finally {
      clean();
    }
  });

  it('opens location controls with the native choices and submits a rename without changing sync choice', async () => {
    const { parent, sync, button, clean, panel } = fixture();
    try {
      await click(button('开启文库同步'));
      const location = parent.querySelector<HTMLDetailsElement>('details')!;
      expect(location.open).toBe(false);
      location.open = true;
      location.dispatchEvent(new Event('toggle'));
      const title = location.querySelector('input')!;
      const collection = location.querySelector('select')!;
      expect(title.value).toBe('[Zotero Bases] Sync — Do Not Delete');
      expect([...collection.options].map((option) => option.text)).toEqual(['我的文库', 'Reading']);
      title.value = 'Literature configuration';
      collection.value = 'COLLKEY1';
      panel.setLanguage('en');
      expect([...collection.options].map((option) => option.text)).toEqual([
        'My Library',
        'Reading',
      ]);
      await click(button('Save location and name'));
      expect(sync.rename).toHaveBeenCalledExactlyOnceWith({
        title: 'Literature configuration',
        collection: 'COLLKEY1',
      });
      expect(sync.resolve).not.toHaveBeenCalled();
    } finally {
      clean();
    }
  });

  it('shows only the localized status dot when enabled and navigates to preferences', () => {
    const { parent, update, sync, clean, observers } = fixture();
    const navigate = vi.fn();
    const detach = mountSyncBadge(parent, sync, 'en', navigate);
    const badge = parent.querySelector<HTMLButtonElement>('.zb-sync-badge')!;
    try {
      expect(badge.hidden).toBe(true);
      update({ kind: 'pending' });
      expect(badge.hidden).toBe(false);
      expect(badge.textContent).toBe('●');
      expect(badge.dataset.status).toBe('pending');
      expect(badge.title).toBe('Library sync · changes pending');
      expect(badge.getAttribute('aria-label')).toBe(badge.title);
      badge.click();
      expect(navigate).toHaveBeenCalledOnce();
      update({ kind: 'error' });
      expect(badge.dataset.status).toBe('error');
      update({ kind: 'off' });
      expect(badge.hidden).toBe(true);
    } finally {
      detach();
      clean();
    }
    expect(observers.size).toBe(0);
    expect(badge.isConnected).toBe(false);
  });
});
