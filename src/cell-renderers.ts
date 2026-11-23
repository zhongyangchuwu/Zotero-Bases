import type { Column, NativeColumn, Property, PropertyType, PropertyValue, Row } from './contracts';
import type { GlobalPreferences } from './global-preferences';

export interface CellActions {
  open(row: Row, pdf: boolean): void;
  authorFormat?: () => GlobalPreferences['authorFormat'];
  toggle(row: Row, property: Property, checked: boolean): void;
  edit(
    row: Row,
    column: Column,
    property: Property | undefined,
    value: PropertyValue,
    cell: HTMLTableCellElement,
    opener: HTMLButtonElement,
  ): void;
  columnName(column: Column): string;
  text(key: 'yes' | 'no' | 'locate' | 'openPDF' | 'readOnly' | 'edit' | 'untitled'): string;
}

interface Cell {
  readonly row: Row;
  readonly column: Column;
  readonly value: PropertyValue;
  readonly cell: HTMLTableCellElement;
}

interface PillFit {
  readonly more: HTMLElement;
  readonly count: number;
  readonly gap: number;
  readonly available: number;
  last: Element | null;
  visible: number;
  used: number;
}

const CHOICE_TONES = ['sky', 'violet', 'teal', 'rose'] as const;

function choiceTone(value: string): string {
  const key = value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  switch (key) {
    case 'done':
    case 'completed':
    case 'read':
    case '完成':
    case '已完成':
    case '已读':
      return 'green';
    case 'reading':
    case 'in progress':
    case 'in review':
    case '在读':
    case '进行中':
    case '审阅中':
      return 'amber';
    case 'unread':
    case 'to read':
    case '未读':
    case '待读':
      return 'neutral';
  }
  // Derive other colors from the label, so filtering and option order never change them.
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash, 31) + key.charCodeAt(i);
  return CHOICE_TONES[(hash >>> 0) % CHOICE_TONES.length]!;
}

function fitPills(table: HTMLTableElement): void {
  const strips = table.querySelectorAll<HTMLElement>('.zb-cell-pills');
  const wrap = Boolean(table.closest('.zb-workspace[data-density="wrap"]'));
  for (const strip of strips) {
    if (!wrap && strip.parentElement?.hidden) continue;
    const more = strip.lastElementChild as HTMLElement;
    if (more.hidden) continue;
    more.hidden = true;
    more.textContent = '';
    for (
      let pill = more.previousElementSibling as HTMLElement | null;
      pill?.hidden;
      pill = pill.previousElementSibling as HTMLElement | null
    ) {
      pill.hidden = false;
    }
  }

  const view = table.ownerDocument.defaultView;
  if (wrap || !view) return;
  const clipped: PillFit[] = [];
  for (const strip of strips) {
    if (strip.parentElement?.hidden) continue;
    const available = strip.getBoundingClientRect().width;
    if (!available) continue;
    const gap = Number.parseFloat(view.getComputedStyle(strip).columnGap) || 0;
    const more = strip.lastElementChild as HTMLElement;
    const count = strip.children.length - 1;
    let visible = 0;
    let used = 0;
    let last: Element | null = null;
    for (const pill of strip.children) {
      if (pill === more) break;
      const next = used + (last ? gap : 0) + pill.getBoundingClientRect().width;
      if (next > available) break;
      used = next;
      last = pill;
      visible++;
    }
    if (visible < count) clipped.push({ more, count, gap, available, last, visible, used });
  }

  // Write labels before measuring them so layouts are batched across the table.
  // Measure the actual count because its width can change as pills are removed.
  let candidates = clipped;
  while (candidates.length) {
    for (const fit of candidates) {
      fit.more.textContent = `+${fit.count - fit.visible}`;
      fit.more.hidden = false;
    }
    const retry: PillFit[] = [];
    for (const fit of candidates) {
      const last = fit.last;
      if (!last || fit.used + fit.gap + fit.more.getBoundingClientRect().width <= fit.available)
        continue;
      fit.last = last.previousElementSibling;
      fit.used -= last.getBoundingClientRect().width + (fit.last ? fit.gap : 0);
      fit.visible--;
      retry.push(fit);
    }
    candidates = retry;
  }
  for (const { more, last } of clipped) {
    for (let pill = more.previousElementSibling; pill && pill !== last; ) {
      (pill as HTMLElement).hidden = true;
      pill = pill.previousElementSibling;
    }
  }
}

