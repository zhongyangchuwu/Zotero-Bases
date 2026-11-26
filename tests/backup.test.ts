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
  optionColors: { Unread: 'amber', Done: 'green' },
};
const view: View = {
  id: 'reading',
  name: 'Reading',
  scope: 'user',
  columns: ['title', 'doi', 'collections', 'notesCount', 'property:Reading Stage'],
  sorts: [
    { column: 'property:Reading Stage', direction: 'desc' },
    { column: 'title', direction: 'asc' },
  ],
  filters: [
    { column: 'property:Reading Stage', operator: 'equals', value: 'Unread' },
    { column: 'collections', operator: 'notContains', value: 'Archive' },
    { column: 'notesCount', operator: 'gt', value: '0' },
  ],
  group: { column: 'collections', collection: 'Reading', direction: 'asc' },
  density: 'wrap',
  columnWidths: { title: 320, doi: 240, collections: 200 },
};

describe('configuration backup', () => {
  it('exports schema and views and restores them without changing other preferences', () => {
    const source = preferences();
    const config = createConfig(source.prefs, () => 'user', validateProperty);
    const mainView: View = {
      ...view,
      id: 'home',
      frozenCount: 3,
      layout: 'board',
      board: {
        laneField: 'property:Removed stage',
        cardFields: ['creators', 'property:Rating', 'property:Removed card field'],
        hideEmptyLanes: true,
        collapsedLanes: ['null', '"Unread"'],
      },
      columns: [
        ...view.columns,
        'property:Rating',
        'property:Code Repository',
        'property:Reading Date',
      ],
      sorts: [{ column: 'property:Rating', direction: 'desc' }, ...view.sorts],
      filters: [
        { column: 'property:Rating', operator: 'notEquals', value: '1' },
        { column: 'property:Code Repository', operator: 'notContains', value: 'archive' },
        { column: 'property:Reading Date', operator: 'before', value: '2025-01-01' },
      ],
      group: { column: 'property:Reading Date', direction: 'asc' },
    };
    const unfrozenView = { ...view, frozenCount: 0 };
    const schema: Property[] = [
      property,
      { key: 'Rating', type: 'rating' },
      { key: 'Code Repository', type: 'url' },
      { key: 'Reading Date', type: 'date' },
    ];
    config.writeSchema(schema);
    config.writeViews({ views: [mainView, unfrozenView], active: view.id });
    createGlobalPreferenceStore(source.prefs).set('appearance', 'terminal');
    const json = createConfigurationBackup(source.prefs, validateProperty).exportJSON();
    expect(JSON.parse(json)).toEqual({ schema, views: [mainView, unfrozenView] });

    const target = preferences();
    const store = createGlobalPreferenceStore(target.prefs);
    store.set('appearance', 'modern');
    const backup = createConfigurationBackup(target.prefs, validateProperty);
    expect(backup.importJSON(json)).toEqual({ properties: 4, views: 2 });
    expect(backup.exportJSON()).toBe(json);
    const imported = createConfig(target.prefs, () => 'user', validateProperty).settings();
    expect(imported.active).toBe(mainView.id);
    expect(store.read().appearance).toBe('modern');
  });

  it('round-trips local tag color rules, preserves them on old imports, and clears them on []', () => {
    const source = preferences();
    const backup = createConfigurationBackup(source.prefs, validateProperty);
    const rules = [
      { kind: 'prefix', name: ' Café: ', color: 'orange' },
      { kind: 'tag', name: 'Cafe\u0301:Notes', color: 'red' },
    ];
    const old = { schema: [property], views: [view] };
    expect(backup.importJSON(JSON.stringify({ ...old, tagColors: rules }))).toEqual({
      properties: 1,
      views: 1,
    });
    const exported = backup.exportJSON();
    const expected = {
      ...old,
      tagColors: [
        { kind: 'prefix', name: 'Café:', color: 'orange' },
        { kind: 'tag', name: 'Café:Notes', color: 'red' },
      ],
    };
    expect(JSON.parse(exported)).toEqual(expected);

    const target = createConfigurationBackup(preferences().prefs, validateProperty);
    expect(target.importJSON(exported)).toEqual({ properties: 1, views: 1 });
    expect(target.exportJSON()).toBe(exported);
    target.importJSON(JSON.stringify({ ...old, schema: [] }));
    expect(JSON.parse(target.exportJSON())).toEqual({ ...expected, schema: [] });
    target.importJSON(JSON.stringify({ ...old, tagColors: [] }));
    expect(JSON.parse(target.exportJSON())).toEqual({ ...old, tagColors: [] });
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

  it('leaves all portable preferences untouched when any part of a backup is invalid', () => {
    const { prefs, values } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const backup = createConfigurationBackup(prefs, validateProperty);
    config.writeSchema([property]);
    config.writeViews({ views: [view], active: view.id });
    config.setTagColor({ kind: 'set-tag-color', target: 'tag', name: 'Saved', color: 'teal' });
    const before = [...values];
    const invalid = [
      '{',
      'null',
      '{"schema":[],"views":[]}',
      JSON.stringify({ schema: [{ ...property, key: 'DOI' }], views: [view] }),
      JSON.stringify({ schema: [property, { ...property, key: 'reading stage' }], views: [view] }),
      JSON.stringify({ schema: [], views: [view, { ...view, density: 'unknown' }] }),
      JSON.stringify({ schema: [{ ...property, optionColors: { Done: 'pink' } }], views: [view] }),
      JSON.stringify({ schema: [], views: [{ ...view, frozenCount: -1 }] }),
      JSON.stringify({ schema: [], views: [{ ...view, frozenCount: 2.5 }] }),
      JSON.stringify({ schema: [], views: [{ ...view, layout: false }] }),
      JSON.stringify({
        schema: [],
        views: [
          {
            ...view,
            layout: 'table',
            board: { cardFields: [], hideEmptyLanes: 'yes', collapsedLanes: [] },
          },
        ],
      }),
      ...[
        null,
        {},
        [{ kind: 'unknown', name: 'Reading', color: 'sky' }],
        [{ kind: 'prefix', name: ' ', color: 'sky' }],
        [{ kind: 'tag', name: 42, color: 'sky' }],
        [{ kind: 'tag', name: 'Reading', color: '#abcdef' }],
        [
          { kind: 'prefix', name: 'Café:', color: 'violet' },
          { kind: 'prefix', name: 'Cafe\u0301:', color: 'amber' },
        ],
      ].map((tagColors) =>
        JSON.stringify({ schema: [], views: [{ ...view, name: 'Different' }], tagColors }),
      ),
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
    };
    expect(
      backup.importJSON(
        JSON.stringify({ schema: [], views: [{ ...legacy, extra: 'ignore' }], extra: ['ignored'] }),
      ),
    ).toEqual({ properties: 0, views: 1 });
    const { sort, ...fields } = legacy;
    expect(JSON.parse(backup.exportJSON())).toEqual({
      schema: [],
      views: [{ ...fields, sorts: [sort] }],
    });
  });

  it('imports legacy unknown native columns without losing valid settings', () => {
    const { prefs } = preferences();
    const backup = createConfigurationBackup(prefs, validateProperty);
    const legacy = {
      ...view,
      columns: ['futureColumn', 'title', 'property:Reading Stage'],
      sorts: [
        { column: 'futureColumn', direction: 'asc' },
        { column: 'title', direction: 'desc' },
      ],
      filters: [
        { column: 'futureColumn', operator: 'equals', value: 'x' },
        { column: 'property:Reading Stage', operator: 'equals', value: 'Unread' },
      ],
      group: { column: 'futureColumn', direction: 'asc' },
      columnWidths: { futureColumn: 80, title: 320 },
    };
    expect(backup.importJSON(JSON.stringify({ schema: [property], views: [legacy] }))).toEqual({
      properties: 1,
      views: 1,
    });
    const { group: _group, ...ungrouped } = view;
    expect(JSON.parse(backup.exportJSON())).toEqual({
      schema: [property],
      views: [
        {
          ...ungrouped,
          columns: ['title', 'property:Reading Stage'],
          sorts: [{ column: 'title', direction: 'desc' }],
          filters: [{ column: 'property:Reading Stage', operator: 'equals', value: 'Unread' }],
          columnWidths: { title: 320 },
        },
      ],
    });
  });

  it('restores the rest of a legacy view with an invalid sort', () => {
    const { prefs } = preferences();
    const backup = createConfigurationBackup(prefs, validateProperty);
    const { sorts: _sorts, ...fields } = view;
    expect(
      backup.importJSON(JSON.stringify({ schema: [property], views: [{ ...fields, sort: null }] })),
    ).toEqual({ properties: 1, views: 1 });
    expect(JSON.parse(backup.exportJSON())).toEqual({
      schema: [property],
      views: [{ ...fields, sorts: [] }],
    });
  });
});
