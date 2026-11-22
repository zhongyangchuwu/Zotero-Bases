import { describe, expect, it } from 'vitest';
import { createConfig, decodeSyncSnapshot, SCHEMA_PREF, VIEWS_PREF } from '../src/config';
import type { Prefs } from '../src/data';
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
  sort: { column: 'added', direction: 'desc' },
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
      views: [{ id: 'default', scope }],
    });
    expect([...raw.keys()]).toEqual([VIEWS_PREF]);
    expect(createConfig(prefs, () => 'user', validateProperty).settings()).toEqual(first);
  });

  it('restores legacy views without adding presentation fields', () => {
    const { prefs, raw } = preferences();
    raw.set(VIEWS_PREF, JSON.stringify({ views: [secondView], active: secondView.id }));
    const config = createConfig(prefs, () => 'user', validateProperty);
    expect(config.settings()).toEqual({
      properties: [],
      views: [secondView],
      active: secondView.id,
    });
    config.writeViews({ views: config.settings().views, active: secondView.id });
    expect(JSON.parse(raw.get(VIEWS_PREF)!)).toEqual({
      views: [secondView],
      active: secondView.id,
    });
    expect(decodeSyncSnapshot({ schema: [], views: [secondView] }, validateProperty)).toEqual({
      schema: [],
      views: [secondView],
    });
  });

  it('persists and syncs presentation settings including widths for removed properties', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const presented: View = {
      ...secondView,
      density: 'wrap',
      columnWidths: { title: 48, 'property:Removed': 1600 },
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

  it('ignores malformed local presentation but rejects it in sync snapshots', () => {
    const { prefs, raw } = preferences();
    const config = createConfig(prefs, () => 'user', validateProperty);
    const malformed = [
      { density: 'spacious', columnWidths: { title: 100 } },
      { density: 'comfortable', columnWidths: { title: 47 } },
      { columnWidths: { title: 1601 } },
      { columnWidths: { unknown: 100 } },
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
      schema: [{ key: 'ReviewState', type: 'single-select', options: ['Reading', 'Done'] }],
      views: [
        { ...secondView, group: { column: 'tags', tag: 'Reading', direction: 'desc' } },
        initial,
      ],
    };
    const remote = decodeSyncSnapshot(payload, validateProperty)!;
    config.applySync(remote);
    expect(config.settings()).toEqual({
      properties: payload.schema,
      views: payload.views,
      active: initial.id,
    });
    config.applySync({ schema: remote.schema, views: [remote.views[0]!] });
    expect(config.settings().active).toBe(secondView.id);
  });

  it('rejects a remote snapshot as a unit for invalid or duplicate definitions or view configuration', () => {
    const decode = (input: unknown) => decodeSyncSnapshot(input, validateProperty);
    const text = { key: 'Stage', type: 'text' };
    expect(
      decode({ schema: [text, { ...text, key: 'stage' }], views: [secondView] }),
    ).toBeUndefined();
    expect(decode({ schema: [{ ...text, key: 'DOI' }], views: [secondView] })).toBeUndefined();
    expect(decode({ schema: [text], views: [secondView, secondView] })).toBeUndefined();
    expect(decode({ schema: [text], views: [{ ...secondView, sort: {} }] })).toBeUndefined();
    expect(
      decode({
        schema: [text],
        views: [{ ...secondView, group: { column: 'tags', direction: 'asc' } }],
      }),
    ).toBeUndefined();
    expect(decode({ schema: [text], views: [secondView] })?.views[0]?.group).toEqual(
      secondView.group,
    );
  });
});
