import {
  NATIVE_COLUMN_BY_KEY,
  isNativeColumn,
  type Column,
  type NativeColumn,
  type NativeValueType,
  type OptionColorKey,
  type Property,
  type PropertyType,
  type PropertyValue,
  type Row,
} from './contracts';
import { createEditIcon, createFieldIcon } from './field-icons';
import type { GlobalPreferences } from './global-preferences';
import { isISODate, isRating, webURL } from './property-values';
import { dateDay } from './query';
import { createAttachmentIcon, createItemTypeIcon } from './semantic-icons';

export interface CellActions {
  open(row: Row, target: boolean | 'attachment'): void;
  tagColor?: (row: Row, name: string) => { native?: string; tone?: OptionColorKey } | undefined;
  linkActions?: { open(url: string): void; copy(text: string): void };
  authorFormat?: () => GlobalPreferences['authorFormat'];
  toggle(row: Row, property: Property, checked: boolean): void;
  rate?(row: Row, property: Property, value: string | null): void;
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
      | 'openAttachment'
      | 'openLink'
      | 'copyDOI'
      | 'readOnly'
      | 'edit'
      | 'rating'
      | 'clearRating'
      | 'untitled',
  ): string;
}

type ValueActions = Pick<
  CellActions,
  'tagColor' | 'linkActions' | 'authorFormat' | 'rate' | 'columnName' | 'text'
>;

interface Field {
  readonly row: Row;
  readonly column: Column;
  readonly value: PropertyValue;
  readonly cell: HTMLElement;
}

