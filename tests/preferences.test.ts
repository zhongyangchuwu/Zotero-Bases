// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createConfigurationBackup } from '../src/backup';
import type { WorkspaceHost } from '../src/contracts';
import { validateProperty } from '../src/extra';
import { createGlobalPreferenceStore } from '../src/global-preferences';
import { mountPreferences } from '../src/preferences';
import type { SyncPort } from '../src/sync';
import { mountWorkspace } from '../src/workspace';
import { commandMenuItem, installXULMenulist } from './preference-menulist-fixture';
import { preferences } from './settings-fixture';

function fixture(hostLocale = 'en-US') {
  const removeXUL = installXULMenulist(document);
  const { prefs, listeners } = preferences();
  const store = createGlobalPreferenceStore(prefs);
  const backup = createConfigurationBackup(prefs, validateProperty);
  const stopSync = vi.fn();
  const sync: SyncPort = {
    status: () => ({ kind: 'off', busy: false, canRestore: false, location: { title: 'Bases' } }),
    subscribe: () => stopSync,
    enable: vi.fn(),
    disable: vi.fn(),
    syncNow: vi.fn(),
    resolve: vi.fn(),
    restore: vi.fn(),
    rename: vi.fn(),
    locations: () => [],
  };
  const root = document.createElement('div');
  document.body.append(root);
  const dispose = mountPreferences(root, { store, backup, sync, hostLocale: () => hostLocale });
  return {
    root,
    prefs,
    store,
    backup,
    stopSync,
    listeners,
    unmount() {
      dispose();
      removeXUL();
    },
  };
}

function workspaceHost(creators: string): WorkspaceHost {
  const unexpected = (): never => {
    throw new Error('Unexpected workspace host action');
  };
  return {
    settings: () => ({
      properties: [],
      views: [
        {
          id: 'default',
          name: 'Library',
          scope: 'personal',
          columns: ['title', 'creators'],
          sorts: [],
          filters: [],
        },
      ],
      active: 'default',
    }),
    scopes: () => [{ id: 'personal', label: 'My Library' }],
    initialScope: () => 'personal',
    load: async () => ({
      rows: [
        {
          id: 1,
          writable: false,
          title: 'A paper',
          creators,
          year: '2024',
          source: '',
          type: 'journalArticle',
          tags: [],
          pdf: false,
          added: '2024-10-31',
          extra: '',
        },
      ],
      tags: new Set(),
    }),
    change: unexpected,
    setProperty: unexpected,
    changeTag: unexpected,
    bulk: unexpected,
    suggestPropertyKey: unexpected,
    openItem: unexpected,
    subscribe: () => () => {},
  };
}

function dropdown(root: HTMLElement, key: string): Element {
  const menu = root.querySelector(`menulist[name="${key}"]`);
  if (!menu) throw new Error(`Missing preference dropdown ${key}`);
  return menu;
}

