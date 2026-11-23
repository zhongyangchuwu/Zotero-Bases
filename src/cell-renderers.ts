import {
  NATIVE_COLUMN_BY_KEY,
  isNativeColumn,
  type Column,
  type NativeColumn,
  type NativeValueType,
  type Property,
  type PropertyType,
  type PropertyValue,
  type Row,
} from './contracts';
import type { GlobalPreferences } from './global-preferences';
import { dateDay } from './query';

export interface CellActions {
  open(row: Row, pdf: boolean): void;
  linkActions?: { open(url: string): void; copy(text: string): void };
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
  text(
    key:
      | 'yes'
      | 'no'
      | 'locate'
      | 'open'
      | 'openPDF'
      | 'openLink'
      | 'copyDOI'
      | 'readOnly'
      | 'edit'
      | 'untitled',
  ): string;
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

function webURL(value: string): URL | undefined {
  const input = value.trim();
  // Do not let WHATWG recovery turn missing slashes, backslashes, or an empty host into a link.
  const authority = /^https?:\/\/([^/?#\\\s]+)/iu.exec(input)?.[1];
  if (!authority || authority.includes('@') || /[\r\n\t\\]/u.test(input)) return;
  try {
    const url = new URL(input);
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname &&
      !url.username &&
      !url.password
    )
      return url;
  } catch {
    // An invalid field remains plain text.
  }
}

function doiLink(value: string): { doi: string; url: string } | undefined {
  let doi = value.trim().replace(/^(?:info:)?doi:\s*/iu, '');
  try {
    if (/^https?:/iu.test(doi)) {
      const resolver = webURL(doi);
      if (
        !resolver ||
        resolver.port ||
        (resolver.hostname !== 'doi.org' && resolver.hostname !== 'dx.doi.org')
      )
        return;
      doi = decodeURIComponent(resolver.pathname.slice(1));
    }
    if (!/^10\.\d+(?:\.\d+)*\/\S+$/u.test(doi)) return;
    // DOI resolver path: encode URL delimiters and stop dot segments being normalized away.
    const path = encodeURIComponent(doi)
      .replace(/%2F/gu, '/')
      .replace(/\/(?=\.{1,2}(?:\/|$))/gu, '%2F');
    return { doi, url: `https://doi.org/${path}` };
  } catch {
    // Malformed percent escapes or invalid Unicode cannot yield a resolver URL.
  }
}

function publicationDate(value: string): string {
  // Zotero stores a sortable prefix before the original date text. SQL times are not multipart.
  const original = /^\d{4}-(?:0\d|1[0-2])-(?:[0-2]\d|3[01]) (.+)$/su.exec(value)?.[1];
  return original && !/^\d{1,2}:\d{2}/u.test(original) ? original : value;
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
    if (typeof value === 'string') return value;
    return value?.length ? value.join('; ') : '';
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
      named(opener, fullText ? `${editLabel(context)}: ${fullText}` : editLabel(context));
      cell.append(opener);
      content = opener;
    } else {
      cell.title = actions.text('readOnly');
    }
    if (!pills?.length) {
      content.textContent = fullText;
      return;
    }
    const strip = pillStrip(pills, property);
    if (!row.writable) strip.title = `${fullText} · ${cell.title}`;
    content.append(strip);
  }

  function pillStrip(
    pills: readonly string[],
    property?: Property,
    fullTitle?: string,
  ): HTMLElement {
    const strip = element('span', 'zb-cell-pills');
    if (fullTitle) strip.title = fullTitle;
    for (const label of pills) {
      const pill = element('span', 'zb-cell-pill', label);
      if (fullTitle) pill.title = label;
      if (property) {
        const colors = property.optionColors;
        pill.dataset.tone =
          (colors && Object.prototype.hasOwnProperty.call(colors, label)
            ? colors[label]
            : undefined) ?? choiceTone(label);
      }
      strip.append(pill);
    }
    const more = element('span', 'zb-cell-pill zb-cell-pill-more');
    if (fullTitle) more.title = fullTitle;
    more.hidden = true;
    strip.append(more);
    return strip;
  }

