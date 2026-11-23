import { createConfig, decodeSyncSnapshot, type Prefs } from './config';
import type { Property } from './contracts';

export interface ConfigurationImportSummary {
  properties: number;
  views: number;
}

export interface ConfigurationBackup {
  exportJSON(): string;
  importJSON(text: string): ConfigurationImportSummary | undefined;
}

export function createConfigurationBackup(
  prefs: Prefs,
  validate: (property: Property) => Property,
): ConfigurationBackup {
  const config = createConfig(prefs, () => 'user', validate, { initializeDefault: false });
  return {
    exportJSON(): string {
      const { properties, views } = config.settings();
      return JSON.stringify({ schema: properties, views }, null, 2);
    },
    importJSON(text: string): ConfigurationImportSummary | undefined {
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return undefined;
      }
      const snapshot = decodeSyncSnapshot(value, validate);
      if (!snapshot) return undefined;
      config.applySync(snapshot);
      return { properties: snapshot.schema.length, views: snapshot.views.length };
    },
  };
}
