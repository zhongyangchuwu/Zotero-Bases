// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCellRenderers, type CellActions } from '../src/cell-renderers';
import { createFieldIcon } from '../src/field-icons';
import type { Property, Row } from '../src/contracts';

const row: Row = {
  id: 42,
  writable: true,
  title: 'A Paper',
  creators: 'Ada Lovelace; Grace Hopper; Katherine Johnson',
  year: '2024',
  source: 'Example Journal',
  type: 'Journal Article',
  tags: ['Topic A', 'Topic B', 'Long Topic C'],
  pdf: true,
  added: '2024-10-31 00:01:00',
  extra: '',
};

const labels = {
  yes: 'Yes',
  no: 'No',
  locate: 'Locate item',
  open: 'Open',
  openPDF: 'Open PDF',
  readOnly: 'Read-only',
  edit: 'Edit',
  untitled: 'Untitled',
};

function fixture(doc = document) {
  const open = vi.fn<CellActions['open']>();
  const edit = vi.fn<CellActions['edit']>();
  const toggle = vi.fn<CellActions['toggle']>();
  const renderers = createCellRenderers(doc, {
    open,
    edit,
    toggle,
    columnName: (column) => column.replace('property:', ''),
    text: (key) => labels[key],
  });
  return { ...renderers, open, edit, toggle };
}