  function editList(context: Cell, property?: Property): void {
    const { value } = context;
    editable(context, property, value !== null && typeof value === 'object' ? value : undefined);
  }

  const native: Partial<Record<NativeColumn, (context: Cell) => void>> = {
    title(context) {
      const title = button(context, () => actions.open(context.row, false), 'zb-item-title');
      title.textContent = rowName(context.row);
      title.title = `${rowName(context.row)} · ${actions.text('locate')}`;
      const actionsBox = element('span', 'zb-title-actions');
      const open = element('button', 'zb-title-action', actions.text('open'));
      open.type = 'button';
      named(open, `${actions.text('open')} · ${rowName(context.row)}`);
      open.addEventListener('click', () => actions.open(context.row, false));
      actionsBox.append(open);
      if (context.row.pdf) {
        const pdf = element('button', 'zb-title-action', actions.text('openPDF'));
        pdf.type = 'button';
        named(pdf, `${actions.text('openPDF')} · ${rowName(context.row)}`);
        pdf.addEventListener('click', () => actions.open(context.row, true));
        actionsBox.append(pdf);
      }
      context.cell.append(title, actionsBox);
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
  };

  function nativeNumber(context: Cell): void {
    const { cell, column, value } = context;
    cell.classList.add('zb-cell-number');
    if (value === '0' && (column === 'notesCount' || column === 'attachmentsCount')) return;
    plain(context);
  }

  function nativeDate({ cell, column, value }: Cell): void {
    if (typeof value !== 'string') return;
    cell.classList.add('zb-cell-date');
    cell.textContent = (column === 'date' ? undefined : dateDay(value)) ?? publicationDate(value);
    cell.title = value;
  }

  function nativeList({ cell, value }: Cell): void {
    if (value === null || typeof value !== 'object' || !value.length) return;
    cell.classList.add('zb-cell-collections');
    cell.append(pillStrip(value, undefined, value.join('; ')));
  }

  function linkButton(
    style: string,
    text: string,
    label: string,
    run: () => void,
  ): HTMLButtonElement {
    const node = element('button', `zb-link-control ${style}`, text);
    node.type = 'button';
    node.tabIndex = -1;
    named(node, label);
    node.addEventListener('click', run);
    node.addEventListener('dblclick', (event) => event.stopPropagation());
    return node;
  }

  function nativeLink(context: Cell): void {
    const { cell, column, value } = context;
    const linkActions = actions.linkActions;
    if (typeof value !== 'string' || !value || !linkActions) return plain(context);
    const doi = column === 'doi' ? doiLink(value) : undefined;
    const url = column === 'doi' ? doi?.url : webURL(value)?.href;
    if (!url) return plain(context);
    const text = doi?.doi ?? value;
    const open = linkButton('zb-link-open', text, `${actions.text('openLink')} · ${text}`, () =>
      linkActions.open(url),
    );
    control(open, context);
    cell.append(open);
    if (doi) {
      cell.append(
        linkButton('zb-link-copy', '⧉', `${actions.text('copyDOI')} · ${doi.doi}`, () =>
          linkActions.copy(doi.doi),
        ),
      );
    }
  }

  const byType: Record<NativeValueType, (context: Cell) => void> = {
    text: plain,
    number: nativeNumber,
    date: nativeDate,
    link: nativeLink,
    multi: nativeList,
    boolean: plain,
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
    if (isNativeColumn(column)) {
      if (column === 'citationKey') cell.classList.add('zb-cell-monospace');
      const draw = native[column] ?? byType[NATIVE_COLUMN_BY_KEY[column].valueType];
      draw(context);
    } else if (property) custom[property.type](context, property);
    else plain(context);
    return cell;
  }

  return { render, fitPills };
}
