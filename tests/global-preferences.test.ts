import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_PREF, VIEWS_PREF } from '../src/config';
import {
  createGlobalPreferenceStore,
  DEFAULT_GLOBAL_PREFERENCES,
  resolveLanguage,
} from '../src/global-preferences';
import { preferences } from './settings-fixture';

const key = 'extensions.zotero-bases.preferences.v1';

describe('global preferences', () => {
  it('reads defaults without writing anything on profiles with only legacy schema and views', () => {
    const { prefs, values } = preferences();
    const legacy = [
      [SCHEMA_PREF, '[{"key":"Stage","type":"text"}]'],
      [
        VIEWS_PREF,
        '{"views":[{"id":"reading","scope":"user","name":"Reading"}],"active":"reading"}',
      ],
    ] as const;
    for (const [name, value] of legacy) values.set(name, value);
    const store = createGlobalPreferenceStore(prefs);
    expect(store.read()).toEqual({
      appearance: 'classic',
      customCSS: '',
      openMode: 'tab',
      defaultDensity: 'compact',
      authorFormat: 'etAl',
      language: 'auto',
    });
    expect([...values]).toEqual(legacy);

    store.set('openMode', 'window');
    expect(createGlobalPreferenceStore(prefs).read().openMode).toBe('window');
    for (const [name, value] of legacy) expect(values.get(name)).toBe(value);
  });

  it('ignores retired shortcuts without rewriting stored preferences and reads live fields', () => {
    const { prefs, values } = preferences();
    values.set(
      key,
      JSON.stringify({
        appearance: 'terminal',
        customCSS: 42,
        showShortcuts: false,
        openMode: 'popup',
        defaultDensity: 'wrap',
        authorFormat: null,
        language: 'zh-CN',
        keyboardFlow: false,
      }),
    );
    const store = createGlobalPreferenceStore(prefs);
    const before = values.get(key);
    expect(store.read()).toEqual({
      ...DEFAULT_GLOBAL_PREFERENCES,
      appearance: 'terminal',
      defaultDensity: 'wrap',
      language: 'zh-CN',
    });
    expect(values.get(key)).toBe(before);
    store.set('customCSS', ':scope { --zb-accent: red; }');
    expect(store.read()).toMatchObject({
      appearance: 'terminal',
      customCSS: ':scope { --zb-accent: red; }',
    });
    expect(JSON.parse(values.get(key) as string)).toEqual(store.read());
  });

  const invalid = [undefined, false, 'null', '[]', '"wrong type"', '{'];
  it.each(invalid)('defaults on invalid data %s', (raw) => {
    const { prefs, values } = preferences();
    values.set(key, raw);
    expect(createGlobalPreferenceStore(prefs).read()).toEqual(DEFAULT_GLOBAL_PREFERENCES);
    expect(values.get(key)).toBe(raw);
  });

  it('notifies independent surfaces of shared changes and unregisters subscriptions', () => {
    const { prefs, listeners } = preferences();
    const store = createGlobalPreferenceStore(prefs);
    const fromOtherSurface = createGlobalPreferenceStore(prefs);
    const tab = vi.fn();
    const popup = vi.fn();
    const detachTab = store.subscribe(tab);
    const detachPopup = store.subscribe(popup);

    fromOtherSurface.set('authorFormat', 'singleLine');
    expect(tab).toHaveBeenCalledExactlyOnceWith({
      ...DEFAULT_GLOBAL_PREFERENCES,
      authorFormat: 'singleLine',
    });
    expect(popup).toHaveBeenCalledExactlyOnceWith(store.read());
    detachTab();
    prefs.set(key, '{"language":"en-US"}', true);
    expect(tab).toHaveBeenCalledOnce();
    expect(popup).toHaveBeenLastCalledWith({ ...DEFAULT_GLOBAL_PREFERENCES, language: 'en-US' });
    detachPopup();
    expect(listeners.size).toBe(0);
  });

  it('uses the simplified Chinese host locale only in automatic mode', () => {
    expect(resolveLanguage('auto', 'zh-CN')).toBe('zh-CN');
    expect(resolveLanguage('auto', 'zh-Hans-SG')).toBe('zh-CN');
    expect(resolveLanguage('auto', 'zh-TW')).toBe('en');
    expect(resolveLanguage('auto', 'fr-FR')).toBe('en');
    expect(resolveLanguage('en-US', 'zh-CN')).toBe('en');
    expect(resolveLanguage('zh-CN', 'en-US')).toBe('zh-CN');
  });
});
