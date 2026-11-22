// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createConfigurationBackup } from '../src/backup';
import { validateProperty } from '../src/extra';
import { createGlobalPreferenceStore } from '../src/global-preferences';
import { mountPreferences } from '../src/preferences';
import type { SyncPort } from '../src/sync';
import { preferences } from './settings-fixture';

function fixture(hostLocale = 'en-US') {
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
  const unmount = mountPreferences(root, { store, backup, sync, hostLocale: () => hostLocale });
  return { root, store, backup, stopSync, listeners, unmount };
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
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
        'Language and keyboard flow',
      ]);
      const appearance = root.querySelector<HTMLSelectElement>('select[name="appearance"]')!;
      change(appearance, 'terminal');
      root.querySelector<HTMLInputElement>('input[name="keyboardFlow"]')!.click();
      expect(store.read()).toMatchObject({ appearance: 'terminal', keyboardFlow: false });
      store.set('openMode', 'window');
      expect(root.querySelector<HTMLSelectElement>('select[name="openMode"]')?.value).toBe(
        'window',
      );

      editor.focus();
      editor.value = ':scope { --zb-accent: red; }';
      editor.setSelectionRange(8, 8);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      expect(store.read().customCSS).toBe(editor.value);
      expect(document.activeElement).toBe(editor);
      expect(editor.selectionStart).toBe(8);
      change(root.querySelector<HTMLSelectElement>('select[name="language"]')!, 'zh-CN');
      expect(root.querySelector('.zb-preferences')?.getAttribute('lang')).toBe('zh-CN');
      expect(root.textContent).toContain('开启文库同步');
      expect(root.textContent).toContain('自定义 CSS');
      expect(root.querySelector('textarea')).toBe(editor);
      expect(editor.selectionStart).toBe(8);
    } finally {
      unmount();
      root.remove();
    }
    expect(stopSync).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    expect(root.childElementCount).toBe(0);
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
