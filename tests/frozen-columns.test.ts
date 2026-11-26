import { describe, expect, it } from 'vitest';
import { frozenColumns, horizontalReveal } from '../src/frozen-columns';

describe('frozenColumns', () => {
  it('includes the checkbox and cumulative offsets for requested data columns', () => {
    expect(frozenColumns([32, 100, 150, 200], 2, 1000)).toEqual({
      count: 3,
      width: 282,
      offsets: [0, 32, 132],
    });
  });

  it('stops at the first column that would exceed 70% of the viewport', () => {
    expect(frozenColumns([30, 100, 80, 10], 3, 300)).toEqual({
      count: 3,
      width: 210,
      offsets: [0, 30, 130],
    });
    expect(frozenColumns([30, 100, 81, 10], 3, 300)).toEqual({
      count: 2,
      width: 130,
      offsets: [0, 30],
    });
  });

  it('does not freeze the checkbox alone when the first data column does not fit', () => {
    expect(frozenColumns([30, 111, 1], 2, 200)).toEqual({
      count: 0,
      width: 0,
      offsets: [],
    });
  });

  it('preserves fractional measurements without rounding offsets or the cap', () => {
    expect(frozenColumns([20.25, 30.5, 19.25, 0.01], 3, 100)).toEqual({
      count: 3,
      width: 70,
      offsets: [0, 20.25, 50.75],
    });
  });

  it('limits the result to visible columns and whole requested data columns', () => {
    expect(frozenColumns([20, 30, 40], 10, 1000)).toEqual({
      count: 3,
      width: 90,
      offsets: [0, 20, 50],
    });
    expect(frozenColumns([20, 30, 40], 1.9, 1000)).toEqual({
      count: 2,
      width: 50,
      offsets: [0, 20],
    });
  });

  it('disables freezing for old or empty views, zero requests, and zero viewport width', () => {
    const empty = { count: 0, width: 0, offsets: [] };
    expect(frozenColumns([], 2, 300)).toEqual(empty);
    expect(frozenColumns([30], 2, 300)).toEqual(empty);
    expect(frozenColumns([30, 100], 0, 300)).toEqual(empty);
    expect(frozenColumns([30, 100], 2, 0)).toEqual(empty);
    expect(frozenColumns([30, 100], undefined as unknown as number, 300)).toEqual(empty);
  });

  it('allows zero-width columns while rejecting unusable measurements', () => {
    expect(frozenColumns([0, 0, 10], 2, 100)).toEqual({
      count: 3,
      width: 10,
      offsets: [0, 0, 0],
    });
    expect(frozenColumns([20, 30, Number.NaN, 10], 3, 1000)).toEqual({
      count: 2,
      width: 50,
      offsets: [0, 20],
    });
    expect(frozenColumns([-1, 30], 1, 100)).toEqual({ count: 0, width: 0, offsets: [] });
  });
});

describe('horizontalReveal', () => {
  it('returns zero for a cell already visible, including at the edges', () => {
    expect(horizontalReveal(100, 200, 100, 200)).toBe(0);
    expect(horizontalReveal(120, 180, 100, 200)).toBe(0);
  });

  it('returns physical deltas for either clipped edge', () => {
    expect(horizontalReveal(80, 130, 100, 200)).toBe(-20);
    expect(horizontalReveal(170, 220, 100, 200)).toBe(20);
  });

  it('aligns an oversized cell to the visible left edge without oscillating', () => {
    expect(horizontalReveal(120, 270, 100, 200)).toBe(20);
    expect(horizontalReveal(80, 230, 100, 200)).toBe(-20);
    expect(horizontalReveal(100, 250, 100, 200)).toBe(0);
  });

  it('supports logical-start alignment with caller-reflected RTL bounds', () => {
    // Physical cell [100, 250] and viewport [100, 200], reflected around zero.
    const logicalDelta = horizontalReveal(-250, -100, -200, -100);
    expect(logicalDelta).toBe(-50);
    expect(-logicalDelta).toBe(50);
    expect(horizontalReveal(-200, -50, -200, -100)).toBe(0);
  });
});
