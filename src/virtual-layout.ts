import type { Density, Row } from './contracts';
import type { RowGroup } from './grouping';

export type VirtualRow =
  | { kind: 'item'; key: string; row: Row }
  | { kind: 'group'; key: string; group: RowGroup; folded: boolean };

export function flattenRows(
  rows: readonly Row[],
  groups: readonly RowGroup[] | undefined,
  folded: ReadonlySet<RowGroup['value']>,
): VirtualRow[] {
  const entries: VirtualRow[] = [];
  if (groups) {
    for (const group of groups) {
      const isFolded = folded.has(group.value);
      entries.push({
        kind: 'group',
        key: `group:${JSON.stringify(group.value)}`,
        group,
        folded: isFolded,
      });
      if (!isFolded) {
        for (const row of group.rows) entries.push({ kind: 'item', key: `item:${row.id}`, row });
      }
    }
  } else {
    for (const row of rows) entries.push({ kind: 'item', key: `item:${row.id}`, row });
  }
  return entries;
}

const COMPACT_HEIGHT = 34;
const COMFORTABLE_HEIGHT = 42;

export class VirtualLayout {
  private entries: readonly VirtualRow[] = [];
  private readonly indices = new Map<string, number>();
  private density: Density = 'compact';
  private rowHeight = COMPACT_HEIGHT;
  private fixedHeight = COMPACT_HEIGHT;
  // Rows carry immutable content. Weak keys retain measurements while the catalog owns the
  // rows, including filtered and folded rows, without keeping replaced content alive.
  private itemHeights = new WeakMap<Row, number>();
  private groupHeights = new WeakMap<RowGroup, { open?: number; folded?: number }>();
  // Wrap uses a segment tree: leaves hold heights, parents hold sums. Rebuild is O(n);
  // updates, prefix offsets, and offset searches are O(log n). Fixed mode needs no tree.
  private sums: Float64Array | undefined;

  replace(entries: readonly VirtualRow[]): void {
    this.entries = entries;
    this.indices.clear();
    for (let index = 0; index < entries.length; index++)
      this.indices.set(entries[index]!.key, index);
    this.rebuildSums();
  }

  setDensity(density: Density): void {
    if (density === this.density) return;
    this.density = density;
    this.rowHeight = density === 'comfortable' ? COMFORTABLE_HEIGHT : COMPACT_HEIGHT;
    this.fixedHeight = this.rowHeight;
    this.clearMeasurements();
  }

  setRowHeight(height: number): boolean {
    if (!Number.isFinite(height) || height <= 0 || height === this.rowHeight) return false;
    this.rowHeight = this.fixedHeight = height;
    if (this.density === 'wrap') this.clearMeasurements();
    return true;
  }

  setFixedHeight(height: number): boolean {
    if (
      this.density === 'wrap' ||
      !Number.isFinite(height) ||
      height <= 0 ||
      height === this.fixedHeight
    ) {
      return false;
    }
    this.fixedHeight = height;
    return true;
  }

  clearMeasurements(): void {
    this.itemHeights = new WeakMap();
    this.groupHeights = new WeakMap();
    this.rebuildSums();
  }

  indexOf(key: string): number {
    return this.indices.get(key) ?? -1;
  }

  indexAt(offset: number): number {
    const length = this.entries.length;
    if (length === 0) return -1;
    if (offset <= 0) return 0;
    if (offset >= this.totalHeight) return length - 1;

    const sums = this.sums;
    if (!sums) {
      const index = Math.floor(offset / this.fixedHeight);
      // Fractional CSS heights may round differently in division and multiplication.
      if (index * this.fixedHeight > offset) return index - 1;
      if ((index + 1) * this.fixedHeight <= offset) return index + 1;
      return index;
    }

    const firstLeaf = sums.length / 2;
    let node = 1;
    let top = 0;
    while (node < firstLeaf) {
      node *= 2;
      const rightTop = top + sums[node]!;
      if (rightTop <= offset) {
        top = rightTop;
        node++;
      }
    }
    return node - firstLeaf;
  }

  offset(index: number): number {
    if (index <= 0) return 0;
    if (index >= this.entries.length) return this.totalHeight;
    const sums = this.sums;
    if (!sums) return index * this.fixedHeight;

    let node = 1;
    let top = 0;
    // Accumulate from left to right in the same order as indexAt, including fractional heights.
    for (let half = sums.length / 4; half >= 1; half /= 2) {
      node *= 2;
      if (index >= half) {
        index -= half;
        top += sums[node]!;
        node++;
      }
    }
    return top;
  }

  measure(index: number, height: number): boolean {
    const sums = this.sums;
    const entry = this.entries[index];
    if (!sums || !entry || !Number.isFinite(height) || height <= 0) return false;
    let node = sums.length / 2 + index;
    if (sums[node] === height) return false;

    if (entry.kind === 'item') this.itemHeights.set(entry.row, height);
    else {
      let heights = this.groupHeights.get(entry.group);
      if (!heights) {
        heights = {};
        this.groupHeights.set(entry.group, heights);
      }
      heights[entry.folded ? 'folded' : 'open'] = height;
    }

    sums[node] = height;
    while (node > 1) {
      node = Math.floor(node / 2);
      sums[node] = sums[node * 2]! + sums[node * 2 + 1]!;
    }
    return true;
  }

  /** Half-open row range intersecting the viewport plus optional pixel overscan. */
  window(
    scrollTop: number,
    height: number,
    overscan = 0,
  ): { start: number; end: number; top: number; bottom: number } {
    const total = this.totalHeight;
    const length = this.entries.length;
    const visibleTop = Math.max(0, Math.min(scrollTop, total));
    const margin = Math.max(0, overscan);
    const from = Math.max(0, visibleTop - margin);
    const to = Math.min(total, visibleTop + Math.max(0, height) + margin);
    const start = from < total ? this.indexAt(from) : length;
    let end = start;
    if (to > from) {
      if (to === total) end = length;
      else {
        const last = this.indexAt(to);
        end = this.offset(last) === to ? last : last + 1;
      }
    }
    return { start, end, top: this.offset(start), bottom: total - this.offset(end) };
  }

  get totalHeight(): number {
    return this.sums ? this.sums[1]! : this.entries.length * this.fixedHeight;
  }

  private rebuildSums(): void {
    const { entries } = this;
    if (this.density !== 'wrap' || entries.length === 0) {
      this.sums = undefined;
      return;
    }

    let firstLeaf = 1;
    while (firstLeaf < entries.length) firstLeaf *= 2;
    const sums = this.sums?.length === firstLeaf * 2 ? this.sums : new Float64Array(firstLeaf * 2);
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      const measured =
        entry.kind === 'item'
          ? this.itemHeights.get(entry.row)
          : this.groupHeights.get(entry.group)?.[entry.folded ? 'folded' : 'open'];
      sums[firstLeaf + index] = measured ?? this.rowHeight;
    }
    sums.fill(0, firstLeaf + entries.length);
    for (let node = firstLeaf - 1; node > 0; node--) {
      sums[node] = sums[node * 2]! + sums[node * 2 + 1]!;
    }
    this.sums = sums;
  }
}
