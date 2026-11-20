import { describe, expect, it } from 'vitest';
import { createConfig, SCHEMA_PREF, VIEWS_PREF } from '../src/config';
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
});
