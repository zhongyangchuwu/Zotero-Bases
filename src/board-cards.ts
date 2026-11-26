import { createBoardFieldRenderer, type CellActions } from './cell-renderers';
import {
  isNativeColumn,
  type Column,
  type Property,
  type PropertyValue,
  type Row,
} from './contracts';
import { readProperty } from './extra';
import { createAttachmentIcon } from './semantic-icons';

type BoardCardOptions = Omit<CellActions, 'edit' | 'toggle' | 'open'> & {
  open(row: Row, pdf: boolean): void;
};

export function createBoardCards(document: Document, options: BoardCardOptions) {
  const drawField = createBoardFieldRenderer(document, options);

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
    const node = document.createElementNS(
      'http://www.w3.org/1999/xhtml',
      tag,
    ) as HTMLElementTagNameMap[K];
    node.className = className;
    return node;
  }

  function render(
    root: HTMLElement,
    row: Row,
    fields: readonly Column[],
    properties: readonly Property[],
  ): void {
    const name = row.title || options.text('untitled');
    const body = element('div', 'zb-board-card-content');
    const title = element('h3', 'zb-board-card-title');
    title.textContent = name;
    title.title = name;
    body.append(title);

    function valueField(column: Column) {
      const field = element('span', 'zb-board-card-value');
      field.dataset.column = column;
      return field;
    }

    const creators = fields.includes('creators') && Boolean(row.creators.trim());
    const withYear = fields.includes('year') && Boolean(row.year.trim());
    if (creators || withYear) {
      const byline = element('div', 'zb-board-card-byline');
      if (creators) {
        const author = valueField('creators');
        drawField(author, row, 'creators', undefined, row.creators);
        byline.append(author);
      }
      if (withYear) {
        const year = valueField('year');
        drawField(year, row, 'year', undefined, row.year);
        if (byline.firstChild) {
          const separator = element('span', 'zb-board-card-byline-dot');
          separator.textContent = ' · ';
          byline.append(separator);
        }
        byline.append(year);
      }
      body.append(byline);
    }

    const details = element('div', 'zb-board-card-fields');
    const ordered: HTMLElement[] = [];
    let tags: HTMLElement | undefined;
    let tray: HTMLElement | undefined;

    function updateScrollableDetails(): void {
      const scrollable = details.childElementCount > 4;
      if (scrollable === details.hasAttribute('data-board-card-scroll')) return;
      if (scrollable) {
        details.setAttribute('data-board-card-scroll', '');
        details.tabIndex = 0;
        details.setAttribute('role', 'region');
        details.setAttribute('aria-label', name);
        details.dataset.focus = `board:${row.id}:metadata`;
      } else {
        details.removeAttribute('data-board-card-scroll');
        details.removeAttribute('tabindex');
        details.removeAttribute('role');
        details.removeAttribute('aria-label');
        delete details.dataset.focus;
      }
    }

    function placeRating(field: HTMLElement, destination: HTMLElement): void {
      if (field.parentElement === destination) return;
      const active = document.activeElement as HTMLElement | null;
      const focused = active && field.contains(active) ? active : null;
      const index = ordered.indexOf(field);
      const next = ordered.find((sibling, i) => i > index && sibling.parentElement === destination);
      destination.insertBefore(field, next ?? null);
      updateScrollableDetails();
      focused?.focus({ preventScroll: true });
    }

    for (const column of fields) {
      if (column === 'title' || column === 'creators' || column === 'year') continue;
      const native = isNativeColumn(column);
      const key = native ? undefined : column.slice('property:'.length);
      const property =
        key === undefined ? undefined : properties.find((field) => field.key === key);
      let value: PropertyValue = null;
      if (native) value = row[column] ?? null;
      else if (property) {
        const pending =
          property.type === 'rating' && root.dataset.pendingRating === property.key
            ? root.dataset.pendingRatingValue
            : undefined;
        value = pending === undefined ? readProperty(row.extra, property) : pending || null;
      }
      const editableRating = property?.type === 'rating' && row.writable && Boolean(options.rate);
      if (
        !editableRating &&
        (value === null ||
          value === false ||
          (typeof value === 'string' && !value.trim()) ||
          (typeof value === 'object' && !value.length))
      )
        continue;

      const field = valueField(column);
      if (column === 'tags') {
        drawField(field, row, column, property, value);
        tags = field;
        continue;
      }
      ordered.push(field);
      if (column === 'pdf') {
        field.append(action(row, name, true));
      } else if (editableRating) {
        const ratingTray = (tray ??= element('div', 'zb-board-card-rating-tray'));
        const label = element('span', 'zb-board-card-rating-name');
        label.title = options.columnName(column);
        label.textContent = label.title;
        label.setAttribute('aria-hidden', 'true');
        field.append(label);
        drawField(field, row, column, property, value, (empty) => {
          placeRating(field, empty ? ratingTray : details);
        });
        if (value === null) {
          ratingTray.append(field);
          continue;
        }
      } else {
        drawField(field, row, column, property, value);
      }
      details.append(field);
    }

    updateScrollableDetails();
    body.append(details);
    if (tags) body.append(tags);
    body.append(action(row, name, false));
    if (tray) body.append(tray);
    root.replaceChildren(body);
  }

  function action(row: Row, name: string, pdf: boolean): HTMLButtonElement {
    const kind = pdf ? 'pdf' : 'locate';
    const caption = options.text(pdf ? 'openPDF' : 'locate');
    const button = element('button', `zb-board-card-${kind}`);
    button.type = 'button';
    button.title = pdf ? caption : `${caption} · ${name}`;
    button.setAttribute('aria-label', `${caption} · ${name}`);
    button.dataset.focus = `board:${row.id}:${kind}`;
    button.addEventListener('click', () => options.open(row, pdf));
    if (pdf) button.append(createAttachmentIcon(document, 'pdf'));
    else button.textContent = options.text('open');
    return button;
  }

  return { render };
}
