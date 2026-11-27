import type { Prefs } from './config';
import type { Density } from './contracts';
import type { Language } from './i18n';

const GLOBAL_PREF = 'extensions.zotero-bases.preferences.v1';

export interface GlobalPreferences {
  appearance: 'classic' | 'terminal' | 'modern';
  customCSS: string;
  openMode: 'tab' | 'window';
  defaultDensity: Density;
  authorFormat: 'etAl' | 'singleLine';
  language: 'auto' | 'zh-CN' | 'en-US';
}

export interface GlobalPreferenceStore {
  read(): GlobalPreferences;
  set<K extends keyof GlobalPreferences>(key: K, value: GlobalPreferences[K]): void;
  subscribe(listener: (value: GlobalPreferences) => void): () => void;
}

export const DEFAULT_GLOBAL_PREFERENCES: Readonly<GlobalPreferences> = Object.freeze({
  appearance: 'classic',
  customCSS: '',
  openMode: 'tab',
  defaultDensity: 'compact',
  authorFormat: 'etAl',
  language: 'auto',
});

function parse(raw: unknown): Partial<Record<keyof GlobalPreferences, unknown>> {
  if (typeof raw === 'string') {
    try {
      const value: unknown = JSON.parse(raw);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {
      // Invalid JSON is treated the same as an unset preference.
    }
  }
  return {};
}

export function createGlobalPreferenceStore(prefs: Prefs): GlobalPreferenceStore {
  function read(): GlobalPreferences {
    const value = parse(prefs.get(GLOBAL_PREF, true));
    const defaults = DEFAULT_GLOBAL_PREFERENCES;
    return {
      appearance:
        value.appearance === 'modern' || value.appearance === 'terminal'
          ? value.appearance
          : defaults.appearance,
      customCSS: typeof value.customCSS === 'string' ? value.customCSS : defaults.customCSS,
      openMode: value.openMode === 'window' ? value.openMode : defaults.openMode,
      defaultDensity:
        value.defaultDensity === 'comfortable' || value.defaultDensity === 'wrap'
          ? value.defaultDensity
          : defaults.defaultDensity,
      authorFormat:
        value.authorFormat === 'singleLine' ? value.authorFormat : defaults.authorFormat,
      language:
        value.language === 'zh-CN' || value.language === 'en-US'
          ? value.language
          : defaults.language,
    };
  }

  return {
    read,
    set<K extends keyof GlobalPreferences>(key: K, value: GlobalPreferences[K]): void {
      const current = read();
      if (current[key] === value) return;
      current[key] = value;
      prefs.set(GLOBAL_PREF, JSON.stringify(current), true);
    },
    subscribe(listener: (value: GlobalPreferences) => void): () => void {
      const id = prefs.registerObserver(GLOBAL_PREF, () => listener(read()), true);
      return () => prefs.unregisterObserver(id);
    },
  };
}

export function resolveLanguage(
  choice: GlobalPreferences['language'],
  hostLocale: string,
): Language {
  if (choice === 'auto') return /^zh-(?:CN|Hans)(?:-|$)/i.test(hostLocale) ? 'zh-CN' : 'en';
  return choice === 'zh-CN' ? 'zh-CN' : 'en';
}
