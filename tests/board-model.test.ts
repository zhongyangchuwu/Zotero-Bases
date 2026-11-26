import { describe, expect, it } from 'vitest';
import {
  boardCardFields,
  boardLaneProperty,
  boardLanes,
  defaultBoardSettings,
  laneProperties,
} from '../src/board-model';
import type { BoardSettings, Property, Row } from '../src/contracts';

const status: Property = { key: 'Stage', type: 'single-select', options: ['In progress', 'Done'] };
const stars: Property = { key: 'Stars', type: 'rating' };
const labels: Property = { key: 'Labels', type: 'multi-select', options: ['Replicate'] };
const memo: Property = { key: 'Memo', type: 'text' };
const properties = [labels, status, memo, stars, { key: 'Other rating', type: 'rating' }] as const;

function row(id: number, extra = ''): Row {
  return {
    id,
    writable: true,
    title: `Paper ${id}`,
    creators: '',
    year: '',
    source: '',
    type: '',
    tags: [],
    pdf: false,
    added: '',
    extra,
  };
}

describe('board settings', () => {
  it('resolves only single-select and rating properties, with a safe schema-order fallback', () => {
    expect(laneProperties(properties)).toEqual([status, stars, properties[4]]);
    expect(boardLaneProperty(undefined, properties)).toBe(status);
    const settings = defaultBoardSettings(properties);
    expect(boardLaneProperty({ ...settings, laneField: 'property:Stars' }, properties)).toBe(stars);
    expect(boardLaneProperty({ ...settings, laneField: 'property:Labels' }, properties)).toBe(
      status,
    );
    expect(boardLaneProperty(settings, [labels, memo, stars])).toBe(stars);
    expect(boardLaneProperty(settings, [labels, memo])).toBeUndefined();
    expect(settings.laneField).toBe('property:Stage');
  });

  it('defaults a new board to the first lane property and ordered compact card fields', () => {
    expect(defaultBoardSettings(properties)).toEqual({
      laneField: 'property:Stage',
      cardFields: ['creators', 'year', 'property:Stars', 'tags', 'pdf'],
      hideEmptyLanes: false,
      collapsedLanes: [],
    });
    expect(defaultBoardSettings([memo])).toEqual({
      cardFields: ['creators', 'year', 'tags', 'pdf'],
      hideEmptyLanes: false,
      collapsedLanes: [],
    });
    expect(boardCardFields(undefined, properties)).toEqual([
      'creators',
      'year',
      'property:Stars',
      'tags',
      'pdf',
    ]);
    expect(boardCardFields(defaultBoardSettings([stars]), [stars])).toEqual([
      'creators',
      'year',
      'tags',
      'pdf',
    ]);
  });

  it('keeps intentional empty fields and omits title, missing fields and the effective lane', () => {
    const configured: BoardSettings = {
      ...defaultBoardSettings(properties),
      laneField: 'property:Deleted lane',
      cardFields: ['pdf', 'title', 'property:Stage', 'property:Missing', 'property:Stars', 'tags'],
    };
    expect(boardCardFields(configured, properties)).toEqual(['pdf', 'property:Stars', 'tags']);
    expect(boardCardFields({ ...configured, laneField: 'property:Stars' }, properties)).toEqual([
      'pdf',
      'property:Stage',
      'tags',
    ]);
    expect(boardCardFields({ ...configured, cardFields: [] }, properties)).toEqual([]);
  });
});

describe('board lanes', () => {
  it('preserves lane and row order, with collision-free IDs and read-only legacy targets', () => {
    const property = { ...status, options: ['Done', 'In progress', 'null', '__proto__'] };
    const rows = [
      row(4, 'Stage: Legacy B'),
      row(3, 'Stage: Done'),
      row(6, 'Stage: null'),
      row(2, 'Stage: Legacy A'),
      row(7),
      row(1, 'Stage: Unknown\nStage: Done'),
      row(5, 'Stage: Legacy B'),
    ];
    const lanes = boardLanes(rows, property, {
      ...defaultBoardSettings([property]),
      collapsedLanes: ['null', '"In progress"', '"Legacy B"'],
    });
    expect(
      lanes.map(({ id, value, rows, collapsed, writable }) => [
        id,
        value,
        rows.map(({ id }) => id),
        collapsed,
        writable,
      ]),
    ).toEqual([
      ['null', null, [7], true, true],
      ['"Done"', 'Done', [3, 1], false, true],
      ['"In progress"', 'In progress', [], true, true],
      ['"null"', 'null', [6], false, true],
      ['"__proto__"', '__proto__', [], false, true],
      ['"Legacy B"', 'Legacy B', [4, 5], true, false],
      ['"Legacy A"', 'Legacy A', [2], false, false],
    ]);
  });

  it('uses descending 1–5 rating targets and routes out-of-range values to unset', () => {
    const rows = [row(1, 'Stars: 1'), row(2, 'Stars: 8'), row(3, 'Stars: 5'), row(4)];
    const settings = defaultBoardSettings([stars]);
    const lanes = boardLanes(rows, stars, settings);
    expect(
      lanes.map(({ value, rows, writable }) => [value, rows.map(({ id }) => id), writable]),
    ).toEqual([
      [null, [2, 4], true],
      ['5', [3], true],
      ['4', [], true],
      ['3', [], true],
      ['2', [], true],
      ['1', [1], true],
    ]);
  });

  it('hides only empty lanes, without losing a nonempty collapsed or legacy lane', () => {
    const settings: BoardSettings = {
      ...defaultBoardSettings([status]),
      hideEmptyLanes: true,
      collapsedLanes: ['"In progress"', '"Legacy"'],
    };
    expect(boardLanes([], status, settings)).toEqual([]);
    const rows = [row(1, 'Stage: Done'), row(2, 'Stage: Legacy')];
    const visible = boardLanes(rows, status, settings);
    expect(visible.map(({ value, collapsed }) => [value, collapsed])).toEqual([
      ['Done', false],
      ['Legacy', true],
    ]);
    const expanded = boardLanes(rows, status, { ...settings, hideEmptyLanes: false });
    expect(expanded.map(({ value, collapsed }) => [value, collapsed])).toEqual([
      [null, false],
      ['In progress', true],
      ['Done', false],
      ['Legacy', true],
    ]);
  });
});
