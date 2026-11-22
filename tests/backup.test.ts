import { describe, expect, it } from 'vitest';
import { createConfigurationBackup } from '../src/backup';
import { createConfig } from '../src/config';
import type { Property, View } from '../src/contracts';
import { validateProperty } from '../src/extra';
import { createGlobalPreferenceStore } from '../src/global-preferences';
import { preferences } from './settings-fixture';

const property: Property = {
  key: 'Reading Stage',
  type: 'single-select',
  options: ['Unread', 'Done'],
};
const view: View = {
  id: 'reading',
  name: 'Reading',
  scope: 'user',
  columns: ['title', 'property:Reading Stage'],
  sort: { column: 'title', direction: 'asc' },
  filters: [{ column: 'property:Reading Stage', operator: 'equals', value: 'Unread' }],
  density: 'wrap',
  columnWidths: { title: 320 },
};

describe('configuration backup', () => {
  it('exports only portable schema and views and restores them without changing other preferences', () => {
    const source = preferences();
    const config = createConfig(source.prefs, () => 'user', validateProperty);
    const mainView = { ...view, id: 'home' };
    config.writeSchema([property]);
    config.writeViews({ views: [mainView, view], active: view.id });
    createGlobalPreferenceStore(source.prefs).set('appearance', 'terminal');
    const json = createConfigurationBackup(source.prefs, validateProperty).exportJSON();
    expect(JSON.parse(json)).toEqual({ schema: [property], views: [mainView, view] });

    const target = preferences();
    const store = createGlobalPreferenceStore(target.prefs);
    store.set('appearance', 'modern');
    const backup = createConfigurationBackup(target.prefs, validateProperty);
    expect(backup.importJSON(json)).toEqual({ properties: 1, views: 2 });
    expect(backup.exportJSON()).toBe(json);
    const imported = createConfig(target.prefs, () => 'user', validateProperty).settings();
    expect(imported.active).toBe(mainView.id);
    expect(store.read().appearance).toBe('modern');
  });

  it('does not initialize preferences on opening or exporting a backup', () => {
    const { prefs, values } = preferences();
    const backup = createConfigurationBackup(prefs, validateProperty);
    expect(values.size).toBe(0);
    expect(JSON.parse(backup.exportJSON())).toMatchObject({
      schema: [],
      views: [{ id: 'default' }],
    });
    expect(values.size).toBe(0);
  });

  it('leaves schema and views untouched when any part of a backup is invalid', () => {
    const { prefs, values } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const backup = createConfigurationBackup(prefs, validateProperty);
    config.writeSchema([property]);
    config.writeViews({ views: [view], active: view.id });
    const before = [...values];
    const invalid = [
      '{',
      'null',
      '{"schema":[],"views":[]}',
      JSON.stringify({ schema: [{ ...property, key: 'DOI' }], views: [view] }),
      JSON.stringify({ schema: [property, { ...property, key: 'reading stage' }], views: [view] }),
      JSON.stringify({ schema: [], views: [view, { ...view, density: 'unknown' }] }),
      JSON.stringify({ schema: [], views: [{ ...view, sort: null }] }),
    ];
    for (const json of invalid) {
      expect(backup.importJSON(json)).toBeUndefined();
      expect([...values]).toEqual(before);
    }
  });

  it('accepts legacy views without presentation fields and ignores nonportable fields', () => {
    const { prefs } = preferences();
    const backup = createConfigurationBackup(prefs, validateProperty);
    const legacy = {
      id: 'old',
      name: 'Old view',
      scope: 'user',
      columns: ['title'],
      sort: { column: 'title', direction: 'asc' },
      filters: [],
    } satisfies View;
    expect(
      backup.importJSON(
        JSON.stringify({ schema: [], views: [{ ...legacy, extra: 'ignore' }], extra: ['ignored'] }),
      ),
    ).toEqual({ properties: 0, views: 1 });
    expect(JSON.parse(backup.exportJSON())).toEqual({ schema: [], views: [legacy] });
  });
});