function attachFile(input: HTMLInputElement, text: string): void {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([text], 'configuration.json', { type: 'application/json' })],
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('preferences pane', () => {
  it('saves controls immediately and relocalizes without replacing the CSS editor or moving the caret', () => {
    const { root, store, stopSync, listeners, unmount } = fixture();
    const editor = root.querySelector<HTMLTextAreaElement>('textarea[name="customCSS"]')!;
    try {
      expect([...root.querySelectorAll('h2')].map((element) => element.textContent)).toEqual([
        'Appearance and custom styles',
        'Workspace defaults',
        'Sync and configuration backup',
        'Language',
      ]);
      expect(root.querySelectorAll('select')).toHaveLength(0);
      const appearance = dropdown(root, 'appearance');
      expect(root.querySelector(`label[control="${appearance.id}"]`)?.textContent).toBe(
        'Appearance preset',
      );
      commandMenuItem(appearance, 'terminal');
      commandMenuItem(dropdown(root, 'openMode'), 'window');
      commandMenuItem(dropdown(root, 'defaultDensity'), 'wrap');
      commandMenuItem(dropdown(root, 'authorFormat'), 'singleLine');
      expect(
        root.querySelector('input[name="keyboardFlow"], input[name="showShortcuts"]'),
      ).toBeNull();
      expect(store.read()).toMatchObject({
        appearance: 'terminal',
        openMode: 'window',
        defaultDensity: 'wrap',
        authorFormat: 'singleLine',
      });
      store.set('openMode', 'tab');
      expect(dropdown(root, 'openMode').getAttribute('value')).toBe('tab');

      editor.focus();
      editor.value = ':scope { --zb-accent: red; }';
      editor.setSelectionRange(8, 8);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      expect(store.read().customCSS).toBe(editor.value);
      expect(document.activeElement).toBe(editor);
      expect(editor.selectionStart).toBe(8);
      const language = dropdown(root, 'language');
      commandMenuItem(language, 'zh-CN');
      expect(store.read().language).toBe('zh-CN');
      expect(dropdown(root, 'language')).toBe(language);
      expect(appearance.querySelector('menuitem[selected]')?.getAttribute('label')).toBe('终端');
      expect(root.querySelector('.zb-preferences')?.getAttribute('lang')).toBe('zh-CN');
      expect(root.textContent).toContain('开启文库同步');
      expect(root.textContent).toContain('自定义 CSS');
      expect(root.querySelector('textarea')).toBe(editor);
      expect(document.activeElement).toBe(editor);
      expect(editor.selectionStart).toBe(8);
    } finally {
      unmount();
      root.remove();
    }
    expect(stopSync).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    expect(root.childElementCount).toBe(0);
  });

  it('persists pane choices and updates two already-mounted workspaces through the real store', async () => {
    const { root, prefs, unmount } = fixture();
    const creators = 'Ada Lovelace; Grace Hopper; Mary Jackson';
    const tab = document.body.appendChild(document.createElement('main'));
    const window = document.body.appendChild(document.createElement('main'));
    const closeTab = mountWorkspace(tab, workspaceHost(creators), {
      language: 'en',
      global: createGlobalPreferenceStore(prefs),
      popOut: () => {},
    });
    const closeWindow = mountWorkspace(window, workspaceHost(creators), {
      language: 'en',
      global: createGlobalPreferenceStore(prefs),
    });
    const surfaces = [tab, window];
    const author = (surface: HTMLElement) =>
      surface.querySelector('tr[data-item-id="1"] td[data-column="creators"]');
    try {
      await vi.waitFor(() => {
        for (const surface of surfaces) {
          expect(author(surface)?.textContent).toBe('Ada Lovelace et al.');
        }
      });

      commandMenuItem(dropdown(root, 'authorFormat'), 'singleLine');
      for (const surface of surfaces) expect(author(surface)?.textContent).toBe(creators);
      commandMenuItem(dropdown(root, 'language'), 'zh-CN');
      expect(createGlobalPreferenceStore(prefs).read()).toMatchObject({
        authorFormat: 'singleLine',
        language: 'zh-CN',
      });
      for (const surface of surfaces) {
        expect(author(surface)?.textContent).toBe(creators);
        expect(surface.querySelector('[role="searchbox"]')?.getAttribute('aria-label')).toBe(
          '在当前范围内搜索',
        );
      }
    } finally {
      closeWindow();
      closeTab();
      window.remove();
      tab.remove();
      unmount();
      root.remove();
    }
  });

  it('reads configuration files and shows a localized summary or a nonblocking error', async () => {
    const { root, store, backup, unmount } = fixture();
    const input = root.querySelector<HTMLInputElement>('input[name="importJSON"]')!;
    const result = root.querySelector('.zb-backup-result')!;
    try {
      const json = JSON.stringify({
        ...JSON.parse(backup.exportJSON()),
        schema: [{ key: 'Reading Stage', type: 'text' }],
      });
      attachFile(input, json);
      await vi.waitFor(() => expect(result.textContent).toBe('Imported 1 property and 1 view.'));
      expect(JSON.parse(backup.exportJSON())).toEqual(JSON.parse(json));
      store.set('language', 'zh-CN');
      expect(result.textContent).toBe('已导入 1 个属性定义和 1 个视图。');

      attachFile(input, '{');
      await vi.waitFor(() => expect(result.textContent).toBe('无法导入此备份，配置未更改。'));
      expect(JSON.parse(backup.exportJSON())).toEqual(JSON.parse(json));
      expect(root.querySelector('dialog')).toBeNull();
    } finally {
      unmount();
      root.remove();
    }
  });

  it('exports through the owning window’s native save picker', async () => {
    const { root, backup, unmount } = fixture();
    const init = vi.fn();
    const writeUTF8 = vi.fn();
    const picker = {
      init,
      modeSave: 1,
      returnCancel: 1,
      file: '/chosen/backup.json',
      appendFilter: vi.fn(),
      show: vi.fn(async () => 0),
      defaultString: '',
      defaultExtension: '',
    };
    Object.defineProperties(window, {
      ChromeUtils: {
        configurable: true,
        value: {
          importESModule: () => ({
            FilePicker: function () {
              return picker;
            },
          }),
        },
      },
      IOUtils: { configurable: true, value: { writeUTF8 } },
    });
    try {
      root.querySelector<HTMLButtonElement>('button[data-action="export-json"]')!.click();
      await vi.waitFor(() =>
        expect(writeUTF8).toHaveBeenCalledExactlyOnceWith(picker.file, backup.exportJSON()),
      );
      expect(init).toHaveBeenCalledExactlyOnceWith(window, 'Export JSON', 1);
      expect(picker.defaultString).toBe('zotero-bases-configuration.json');
    } finally {
      Reflect.deleteProperty(window, 'ChromeUtils');
      Reflect.deleteProperty(window, 'IOUtils');
      unmount();
      root.remove();
    }
  });
});
