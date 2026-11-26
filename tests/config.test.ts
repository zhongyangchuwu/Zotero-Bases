import { describe, expect, it } from 'vitest';
import {
  createConfig,
  decodeSyncSnapshot,
  SCHEMA_PREF,
  TAG_COLORS_PREF,
  VIEWS_PREF,
} from '../src/config';
import type { Prefs } from '../src/data';
import { DEFAULT_COLUMNS } from '../src/contracts';
import type { View } from '../src/contracts';
import { validateProperty } from '../src/extra';

function preferences() {
  const raw = new Map<string, string>();
  const prefs: Prefs = {
    get(name, global) {
      expect(global).toBe(true);
      return raw.get(name);
    },
    set(name, value, global) {
      expect(global).toBe(true);
      raw.set(name, value);
    },
    registerObserver: () => Symbol(),
    unregisterObserver() {},
  };
  return { raw, prefs };
}

const secondView = {
  id: 'second',
  name: 'Group reading',
  scope: 'group:18/SUBCOLL0',
  columns: ['title', 'property:Removed'],
  sorts: [
    { column: 'added', direction: 'desc' },
    { column: 'property:Removed', direction: 'asc' },
  ],
  filters: [
    { column: 'property:Removed', operator: 'equals', value: 'gone' },
    { column: 'tags', operator: 'has', value: 'elsewhere' },
  ],
  group: { column: 'property:Removed', direction: 'desc' },
} satisfies View;

