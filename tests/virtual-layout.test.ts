import { describe, expect, it } from 'vitest';
import type { Row } from '../src/contracts';
import type { RowGroup } from '../src/grouping';
import { flattenRows, VirtualLayout } from '../src/virtual-layout';

const unfolded = new Set<RowGroup['value']>();

function row(id: number): Row {
  return {
    id,
    writable: true,
    title: `Item ${id}`,
    creators: '',
    year: '',
    source: '',
    type: '',
    tags: [],
    pdf: false,
    added: '',
    extra: '',
  };
}

function items(...ids: number[]) {
  return flattenRows(ids.map(row), undefined, unfolded);
}

function prefixes(layout: VirtualLayout, length: number): number[] {
  return Array.from({ length: length + 1 }, (_, index) => layout.offset(index));
}

describe('flattenRows', () => {
  it('preserves the incoming item order when grouping is unavailable', () => {
    const first = row(9);
    const second = row(2);
    const entries = flattenRows([first, second], undefined, unfolded);
    expect(entries).toEqual([
      { kind: 'item', key: 'item:9', row: first },
      { kind: 'item', key: 'item:2', row: second },
    ]);
    expect(entries[0]?.kind === 'item' && entries[0].row).toBe(first);
  });

  it('emits distinct typed group keys and only hides children of the folded group', () => {
    const first = row(4);
    const second = row(7);
    const third = row(6);
    const groups = [
      { value: false, rows: [second] },
      { value: 'false', rows: [first, third] },
      { value: null, rows: [] },
    ];
    const entries = flattenRows([first, second, third], groups, new Set([false]));
    expect(entries).toEqual([
      { kind: 'group', key: 'group:false', group: groups[0], folded: true },
      { kind: 'group', key: 'group:"false"', group: groups[1], folded: false },
      { kind: 'item', key: 'item:4', row: first },
      { kind: 'item', key: 'item:6', row: third },
      { kind: 'group', key: 'group:null', group: groups[2], folded: false },
    ]);
  });
});