interface Cell extends Field {
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
const NATIVE_TAG_COLOR = '--zb-native-tag-color';
const HEX_COLOR = /^#[\da-f]{6}$/iu;

function choiceTone(value: string): OptionColorKey {
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

export function optionTone(property: Property, label: string): OptionColorKey {
  const colors = property.optionColors;
  return (
    (colors && Object.prototype.hasOwnProperty.call(colors, label) ? colors[label] : undefined) ??
    choiceTone(label)
  );
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

function createValueRenderers(document: Document, actions: ValueActions, card = false) {
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

  function control(node: HTMLElement, { row, column }: Field): void {
    node.dataset.column = column;
    node.dataset.focus = `cell:${row.id}:${column}`;
  }

  function named(node: HTMLElement, label: string): void {
    node.setAttribute('aria-label', label);
    node.title = label;
  }

  function plain({ cell, value }: Field): void {
    cell.textContent = valueText(value);
    if (typeof value === 'string') cell.title = value;
  }

  function paintPillColor(
    row: Row,
    column: Column,
    property: Property | undefined,
    pill: HTMLElement,
    label: string,
  ): void {
    let tone: OptionColorKey | undefined;
    if (column === 'tags') {
      const tagColor = actions.tagColor?.(row, label);
      if (tagColor?.native && HEX_COLOR.test(tagColor.native)) {
        pill.style.setProperty(NATIVE_TAG_COLOR, tagColor.native);
      } else {
        if (pill.style.length) pill.style.removeProperty(NATIVE_TAG_COLOR);
        tone = tagColor?.tone;
      }
    } else if (property) {
      tone = optionTone(property, label);
    }
    if (tone) pill.dataset.tone = tone;
    else delete pill.dataset.tone;
  }

  function pillStrip(
    { row, column }: Field,
    pills: readonly string[],
    property?: Property,
    fullTitle?: string,
  ): HTMLElement {
    const strip = element('span', 'zb-cell-pills');
    if (fullTitle) strip.title = fullTitle;
    for (const label of pills) {
      const pill = element('span', 'zb-cell-pill', label);
      if (fullTitle) pill.title = label;
      if (property || column === 'tags') paintPillColor(row, column, property, pill, label);
      strip.append(pill);
    }
    if (!card) {
      const more = element('span', 'zb-cell-pill zb-cell-pill-more');
      if (fullTitle) more.title = fullTitle;
      more.hidden = true;
      strip.append(more);
    }
    return strip;
  }

  function creators({ cell, row }: Field): void {
    const full = row.creators;
    const first = full.indexOf('; ');
    cell.textContent =
      actions.authorFormat?.() !== 'singleLine' &&
      first !== -1 &&
      full.indexOf('; ', first + 2) !== -1
        ? `${full.slice(0, first)} et al.`
        : valueText(full);
    cell.title = full;
  }

  function typeBadge(context: Field): void {
    const { cell, row, value } = context;
    if (typeof value !== 'string' || !value) return plain(context);
    const badge = element('span', 'zb-type-badge');
    if (row.itemType) {
      badge.dataset.itemType = row.itemType;
      badge.append(createItemTypeIcon(document, row.itemType));
    }
    badge.append(element('span', 'zb-type-label', value));
    cell.append(badge);
    cell.title = value;
  }

  function nativeNumber(context: Field): void {
    const { cell, column, value } = context;
    cell.classList.add('zb-cell-number');
    if (!card && value === '0' && (column === 'notesCount' || column === 'attachmentsCount'))
      return;
    plain(context);
  }

  function nativeDate({ cell, column, value }: Field): void {
    if (typeof value !== 'string') return;
    cell.classList.add('zb-cell-date');
    cell.textContent = (column === 'date' ? undefined : dateDay(value)) ?? publicationDate(value);
    cell.title = value;
  }

  function nativeList(context: Field): void {
    const { cell, value } = context;
    if (value === null || typeof value !== 'object' || !value.length) return;
    cell.classList.add('zb-cell-collections');
    cell.append(pillStrip(context, value, undefined, value.join('; ')));
  }

  function linkButton(
    style: string,
    text: string,
    label: string,
    run: () => void,
  ): HTMLButtonElement {
    const node = element('button', `zb-link-control ${style}`, text);
    node.type = 'button';
    if (!card) node.tabIndex = -1;
    named(node, label);
    node.addEventListener('click', run);
    node.addEventListener('dblclick', (event) => event.stopPropagation());
    return node;
  }

  function nativeLink(context: Field): void {
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
      const copy = linkButton('zb-link-copy', '⧉', `${actions.text('copyDOI')} · ${doi.doi}`, () =>
        linkActions.copy(doi.doi),
      );
      if (card) copy.dataset.focus = `${open.dataset.focus}:copy`;
      cell.append(copy);
    }
  }

  function rating(context: Field, property: Property): void {
    const { row, column, value, cell } = context;
    let current = typeof value === 'string' && isRating(value) ? Number(value) : 0;
    const rate = row.writable ? actions.rate : undefined;
    const group = element('span', 'zb-rating');
    const ratingLabel = actions.text('rating');
    const label = `${ratingLabel} · ${actions.columnName(column)} · ${rowName(row)}`;
    group.setAttribute('role', rate ? 'group' : 'img');
    group.setAttribute(
      'aria-label',
      rate ? label : `${label}: ${current}/5 · ${actions.text('readOnly')}`,
    );
    for (let index = 1; index <= 5; index++) {
      const button = rate ? element('button', 'zb-rating-star') : undefined;
      const star = button ?? element('span', 'zb-rating-star');
      const icon = createFieldIcon(document, column, 'rating');
      icon.classList.replace('zb-field-icon', 'zb-rating-icon');
      star.append(icon);
      if (rate && button) {
        button.type = 'button';
        if (!card) button.tabIndex = -1;
        control(button, context);
        button.dataset.focus += `:${index}`;
        button.dataset.rating = String(index);
        button.setAttribute('aria-label', `${ratingLabel} · ${index}/5`);
        button.addEventListener('click', () => {
          if (card) {
            const pending = cell.closest<HTMLElement>('.zb-board-card[data-pending]');
            if (pending && pending.dataset.pendingRating !== property.key) return;
          }
          current = current === index ? 0 : index;
          // A second click can arrive before the saved value is painted by the host.
          paint();
          rate(row, property, current === 0 ? null : String(current));
        });
      }
      group.append(star);
    }
    function paint(): void {
      group.toggleAttribute('data-empty', current === 0);
      for (let i = 0; i < group.children.length; i++) {
        const star = group.children[i] as HTMLElement;
        star.toggleAttribute('data-filled', i < current);
        if (rate) {
          const pressed = i + 1 === current;
          star.setAttribute('aria-pressed', String(pressed));
          star.title = pressed ? actions.text('clearRating') : star.getAttribute('aria-label')!;
        }
      }
    }
    paint();
    cell.classList.add('zb-rating-cell');
    cell.append(group);
  }

  function propertyURLValue(context: Field): void {
    const { value, cell } = context;
    const text = typeof value === 'string' ? value : '';
    const url = webURL(text);
    const compact = url ? `${url.host}${url.pathname === '/' ? '' : url.pathname}` : text;
    const linkActions = actions.linkActions;
    cell.classList.add('zb-cell-url');
    if (url && linkActions) {
      const open = linkButton(
        'zb-link-open zb-url-value',
        compact,
        `${actions.text('openLink')} · ${text}`,
        () => linkActions.open(url.href),
      );
      control(open, context);
      cell.append(open);
    } else if (text) {
      const label = element('span', 'zb-url-value', compact);
      label.title = text;
      cell.append(label);
    }
  }

  const byType: Record<NativeValueType, (context: Field) => void> = {
    text: plain,
    number: nativeNumber,
    date: nativeDate,
    link: nativeLink,
    multi: nativeList,
    boolean: plain,
  };

  function nativeValue(context: Field, column: NativeColumn): void {
    if (column === 'creators') creators(context);
    else if (column === 'type') typeBadge(context);
    else byType[NATIVE_COLUMN_BY_KEY[column].valueType](context);
  }

  return {
    element,
    valueText,
    rowName,
    control,
    named,
    plain,
    paintPillColor,
    pillStrip,
    nativeValue,
    rating,
    propertyURLValue,
  };
}

export function createBoardFieldRenderer(document: Document, actions: ValueActions) {
  const { nativeValue, pillStrip, plain, propertyURLValue, rating } = createValueRenderers(
    document,
    actions,
    true,
  );
  return (
    cell: HTMLElement,
    row: Row,
    column: Column,
    property: Property | undefined,
    value: PropertyValue,
  ): void => {
    const field: Field = { cell, row, column, value };
    if (property?.type === 'rating') rating(field, property);
    else if (property?.type === 'url') propertyURLValue(field);
    else if (
      column === 'tags' ||
      property?.type === 'multi-select' ||
      property?.type === 'single-select'
    ) {
      const choices = typeof value === 'string' ? [value] : value;
      if (choices && typeof choices === 'object' && choices.length)
        cell.append(pillStrip(field, choices, property));
    } else if (isNativeColumn(column)) nativeValue(field, column);
    else plain(field);
  };
}

export function createCellRenderers(document: Document, actions: CellActions) {
  const {
    element,
    valueText,
    rowName,
    control,
    named,
    plain,
    paintPillColor,
    pillStrip,
    nativeValue,
    rating,
    propertyURLValue,
  } = createValueRenderers(document, actions);

  function button(context: Cell, run: () => void, extraClass = ''): HTMLButtonElement {
    const node = element('button', extraClass ? `zb-cell-button ${extraClass}` : 'zb-cell-button');
    node.type = 'button';
    control(node, context);
    node.addEventListener('click', run);
    return node;
  }

  function editLabel({ row, column }: Cell): string {
    return `${actions.text('edit')} · ${actions.columnName(column)} · ${rowName(row)}`;
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
    const strip = pillStrip(context, pills, property);
    if (!row.writable) strip.title = `${fullText} · ${cell.title}`;
    content.append(strip);
  }

  function paintColors(
    row: Row,
    column: Column,
    property: Property | undefined,
    cell: HTMLTableCellElement,
  ): void {
    for (const pill of cell.querySelectorAll<HTMLElement>(
      '.zb-cell-pill:not(.zb-cell-pill-more)',
    )) {
      paintPillColor(row, column, property, pill, pill.textContent ?? '');
    }
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
    tags: editList,
    pdf(context) {
      const { row, cell } = context;
      const attachment = row.attachment ?? (row.pdf ? 'pdf' : undefined);
      if (!attachment) return;
      const opener = button(
        context,
        () => actions.open(row, row.attachment ? 'attachment' : true),
        'zb-attachment-button',
      );
      opener.dataset.attachment = attachment;
      const label = actions.text(attachment === 'pdf' ? 'openPDF' : 'openAttachment');
      named(opener, `${label} · ${rowName(row)}`);
      opener.append(createAttachmentIcon(document, attachment));
      cell.append(opener);
    },
  };

  function propertyURL(context: Cell, property: Property): void {
    const { row, column, value, cell } = context;
    propertyURLValue(context);
    if (row.writable) {
      const text = typeof value === 'string' ? value : '';
      const opener = button(
        context,
        () => actions.edit(row, column, property, value, cell, opener),
        'zb-url-edit',
      );
      named(opener, text ? `${editLabel(context)}: ${text}` : editLabel(context));
      opener.append(createEditIcon(document));
      cell.append(opener);
    } else {
      cell.title = actions.text('readOnly');
    }
  }

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
    rating,
    url: propertyURL,
    date(context, property) {
      const { cell, value } = context;
      cell.classList.add('zb-cell-date', 'zb-cell-monospace');
      const date = typeof value === 'string' && isISODate(value) ? value : null;
      editable(date === value ? context : { ...context, value: date }, property);
    },
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
      const draw = native[column];
      if (draw) draw(context);
      else nativeValue(context, column);
    } else if (property) custom[property.type](context, property);
    else plain(context);
    return cell;
  }

  return { render, fitPills, paintColors };
}
