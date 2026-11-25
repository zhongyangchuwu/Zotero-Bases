export type FrozenColumns = {
  count: number;
  width: number;
  offsets: readonly number[];
};

/** Calculate the contiguous columns that fit within 70% of the viewport. */
export function frozenColumns(
  widths: readonly number[],
  requested: number,
  viewportWidth: number,
): FrozenColumns {
  const empty = { count: 0, width: 0, offsets: [] };
  const checkboxWidth = widths[0];
  if (
    widths.length < 2 ||
    !Number.isFinite(requested) ||
    requested < 1 ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    checkboxWidth === undefined ||
    !Number.isFinite(checkboxWidth) ||
    checkboxWidth < 0
  )
    return empty;

  const limit = viewportWidth * 0.7;
  const last = Math.min(Math.floor(requested), widths.length - 1);
  const offsets = [0];
  let width = checkboxWidth;
  for (let index = 1; index <= last; index++) {
    const columnWidth = widths[index]!;
    if (!Number.isFinite(columnWidth) || columnWidth < 0 || width + columnWidth > limit) break;
    offsets.push(width);
    width += columnWidth;
  }

  // The checkbox is never frozen on its own.
  return offsets.length > 1 ? { count: offsets.length, width, offsets } : empty;
}

/** Return the horizontal scroll delta in the same coordinate system as the bounds. */
export function horizontalReveal(
  cellLeft: number,
  cellRight: number,
  visibleLeft: number,
  visibleRight: number,
): number {
  if (cellRight - cellLeft > visibleRight - visibleLeft || cellLeft < visibleLeft)
    return cellLeft - visibleLeft;
  if (cellRight > visibleRight) return cellRight - visibleRight;
  return 0;
}
