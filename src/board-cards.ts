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
    const title = element('h3', 'zb-board-card-title');
    title.textContent = name;
    title.title = name;

    let details: HTMLDListElement | undefined;
    let pdfInFields = false;
    for (const column of fields) {
      if (column === 'title') continue;
      if (column === 'pdf' && !row.pdf) continue;
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
      if (
        property?.type !== 'rating' &&
        (value === null || value === '' || (typeof value === 'object' && !value.length))
      )
        continue;

      const field = element('div', 'zb-board-card-field');
      const label = element('dt', 'zb-board-card-label');
      label.textContent = options.columnName(column);
      const content = element('dd', 'zb-board-card-value');
      content.dataset.column = column;
      if (column === 'pdf') {
        content.append(action(row, name, true));
        pdfInFields = true;
      } else drawField(content, row, column, property, value);
      field.append(label, content);
      (details ??= element('dl', 'zb-board-card-fields')).append(field);
    }

    const footer = element('footer', 'zb-board-card-footer');
    if (row.pdf && !pdfInFields) footer.append(action(row, name, true, false));
    footer.append(action(row, name, false));
    if (details) root.replaceChildren(title, details, footer);
    else root.replaceChildren(title, footer);
  }

  function action(row: Row, name: string, pdf: boolean, showCaption = true): HTMLButtonElement {
    const kind = pdf ? 'pdf' : 'locate';
    const caption = options.text(pdf ? 'openPDF' : 'open');
    const button = element('button', `zb-board-card-${kind}`);
    button.type = 'button';
    if (showCaption) button.textContent = caption;
    button.title = `${pdf ? caption : options.text('locate')} · ${name}`;
    button.setAttribute('aria-label', `${caption} · ${name}`);
    button.dataset.focus = `board:${row.id}:${kind}`;
    button.addEventListener('click', () => options.open(row, pdf));
    if (pdf) button.prepend(createAttachmentIcon(document, 'pdf'));
    return button;
  }

  return { render };
}