describe('Zotero Bases configuration', () => {
  it('persists an immediately usable default in the first native scope and reuses it across hosts', () => {
    const { prefs, raw } = preferences();
    const scope = 'group:18/SUBCOLL0';
    const first = createConfig(prefs, () => scope, validateProperty).settings();
    expect(first).toMatchObject({
      properties: [],
      active: 'default',
      views: [{ id: 'default', scope, sorts: [{ column: 'title', direction: 'asc' }] }],
    });
    expect(first.views[0]!.columns).toEqual(DEFAULT_COLUMNS);
    expect(DEFAULT_COLUMNS).toEqual([
      'title',
      'creators',
      'year',
      'source',
      'type',
      'tags',
      'pdf',
      'added',
    ]);
    expect([...raw.keys()]).toEqual([VIEWS_PREF]);
    expect(createConfig(prefs, () => 'user', validateProperty).settings()).toEqual(first);
  });

  it('decodes a legacy sort locally and remotely without rewriting the saved view', () => {
    const { prefs, raw } = preferences();
    const { sorts, ...fields } = secondView;
    const legacy = { ...fields, sort: sorts[0] };
    const saved = JSON.stringify({ views: [legacy], active: legacy.id });
    raw.set(VIEWS_PREF, saved);
    const expected = { ...fields, sorts: [sorts[0]] };
    const config = createConfig(prefs, () => 'user', validateProperty);
    expect(config.settings()).toEqual({
      properties: [],
      views: [expected],
      active: secondView.id,
    });
    expect(raw.get(VIEWS_PREF)).toBe(saved);
    config.writeViews({ views: config.settings().views, active: secondView.id });
    expect(JSON.parse(raw.get(VIEWS_PREF)!)).toEqual({
      views: [expected],
      active: secondView.id,
    });
    expect(decodeSyncSnapshot({ schema: [], views: [legacy] }, validateProperty)).toEqual({
      schema: [],
      views: [expected],
    });
  });

  it('falls back only from an absent sort stack, and normalizes malformed stacks to empty', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const { sorts, ...fields } = secondView;
    const sort = sorts[0]!;
    const invalidOrEmpty = [
      {},
      { sort: { column: 'no-such-column', direction: 'asc' } },
      { sort: { column: 'title', direction: 'sideways' } },
      { sort, sorts: null },
      { sort, sorts: [] },
      { sort, sorts: [sort, { column: 'title' }] },
    ];
    for (const value of invalidOrEmpty) {
      const view = { ...fields, ...value };
      const expected = { ...fields, sorts: [] };
      raw.set(VIEWS_PREF, JSON.stringify({ views: [view], active: view.id }));
      expect(config.settings().views).toEqual([expected]);
      expect(decodeSyncSnapshot({ schema: [], views: [view] }, validateProperty)?.views).toEqual([
        expected,
      ]);
    }
    const both = { ...secondView, sort: { column: 'title', direction: 'asc' } };
    expect(decodeSyncSnapshot({ schema: [], views: [both] }, validateProperty)?.views).toEqual([
      secondView,
    ]);
  });

  it('persists and syncs presentation settings including widths for removed properties', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const presented: View = {
      ...secondView,
      density: 'wrap',
      columnWidths: { title: 48, 'property:Removed': 1600 },
      frozenCount: Number.MAX_SAFE_INTEGER,
    };
    config.writeViews({ views: [presented], active: presented.id });
    expect(JSON.parse(raw.get(VIEWS_PREF)!)).toEqual({
      views: [presented],
      active: presented.id,
    });
    const reread = createConfig(prefs, () => 'all', validateProperty).settings();
    expect(reread.views).toEqual([presented]);
    const remote = decodeSyncSnapshot(
      JSON.parse(JSON.stringify({ schema: reread.properties, views: reread.views })),
      validateProperty,
    );
    expect(remote).toEqual({ schema: [], views: [presented] });
    const target = createConfig(preferences().prefs, () => 'user', validateProperty);
    target.applySync(remote!);
    expect(target.settings()).toEqual({ properties: [], views: [presented], active: presented.id });
  });

  it('preserves independent board and table settings when the layout changes', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const board: View = {
      ...secondView,
      layout: 'board',
      board: {
        laneField: 'property:Removed',
        cardFields: [],
        hideEmptyLanes: true,
        collapsedLanes: ['null', '"Done"'],
      },
      density: 'wrap',
      columnWidths: { title: 320 },
      frozenCount: 1,
    };
    const table: View = { ...board, layout: 'table' };
    const legacy = { ...secondView, id: 'legacy' };
    const unconfigured: View = { ...secondView, id: 'unconfigured', layout: 'board' };
    const noLane: View = {
      ...secondView,
      id: 'no-lane',
      layout: 'board',
      board: { cardFields: ['year'], hideEmptyLanes: false, collapsedLanes: [] },
    };
    for (const current of [board, table, board]) {
      const views = [current, legacy, unconfigured, noLane];
      config.writeViews({ views, active: current.id });
      expect(JSON.parse(raw.get(VIEWS_PREF)!)).toEqual({ views, active: current.id });
      expect(config.settings()).toEqual({ properties: [], views, active: current.id });
      expect(decodeSyncSnapshot({ schema: [], views }, validateProperty)).toEqual({
        schema: [],
        views,
      });
    }
  });

  it('discards malformed board fields locally without losing the view and rejects them remotely', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const board = { cardFields: ['creators'], hideEmptyLanes: false, collapsedLanes: [] };
    const invalid = [
      {
        supplied: { layout: 'kanban', board },
        kept: { board },
      },
      {
        supplied: { layout: null, board },
        kept: { board },
      },
      ...[
        null,
        ['tags'],
        {},
        { ...board, laneField: 'title' },
        { ...board, laneField: 'property:' },
        { ...board, laneField: null },
        { ...board, cardFields: ['title', 'property:'] },
        { ...board, cardFields: ['unrecognizedField'] },
        { ...board, cardFields: [0] },
        { ...board, cardFields: 'tags' },
        { ...board, hideEmptyLanes: 0 },
        { ...board, collapsedLanes: [null] },
        { ...board, collapsedLanes: 'null' },
      ].map((board) => ({ supplied: { layout: 'board', board }, kept: { layout: 'board' } })),
    ];
    for (const { supplied, kept } of invalid) {
      const malformed = { ...secondView, ...supplied };
      const saved = JSON.stringify({ views: [malformed], active: secondView.id });
      raw.set(VIEWS_PREF, saved);
      expect(config.settings().views).toEqual([{ ...secondView, ...kept }]);
      expect(raw.get(VIEWS_PREF)).toBe(saved);
      expect(
        decodeSyncSnapshot({ schema: [], views: [malformed] }, validateProperty),
      ).toBeUndefined();
    }
  });

  it('ignores malformed local presentation but rejects it in sync snapshots', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const malformed = [
      { density: 'spacious', columnWidths: { title: 100 } },
      { density: 'comfortable', columnWidths: { title: 47 } },
      { columnWidths: { title: 1601 } },
      { columnWidths: { title: '100' } },
      { columnWidths: null },
    ];
    for (const presentation of malformed) {
      const saved = { ...secondView, ...presentation };
      raw.set(VIEWS_PREF, JSON.stringify({ views: [saved], active: saved.id }));
      const restored = config.settings().views[0]!;
      expect(restored.id).toBe(secondView.id);
      expect(restored.columns).toEqual(secondView.columns);
      expect(restored.filters).toEqual(secondView.filters);
      expect(restored.density).toBe(
        presentation.density === 'comfortable' ? 'comfortable' : undefined,
      );
      expect(restored.columnWidths).toEqual(
        presentation.density === 'spacious' ? { title: 100 } : undefined,
      );
      expect(decodeSyncSnapshot({ schema: [], views: [saved] }, validateProperty)).toBeUndefined();
    }
  });

  it('keeps frozenCount optional locally and rejects malformed portable counts', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const unfrozen = { ...secondView, id: 'unfrozen', frozenCount: 0 };
    const views = [secondView, unfrozen];
    config.writeViews({ views, active: unfrozen.id });
    expect(config.settings().views).toEqual(views);
    expect(JSON.parse(raw.get(VIEWS_PREF)!).views).toEqual(views);
    expect(decodeSyncSnapshot({ schema: [], views }, validateProperty)?.views).toEqual(views);

    for (const frozenCount of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', true, null, {}]) {
      const malformed = { ...unfrozen, frozenCount };
      raw.set(VIEWS_PREF, JSON.stringify({ views: [secondView, malformed], active: unfrozen.id }));
      const { frozenCount: _frozenCount, ...withoutCount } = unfrozen;
      expect(config.settings()).toEqual({
        properties: [],
        views: [secondView, withoutCount],
        active: unfrozen.id,
      });
      expect(
        decodeSyncSnapshot({ schema: [], views: [secondView, malformed] }, validateProperty),
      ).toBeUndefined();
    }
  });

  it('drops unknown native keys while preserving known rules, stale properties and order', () => {
    const { prefs, raw } = preferences();
    const saved = {
      ...secondView,
      columns: ['futureColumn', 'doi', 'property:Removed', 'title'],
      sorts: [
        { column: 'futureColumn', direction: 'asc' },
        { column: 'dateModified', direction: 'desc' },
        { column: 'property:Removed', direction: 'asc' },
      ],
      filters: [
        { column: 'futureColumn', operator: 'equals', value: 'x' },
        { column: 'collections', operator: 'notContains', value: 'Reading' },
        { column: 'notesCount', operator: 'gt', value: '0' },
        { column: 'property:Removed', operator: 'notEquals', value: 'Done' },
      ],
      group: { column: 'futureColumn', direction: 'asc' },
      columnWidths: { futureColumn: 1, doi: 300, 'property:Removed': 160 },
    };
    const expected = {
      ...saved,
      columns: ['doi', 'property:Removed', 'title'],
      sorts: saved.sorts.slice(1),
      filters: saved.filters.slice(1),
      columnWidths: { doi: 300, 'property:Removed': 160 },
    };
    const { group: _group, ...withoutGroup } = expected;
    raw.set(VIEWS_PREF, JSON.stringify({ views: [saved], active: saved.id }));
    expect(createConfig(prefs, () => 'user', validateProperty).settings().views).toEqual([
      withoutGroup,
    ]);
    expect(decodeSyncSnapshot({ schema: [], views: [saved] }, validateProperty)).toEqual({
      schema: [],
      views: [withoutGroup],
    });
    const onlyUnknown = { ...saved, columns: ['futureColumn'] };
    expect(
      decodeSyncSnapshot({ schema: [], views: [onlyUnknown] }, validateProperty)?.views[0]?.columns,
    ).toEqual(DEFAULT_COLUMNS);
    expect(
      decodeSyncSnapshot({ schema: [], views: [{ ...saved, columns: [] }] }, validateProperty)
        ?.views[0]?.columns,
    ).toEqual([]);
  });

  it('keeps collection and date groupings and rejects malformed portable values', () => {
    const decode = (view: unknown) =>
      decodeSyncSnapshot({ schema: [], views: [view] }, validateProperty);
    for (const group of [
      { column: 'collections', collection: 'Reading', direction: 'desc' },
      { column: 'dateModified', direction: 'asc' },
      { column: 'lastRead', direction: 'desc' },
      { column: 'tags', tag: 'Read', direction: 'asc' },
    ]) {
      expect(decode({ ...secondView, group })?.views[0]?.group).toEqual(group);
    }
    for (const bad of [
      { columns: ['title', 1] },
      { columns: ['property:'] },
      { filters: [{ column: 'futureColumn', operator: 'equals', value: 1 }] },
      { filters: [{ column: 'futureColumn', operator: 'invalid', value: 'x' }] },
      { group: { column: 'futureColumn', direction: 'sideways' } },
      { group: { column: 'collections', collection: ' ', direction: 'asc' } },
      { columnWidths: { futureColumn: '100' } },
      { columnWidths: { doi: 47 } },
    ])
      expect(decode({ ...secondView, ...bad })).toBeUndefined();
    expect(
      decode({
        ...secondView,
        sorts: [{ column: 'futureColumn', direction: 'asc' }, { column: 'doi' }],
      })?.views[0]?.sorts,
    ).toEqual([]);
  });

  it('writes only the independent versioned JSON keys and preserves stale filters for workspace warnings', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const properties = [{ key: 'Reading Stage', type: 'text' }] as const;
    config.writeSchema(properties);
    const first = config.settings().views[0]!;
    config.writeViews({ views: [first, secondView], active: secondView.id });
    expect([...raw.keys()].sort()).toEqual([SCHEMA_PREF, VIEWS_PREF].sort());
    expect(JSON.parse(raw.get(SCHEMA_PREF)!)).toEqual(properties);
    expect(JSON.parse(raw.get(VIEWS_PREF)!)).toEqual({
      views: [first, secondView],
      active: secondView.id,
    });
    expect(createConfig(prefs, () => 'all', validateProperty).settings()).toEqual({
      views: [first, secondView],
      properties,
      active: secondView.id,
    });
  });

  it('falls back from bad JSON and never surfaces malformed or reserved saved definitions', () => {
    const { prefs, raw } = preferences();
    raw.set(VIEWS_PREF, '{truncated JSON');
    raw.set(
      SCHEMA_PREF,
      JSON.stringify([
        null,
        { key: 'Broken', type: 'multi-select', options: [null] },
        { key: ' DOI ', type: 'text' },
        { key: 'Research Grouping', type: 'text' },
      ]),
    );
    const config = createConfig(prefs, () => 'all', validateProperty);
    const settings = config.settings();
    expect(settings).toMatchObject({
      active: 'default',
      views: [{ id: 'default', scope: 'all' }],
      properties: [{ key: 'Research Grouping', type: 'text' }],
    });
    expect(raw.get(VIEWS_PREF)).toBe('{truncated JSON');
    config.writeViews({ views: [secondView], active: 'deleted-view' });
    expect(config.settings().active).toBe(secondView.id);
    config.writeViews({ views: [], active: secondView.id });
    expect(config.settings().active).toBe('default');
  });

  it('restores a complete validated remote snapshot and keeps the device selection if available', () => {
    const { prefs } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const initial = config.settings().views[0]!;
    config.writeViews({ views: [initial, secondView], active: initial.id });
    const payload = {
      schema: [
        {
          key: 'ReviewState',
          type: 'single-select',
          options: [' Reading ', 'Done'],
          optionColors: { 'Reading ': 'amber', Done: 'green' },
        },
      ],
      views: [
        { ...secondView, group: { column: 'tags', tag: 'Reading', direction: 'desc' } },
        initial,
      ],
    };
    const remote = decodeSyncSnapshot(payload, validateProperty)!;
    config.applySync(remote);
    expect(config.settings()).toEqual({
      properties: [
        {
          key: 'ReviewState',
          type: 'single-select',
          options: ['Reading', 'Done'],
          optionColors: { Reading: 'amber', Done: 'green' },
        },
      ],
      views: payload.views,
      active: initial.id,
    });
    config.applySync({ schema: remote.schema, views: [remote.views[0]!] });
    expect(config.settings().active).toBe(secondView.id);
  });

  it('keeps exact and prefix rules in a separate pref, NFC-normalized and case-sensitive', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    expect(config.settings().tagColors).toBeUndefined();
    config.setTagColor({
      kind: 'set-tag-color',
      target: 'tag',
      name: ' Cafe\u0301 ',
      color: 'red',
    });
    config.setTagColor({ kind: 'set-tag-color', target: 'prefix', name: 'Café', color: 'orange' });
    config.setTagColor({ kind: 'set-tag-color', target: 'tag', name: 'café', color: 'teal' });
    config.setTagColor({ kind: 'set-tag-color', target: 'tag', name: 'Café', color: 'green' });
    const rules = [
      { kind: 'tag', name: 'Café', color: 'green' },
      { kind: 'prefix', name: 'Café', color: 'orange' },
      { kind: 'tag', name: 'café', color: 'teal' },
    ];
    expect([...raw.keys()]).toEqual([VIEWS_PREF, TAG_COLORS_PREF]);
    expect(JSON.parse(raw.get(TAG_COLORS_PREF)!)).toEqual(rules);
    expect(createConfig(prefs, () => 'all', validateProperty).settings().tagColors).toEqual(rules);

    const snapshot = { schema: [], views: [secondView] };
    const remote = decodeSyncSnapshot({ ...snapshot, tagColors: [] }, validateProperty)!;
    expect(remote).toEqual(snapshot);
    config.applySync(remote);
    expect(config.settings().tagColors).toEqual(rules);

    config.setTagColor({
      kind: 'set-tag-color',
      target: 'tag',
      name: 'Cafe\u0301',
      color: undefined,
    });
    expect(config.settings().tagColors).toEqual(rules.slice(1));
  });

  it('ignores a malformed tag-color pref without overwriting it on read', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const malformed = JSON.stringify([
      { kind: 'prefix', name: 'topic:', color: 'green' },
      { kind: 'tag', name: 'Café', color: 'sky' },
      { kind: 'tag', name: ' Cafe\u0301 ', color: 'red' },
    ]);
    raw.set(TAG_COLORS_PREF, malformed);
    expect(config.settings().tagColors).toBeUndefined();
    expect(() =>
      config.setTagColor({ kind: 'set-tag-color', target: 'tag', name: ' \t ', color: 'red' }),
    ).toThrow('Invalid tag color rule');
    expect(raw.get(TAG_COLORS_PREF)).toBe(malformed);
  });

  it('rejects a remote snapshot as a unit for invalid or duplicate definitions or view configuration', () => {
    const decode = (input: unknown) => decodeSyncSnapshot(input, validateProperty);
    const text = { key: 'Stage', type: 'text' };
    expect(
      decode({ schema: [text, { ...text, key: 'stage' }], views: [secondView] }),
    ).toBeUndefined();
    expect(decode({ schema: [{ ...text, key: 'DOI' }], views: [secondView] })).toBeUndefined();
    expect(decode({ schema: [text], views: [secondView, secondView] })).toBeUndefined();
    expect(
      decode({
        schema: [text],
        views: [{ ...secondView, sorts: null, group: { column: 'tags', direction: 'asc' } }],
      }),
    ).toBeUndefined();
    expect(decode({ schema: [text], views: [secondView] })?.views[0]?.group).toEqual(
      secondView.group,
    );
  });

  it('rejects malformed color definitions without partially decoding a portable snapshot', () => {
    const valid = { key: 'Reading Stage', type: 'multi-select', options: ['Read', 'Café'] };
    const badColors = [
      [],
      null,
      'green',
      { Read: 'ultraviolet' },
      { Read: ['green'] },
      { Unknown: 'green' },
      { Café: 'amber', 'Cafe\u0301': 'sky' },
    ];
    for (const optionColors of badColors) {
      expect(
        decodeSyncSnapshot(
          {
            schema: [valid, { ...valid, key: 'Another Stage', optionColors }],
            views: [secondView],
          },
          validateProperty,
        ),
      ).toBeUndefined();
    }
    expect(
      decodeSyncSnapshot(
        { schema: [{ key: 'Notes', type: 'text', optionColors: {} }], views: [secondView] },
        validateProperty,
      ),
    ).toBeUndefined();
  });
});