export function createCellRenderers(document: Document, actions: CellActions) {
  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = '',
    text = '',
  ): HTMLElementTagNameMap[K] {
    const node = document.createElementNS(
      'http://www.w3.org/1999/xhtml',
      tag,
    ) as HTMLElementTagNameMap[K];
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function valueText(value: PropertyValue): string {
    if (typeof value === 'boolean') return actions.text(value ? 'yes' : 'no');
    if (typeof value === 'string') return value || '—';
    return value?.length ? value.join('; ') : '—';
  }

  function rowName(row: Row): string {
    return row.title || actions.text('untitled');
  }

  function control(node: HTMLElement, { row, column }: Cell): void {
    node.dataset.column = column;
    node.dataset.focus = `cell:${row.id}:${column}`;
  }

  function button(context: Cell, run: () => void, extraClass = ''): HTMLButtonElement {
    const node = element('button', extraClass ? `zb-cell-button ${extraClass}` : 'zb-cell-button');
    node.type = 'button';
    control(node, context);
    node.addEventListener('click', run);
    return node;
  }

  function named(node: HTMLElement, label: string): void {
    node.setAttribute('aria-label', label);
    node.title = label;
  }

  function editLabel({ row, column }: Cell): string {
    return `${actions.text('edit')} · ${actions.columnName(column)} · ${rowName(row)}`;
  }

  function plain({ cell, value }: Cell): void {
    cell.textContent = valueText(value);
    if (typeof value === 'string') cell.title = value;
  }

  function readOnly(context: Cell): void {
    plain(context);
    context.cell.title = actions.text('readOnly');
  }

  function editable(context: Cell, property?: Property, pills?: readonly string[]): void {
    const { row, column, value, cell } = context;
    const fullText = valueText(value);
    let content: HTMLElement = cell;
    if (row.writable) {
      const opener = button(context, () =>
        actions.edit(row, column, property, value, cell, opener),
      );
      named(opener, `${editLabel(context)}: ${fullText}`);
      cell.append(opener);
      content = opener;
    } else {
      cell.title = actions.text('readOnly');
    }
    if (!pills?.length) {
      content.textContent = fullText;
      return;
    }
    const strip = element('span', 'zb-cell-pills');
    if (!row.writable) strip.title = `${fullText} · ${cell.title}`;
    for (const label of pills) {
      const pill = element('span', 'zb-cell-pill', label);
      if (property) pill.dataset.tone = choiceTone(label);
      strip.append(pill);
    }
    const more = element('span', 'zb-cell-pill zb-cell-pill-more');
    more.hidden = true;
    strip.append(more);
    content.append(strip);
  }

  function editList(context: Cell, property?: Property): void {
    const { value } = context;
    editable(context, property, value !== null && typeof value === 'object' ? value : undefined);
  }

  const native: Record<NativeColumn, (context: Cell) => void> = {
    title(context) {
      const title = button(context, () => actions.open(context.row, false), 'zb-item-title');
      title.textContent = rowName(context.row);
      title.title = `${rowName(context.row)} · ${actions.text('locate')}`;
      context.cell.append(title);
    },
    creators({ cell, row }) {
      const full = row.creators;
      const first = full.indexOf('; ');
      cell.textContent =
        actions.authorFormat?.() !== 'singleLine' &&
        first !== -1 &&
        full.indexOf('; ', first + 2) !== -1
          ? `${full.slice(0, first)} et al.`
          : valueText(full);
      cell.title = full;
    },
    year(context) {
      context.cell.classList.add('zb-cell-number');
      plain(context);
    },
    source: plain,
    type({ cell, value }) {
      if (typeof value === 'string' && value) cell.append(element('span', 'zb-type-badge', value));
      else cell.textContent = valueText(value);
      if (typeof value === 'string') cell.title = value;
    },
    tags: editList,
    pdf(context) {
      if (context.value !== true) return;
      const pdf = button(context, () => actions.open(context.row, true), 'zb-pdf-button');
      named(pdf, `${actions.text('openPDF')} · ${rowName(context.row)}`);
      const mark = element('span', 'zb-pdf-mark');
      mark.setAttribute('aria-hidden', 'true');
      pdf.append(mark);
      context.cell.append(pdf);
    },
    added(context) {
      const { cell, value } = context;
      if (typeof value !== 'string' || !value) return plain(context);
      cell.textContent = /^\d{4}-\d{2}-\d{2}(?=$|[ T])/u.exec(value)?.[0] ?? value;
      cell.title = value;
    },
  };

  const custom: Record<PropertyType, (context: Cell, property: Property) => void> = {
    text: editable,
    number(context, property) {
      context.cell.classList.add('zb-cell-number');
      editable(context, property);
    },
    checkbox(context, property) {
      const { row, cell, value } = context;
      if (!row.writable) return readOnly(context);
      const check = element('input');
      check.type = 'checkbox';
      check.checked = value === true;
      named(check, editLabel(context));
      control(check, context);
      check.addEventListener('change', () => actions.toggle(row, property, check.checked));
      check.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        check.click();
      });
      cell.append(check);
    },
    'single-select'(context, property) {
      const value = context.value;
      editable(context, property, typeof value === 'string' && value ? [value] : undefined);
    },
    'multi-select': editList,
  };

  function render(
    row: Row,
    column: Column,
    property: Property | undefined,
    value: PropertyValue,
  ): HTMLTableCellElement {
    const cell = element('td');
    cell.dataset.column = column;
    const context: Cell = { row, column, value, cell };
    if (column.startsWith('property:')) {
      if (property) custom[property.type](context, property);
      else plain(context);
    } else {
      native[column as NativeColumn](context);
    }
    return cell;
  }

  return { render, fitPills };
}
