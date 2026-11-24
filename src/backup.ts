import { createConfig, decodeSyncSnapshot, decodeTagColors, type Prefs } from './config';
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
      const { properties, views, tagColors } = config.settings();
      return JSON.stringify({ schema: properties, views, tagColors }, null, 2);
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
      let tagColors;
      if (value && typeof value === 'object' && 'tagColors' in value) {
        tagColors = decodeTagColors(value.tagColors);
        if (!tagColors) return undefined;
      }
      config.applySync(snapshot);
      if (tagColors) config.writeTagColors(tagColors);
      return { properties: snapshot.schema.length, views: snapshot.views.length };
    },
  };
}