describe('VirtualLayout', () => {
  it('returns empty geometry and missing indices with no entries', () => {
    const layout = new VirtualLayout();
    layout.setDensity('wrap');
    expect(layout.indexOf('item:1')).toBe(-1);
    expect(layout.indexAt(20)).toBe(-1);
    expect(layout.offset(0)).toBe(0);
    expect(layout.totalHeight).toBe(0);
    expect(layout.measure(0, 50)).toBe(false);
    expect(layout.window(20, 100, 20)).toEqual({ start: 0, end: 0, top: 0, bottom: 0 });
  });

  it('uses one fixed height for headers and items, with density defaults and calibration', () => {
    const layout = new VirtualLayout();
    const rows = [row(10), row(20)];
    layout.replace(flattenRows(rows, [{ value: 'label', rows }], unfolded));
    expect(layout.indexOf('group:"label"')).toBe(0);
    expect(layout.indexOf('item:20')).toBe(2);
    expect(prefixes(layout, 3)).toEqual([0, 34, 68, 102]);
    expect(layout.measure(0, 40)).toBe(false);

    layout.setDensity('comfortable');
    expect(prefixes(layout, 3)).toEqual([0, 42, 84, 126]);
    expect(layout.setFixedHeight(43.5)).toBe(true);
    expect(layout.setFixedHeight(43.5)).toBe(false);
    expect(layout.setFixedHeight(0)).toBe(false);
    expect(layout.setFixedHeight(Infinity)).toBe(false);
    layout.setDensity('comfortable');
    expect(prefixes(layout, 3)).toEqual([0, 43.5, 87, 130.5]);
    layout.setDensity('compact');
    expect(layout.totalHeight).toBe(102);
  });

  it('selects a half-open pixel window, with pixel overscan and clamped lookup', () => {
    const layout = new VirtualLayout();
    layout.replace(items(10, 20, 30, 40, 50));
    expect(layout.indexAt(-10)).toBe(0);
    expect(layout.indexAt(33.9)).toBe(0);
    expect(layout.indexAt(34)).toBe(1);
    expect(layout.indexAt(170)).toBe(4);
    expect(layout.indexAt(200)).toBe(4);
    expect(layout.window(34, 68)).toEqual({ start: 1, end: 3, top: 34, bottom: 68 });
    expect(layout.window(35, 66)).toEqual({ start: 1, end: 3, top: 34, bottom: 68 });
    expect(layout.window(35, 66, 2)).toEqual({ start: 0, end: 4, top: 0, bottom: 34 });
    expect(layout.window(-10, 34)).toEqual({ start: 0, end: 1, top: 0, bottom: 136 });
    expect(layout.window(150, 100)).toEqual({ start: 4, end: 5, top: 136, bottom: 0 });
    expect(layout.window(34, 0)).toEqual({ start: 1, end: 1, top: 34, bottom: 136 });
    expect(layout.setFixedHeight(0.7)).toBe(true);
    expect(layout.indexAt(layout.offset(3))).toBe(3);
  });

  it('updates wrapped prefixes and searches using measured heights and stable estimates', () => {
    const layout = new VirtualLayout();
    layout.replace(items(1, 2, 3, 4, 5));
    layout.setDensity('wrap');
    expect(layout.setFixedHeight(60)).toBe(false);
    expect(prefixes(layout, 5)).toEqual([0, 34, 68, 102, 136, 170]);
    expect(layout.measure(0, 70.5)).toBe(true);
    expect(layout.measure(0, 70.5)).toBe(false);
    expect(layout.measure(2, 12.25)).toBe(true);
    expect(layout.measure(2, Number.NaN)).toBe(false);
    expect(layout.measure(2, Infinity)).toBe(false);
    expect(layout.measure(2, 0)).toBe(false);
    expect(layout.measure(2, -20)).toBe(false);
    expect(layout.measure(5, 50)).toBe(false);
    expect(prefixes(layout, 5)).toEqual([0, 70.5, 104.5, 116.75, 150.75, 184.75]);
    expect(layout.totalHeight).toBe(184.75);
    expect(layout.indexAt(70.499)).toBe(0);
    expect(layout.indexAt(70.5)).toBe(1);
    expect(layout.indexAt(116.75)).toBe(3);
    expect(layout.indexAt(184.75)).toBe(4);
    expect(layout.window(70.5, 46.25)).toEqual({ start: 1, end: 3, top: 70.5, bottom: 68 });
  });

  it('keeps fractional boundaries aligned and drops removed heights on replacement', () => {
    const layout = new VirtualLayout();
    const entries = items(1, 2, 3, 4, 5, 6, 7);
    layout.setDensity('wrap');
    layout.replace(entries);
    const heights = [34.1, 68.2, 19.3, 28.4, 58.5, 60.6, 70.7];
    for (let index = 0; index < entries.length; index++) {
      layout.measure(index, heights[index]!);
      expect(layout.indexAt(layout.offset(index))).toBe(index);
    }
    layout.replace(entries.slice(0, 5));
    expect(layout.indexOf('item:6')).toBe(-1);
    expect(layout.totalHeight).toBeCloseTo(208.5);
    expect(layout.indexAt(220)).toBe(4);
    layout.replace([]);
    expect(layout.totalHeight).toBe(0);
    expect(layout.indexAt(0)).toBe(-1);
  });

  it('reuses item heights across folding, filtering, and sorting, but not changed content', () => {
    const layout = new VirtualLayout();
    const [a, b, c] = [row(1), row(2), row(3)] as const;
    const rows = [a, b, c];
    const groups = [
      { value: 'A', rows: [a, b] },
      { value: 'B', rows: [c] },
    ];
    layout.setDensity('wrap');
    layout.replace(flattenRows(rows, groups, unfolded));
    expect(layout.measure(layout.indexOf('group:"A"'), 62)).toBe(true);
    expect(layout.measure(layout.indexOf('item:1'), 100)).toBe(true);
    expect(layout.measure(layout.indexOf('item:2'), 45)).toBe(true);
    expect(layout.measure(layout.indexOf('item:3'), 66)).toBe(true);
    expect(layout.totalHeight).toBe(307);

    const folded = new Set(['A']);
    layout.replace(flattenRows(rows, groups, folded));
    expect(layout.indexOf('item:1')).toBe(-1);
    expect(layout.totalHeight).toBe(134);
    expect(layout.measure(layout.indexOf('group:"A"'), 51)).toBe(true);
    layout.replace(flattenRows(rows, groups, unfolded));
    expect(layout.totalHeight).toBe(307);
    layout.replace(flattenRows(rows, groups, folded));
    expect(layout.totalHeight).toBe(151);

    // Search/filter omits item 2; sorting moves the remaining items without changing their content.
    layout.replace(flattenRows([c, a], undefined, unfolded));
    expect(layout.indexOf('item:2')).toBe(-1);
    expect(layout.indexOf('item:1')).toBe(1);
    expect(prefixes(layout, 2)).toEqual([0, 66, 166]);
    layout.replace(flattenRows([b, { ...a, title: 'Changed title' }, c], undefined, unfolded));
    expect(prefixes(layout, 3)).toEqual([0, 45, 79, 145]);
  });

  it('discards wrap measurements when explicitly invalidated or changing density', () => {
    const layout = new VirtualLayout();
    const rows = [row(1)];
    layout.setDensity('wrap');
    layout.replace(flattenRows(rows, [{ value: true, rows }], unfolded));
    expect(layout.measure(0, 72)).toBe(true);
    expect(layout.measure(1, 82)).toBe(true);
    layout.setDensity('wrap');
    expect(layout.totalHeight).toBe(154);

    layout.clearMeasurements();
    expect(prefixes(layout, 2)).toEqual([0, 34, 68]);
    expect(layout.measure(1, 99)).toBe(true);
    layout.setDensity('comfortable');
    expect(layout.totalHeight).toBe(84);
    layout.setDensity('wrap');
    expect(prefixes(layout, 2)).toEqual([0, 34, 68]);
  });
});