function get<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('cell renderers', () => {
  it.each([
    ['', ''],
    ['Ada Lovelace', 'Ada Lovelace'],
    ['Ada Lovelace; Grace Hopper', 'Ada Lovelace; Grace Hopper'],
    [row.creators, 'Ada Lovelace et al.'],
  ])('shows concise author names but retains %j as the tooltip', (creators, display) => {
    const { render } = fixture();
    const cell = render({ ...row, creators }, 'creators', undefined, creators);
    expect(cell.textContent).toBe(display);
    expect(cell.title).toBe(creators);
  });

  it.each([
    [row.added, '2024-10-31'],
    ['2024-10-31T00:01:00+03:00', '2024-10-31'],
    ['2024-10-31', '2024-10-31'],
    ['October 2024', 'October 2024'],
    ['', ''],
  ])('shows %j as a calendar date without converting the time zone', (added, display) => {
    const { render } = fixture();
    const cell = render({ ...row, added }, 'added', undefined, added);
    expect(cell.textContent).toBe(display);
    expect(cell.title).toBe(added);
  });

  it('locates titles and opens available PDFs via distinct native XHTML buttons', () => {
    const xhtml = 'http://www.w3.org/1999/xhtml';
    const xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
    const doc = document.implementation.createDocument(xul, 'window');
    const { render, open } = fixture(doc);
    const readOnly = { ...row, writable: false };
    const title = render(readOnly, 'title', undefined, readOnly.title);
    const pdf = render(readOnly, 'pdf', undefined, readOnly.pdf);
    const locate = get<HTMLButtonElement>(title, 'button.zb-cell-button');
    const attachment = get<HTMLButtonElement>(pdf, 'button.zb-cell-button');
    expect(title.dataset.column).toBe('title');
    expect(pdf.dataset.column).toBe('pdf');
    expect(pdf.namespaceURI).toBe(xhtml);
    expect(attachment.namespaceURI).toBe(xhtml);
    expect(attachment.ownerDocument).toBe(doc);
    expect(attachment.type).toBe('button');
    expect(attachment.dataset.column).toBe('pdf');
    expect(attachment.dataset.focus).toBe('cell:42:pdf');
    expect(attachment.getAttribute('aria-label')).toBe('Open PDF · A Paper');
    expect(attachment.textContent).toBe('');
    expect(locate.dataset.focus).toBe('cell:42:title');
    expect(locate.title).toContain(row.title);
    expect(locate.title).toContain('Locate item');
    expect(locate.textContent).toBe(row.title);
    locate.click();
    attachment.click();
    expect(open.mock.calls).toEqual([
      [readOnly, false],
      [readOnly, true],
    ]);

    const missing = render({ ...row, pdf: false }, 'pdf', undefined, false);
    expect(missing.childNodes).toHaveLength(0);
  });

  it('keeps blank editable cells visually empty and accessible', () => {
    const { render, edit } = fixture();
    const properties: Property[] = [
      { key: 'Memo', type: 'text' },
      { key: 'Status', type: 'single-select' },
      { key: 'Topics', type: 'multi-select' },
    ];
    for (const property of properties) {
      const value = property.type === 'multi-select' ? [] : null;
      const column = `property:${property.key}` as const;
      const cell = render(row, column, property, value);
      const button = get<HTMLButtonElement>(cell, 'button');
      expect(cell.textContent).toBe('');
      expect(button.getAttribute('aria-label')).toBe(`Edit · ${property.key} · A Paper`);
      button.click();
      expect(edit).toHaveBeenLastCalledWith(row, column, property, value, cell, button);
      expect(render({ ...row, writable: false }, column, property, value).textContent).toBe('');
    }
    expect(render(row, 'tags', undefined, []).textContent).toBe('');
    expect(render(row, 'year', undefined, '').textContent).toBe('');
    expect(render(row, 'type', undefined, '').textContent).toBe('');
  });

  it('provides independently focusable localized title actions without replacing locate', () => {
    const { render, open } = fixture();
    const cell = render(row, 'title', undefined, row.title);
    document.body.append(cell);
    const locate = get<HTMLButtonElement>(cell, '.zb-item-title');
    const controls = Array.from(cell.querySelectorAll<HTMLButtonElement>('.zb-title-action'));
    expect(controls.map((button) => button.textContent)).toEqual(['Open', 'Open PDF']);
    expect(controls.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open · A Paper',
      'Open PDF · A Paper',
    ]);
    controls[0]!.focus();
    expect(document.activeElement).toBe(controls[0]);
    locate.click();
    controls[0]!.click();
    controls[1]!.click();
    expect(open.mock.calls).toEqual([
      [row, false],
      [row, false],
      [row, true],
    ]);
    const noPdf = render({ ...row, pdf: false }, 'title', undefined, row.title);
    expect(noPdf.querySelectorAll('.zb-title-action')).toHaveLength(1);
  });

  it('creates decorative field icons in the supplied document', () => {
    const doc = document.implementation.createDocument(
      'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
      'window',
    );
    const native = createFieldIcon(doc, 'title');
    const custom = createFieldIcon(doc, 'property:Rating', 'number');
    expect(native.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(custom.ownerDocument).toBe(doc);
    expect(custom.getAttribute('width')).toBe('13');
    expect(custom.getAttribute('aria-hidden')).toBe('true');
    expect(custom.querySelector('path')?.getAttribute('d')).not.toBe(
      native.querySelector('path')?.getAttribute('d'),
    );
  });

  it('marks numeric cells, badges item types, and passes the original edit value', () => {
    const { render, edit } = fixture();
    const score: Property = { key: 'Score', type: 'number' };
    const number = render(row, 'property:Score', score, '0.25');
    const year = render(row, 'year', undefined, row.year);
    const type = render(row, 'type', undefined, row.type);
    const opener = get<HTMLButtonElement>(number, 'button.zb-cell-button');
    expect(number.classList.contains('zb-cell-number')).toBe(true);
    expect(year.classList.contains('zb-cell-number')).toBe(true);
    expect(type.classList.contains('zb-cell-number')).toBe(false);
    expect(get(type, '.zb-type-badge').textContent).toBe(row.type);
    expect(opener.dataset.column).toBe('property:Score');
    expect(opener.dataset.focus).toBe('cell:42:property:Score');
    expect(opener.getAttribute('aria-label')).toBe('Edit · Score · A Paper: 0.25');
    opener.click();
    expect(edit).toHaveBeenCalledWith(row, 'property:Score', score, '0.25', number, opener);
  });

  it('shows consistent reading-state colors in single and multi-select cells', () => {
    const { render } = fixture();
    const options = ['Unread', 'In review', 'Done', 'Simulation'];
    const property: Property = { key: 'Reading State', type: 'single-select', options };
    const single = options.map((value) =>
      get(render(row, 'property:Reading State', property, value), '.zb-cell-pill'),
    );
    expect(single.slice(0, 3).map((node) => node.dataset.tone)).toEqual([
      'neutral',
      'amber',
      'green',
    ]);
    const reversed = [...options].reverse();
    const multiple = render(
      { ...row, writable: false },
      'property:Reading State',
      { ...property, type: 'multi-select', options: reversed },
      reversed,
    );
    for (const [index, node] of Array.from(
      multiple.querySelectorAll<HTMLElement>('.zb-cell-pill:not(.zb-cell-pill-more)'),
    ).entries()) {
      expect(node.textContent).toBe(reversed[index]);
      expect(node.dataset.tone).toBe(single[options.length - 1 - index]?.dataset.tone);
    }
    expect(
      get(render(row, 'tags', undefined, ['Done']), '.zb-cell-pill').dataset.tone,
    ).toBeUndefined();
  });

  it('uses own manual option colors and falls back for missing or inherited entries', () => {
    const { render } = fixture();
    const colors = Object.assign(Object.create({ Done: 'rose' }), { Unread: 'violet' });
    Object.defineProperty(colors, '__proto__', { value: 'teal', enumerable: true });
    const property: Property = { key: 'Status', type: 'single-select', optionColors: colors };
    const tone = (value: string) =>
      get(render(row, 'property:Status', property, value), '.zb-cell-pill').dataset.tone;
    expect(tone('Unread')).toBe('violet');
    expect(tone('Done')).toBe('green');
    expect(tone('__proto__')).toBe('teal');
    const fallback = tone('Simulation');
    expect(fallback).toBeDefined();
    const multi = render(row, 'property:Status', { ...property, type: 'multi-select' }, [
      'Unread',
      'Done',
      'Simulation',
    ]);
    expect(
      Array.from(
        multi.querySelectorAll<HTMLElement>('.zb-cell-pill:not(.zb-cell-pill-more)'),
        (pill) => pill.dataset.tone,
      ),
    ).toEqual(['violet', 'green', fallback]);
  });

  it('keeps read-only values non-interactive and toggles editable checkboxes on Enter', () => {
    const { render, edit, toggle } = fixture();
    const reviewed: Property = { key: 'Reviewed', type: 'checkbox' };
    const memo: Property = { key: 'Memo', type: 'text' };
    const readOnly = { ...row, writable: false };
    const locked = render(readOnly, 'property:Reviewed', reviewed, true);
    const note = render(readOnly, 'property:Memo', memo, 'Keep this text');
    expect(locked.textContent).toBe('Yes');
    expect(locked.title).toBe('Read-only');
    expect(locked.querySelector('input')).toBeNull();
    expect(note.textContent).toBe('Keep this text');
    expect(note.title).toBe('Read-only');
    expect(note.querySelector('button')).toBeNull();

    const cell = render(row, 'property:Reviewed', reviewed, null);
    const table = document.createElement('table');
    table.insertRow().append(cell);
    document.body.append(table);
    const checkbox = get<HTMLInputElement>(cell, 'input[type="checkbox"]');
    expect(checkbox.checked).toBe(false);
    expect(checkbox.dataset.column).toBe('property:Reviewed');
    expect(checkbox.dataset.focus).toBe('cell:42:property:Reviewed');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    checkbox.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(checkbox.checked).toBe(true);
    checkbox.click();
    expect(toggle.mock.calls).toEqual([
      [row, reviewed, true],
      [row, reviewed, false],
    ]);
    expect(edit).not.toHaveBeenCalled();
  });

  it('keeps the full list in the edit label and fits the largest prefix plus exact overflow', () => {
    const { render, fitPills, edit } = fixture();
    const workspace = document.createElement('div');
    workspace.className = 'zb-workspace';
    const table = document.createElement('table');
    const cell = render(row, 'tags', undefined, row.tags);
    table.insertRow().append(cell);
    workspace.append(table);
    document.body.append(workspace);
    const opener = get<HTMLButtonElement>(cell, 'button');
    const strip = get(opener, '.zb-cell-pills');
    const pills = Array.from(strip.querySelectorAll<HTMLElement>('.zb-cell-pill'));
    const more = get(strip, '.zb-cell-pill-more');
    const widths = [44, 40, 36];
    let available = 120;
    strip.style.columnGap = '6px';
    vi.spyOn(strip, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 0, available, 0),
    );
    pills.forEach((pill, index) => {
      vi.spyOn(pill, 'getBoundingClientRect').mockImplementation(() => {
        const width = widths[index] ?? (pill.textContent === '+2' ? 58 : 24);
        return new DOMRect(0, 0, pill.hidden ? 0 : width, 0);
      });
    });
    const visible = () => pills.filter((pill) => !pill.hidden).map((pill) => pill.textContent);

    fitPills(table);
    expect(visible()).toEqual(['Topic A', 'Topic B', '+1']);
    expect(opener.getAttribute('aria-label')).toBe(
      'Edit · tags · A Paper: Topic A; Topic B; Long Topic C',
    );
    opener.click();
    expect(edit).toHaveBeenCalledWith(row, 'tags', undefined, row.tags, cell, opener);

    available = 119;
    fitPills(table);
    expect(visible()).toEqual(['Topic A', '+2']);
    available = 98;
    fitPills(table);
    expect(visible()).toEqual(['+3']);
    workspace.dataset.density = 'wrap';
    fitPills(table);
    expect(visible()).toEqual(row.tags);
    expect(more.hidden).toBe(true);
    workspace.dataset.density = 'dense';
    available = 132;
    fitPills(table);
    expect(visible()).toEqual(row.tags);
  });

  it('renders both kinds of select values as exact pills, including in read-only rows', () => {
    const { render } = fixture();
    const status: Property = { key: 'Status', type: 'single-select' };
    const methods: Property = { key: 'Methods', type: 'multi-select' };
    const single = render(row, 'property:Status', status, 'In progress');
    expect(get(single, '.zb-cell-pill').textContent).toBe('In progress');
    const values = ['Case study', 'Simulation'];
    const multi = render({ ...row, writable: false }, 'property:Methods', methods, values);
    expect(multi.title).toBe('Read-only');
    expect(multi.querySelector('button')).toBeNull();
    expect(get(multi, '.zb-cell-pills').title).toContain('Case study; Simulation');
    expect(
      Array.from(multi.querySelectorAll('.zb-cell-pill:not([hidden])'), (pill) => pill.textContent),
    ).toEqual(values);
  });
});
