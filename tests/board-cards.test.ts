// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createBoardCards } from '../src/board-cards';
import type { Property, Row } from '../src/contracts';
import { resolveTagColors } from '../src/tag-colors';

const xhtml = 'http://www.w3.org/1999/xhtml';
const row: Row = {
  id: 42,
  writable: true,
  title: 'Reading papers on a board',
  creators: 'Ada Lovelace; Grace Hopper; Katherine Johnson',
  year: '2024',
  source: 'Example Journal',
  type: 'Journal Article',
  itemType: 'journalArticle',
  tags: ['Native tag', 'topic/papers'],
  pdf: true,
  attachment: 'pdf',
  added: '2024-01-01',
  extra:
    'Status: Reading\nMethods: Survey; Interview\nImpact: 2\nRepository: https://example.org/code?rev=1',
};

const status: Property = { key: 'Status', type: 'single-select', optionColors: { Reading: 'red' } };
const methods: Property = { key: 'Methods', type: 'multi-select', optionColors: { Survey: 'sky' } };
const impact: Property = { key: 'Impact', type: 'rating' };
const repository: Property = { key: 'Repository', type: 'url' };

const labels = {
  yes: 'Yes',
  no: 'No',
  locate: 'Locate item',
  open: 'Open',
  openPDF: 'Open PDF',
  openAttachment: 'Open attachment',
  openLink: 'Open link',
  copyDOI: 'Copy DOI',
  readOnly: 'Read-only',
  edit: 'Edit',
  rating: 'Rating',
  clearRating: 'Clear rating',
  untitled: 'Untitled',
};

function fixture(doc = document) {
  const root = doc.createElementNS(xhtml, 'article') as HTMLElement;
  const open = vi.fn<(item: Row, pdf: boolean) => void>();
  const openLink = vi.fn<(url: string) => void>();
  const copyDOI = vi.fn<(doi: string) => void>();
  const rate = vi.fn<(item: Row, property: Property, value: string | null) => void>();
  const { render } = createBoardCards(doc, {
    open,
    linkActions: { open: openLink, copy: copyDOI },
    columnName: (column) => column.replace(/^property:/u, ''),
    rate,
    tagColor: resolveTagColors([
      { kind: 'tag', name: 'Native tag', color: 'orange' },
      { kind: 'prefix', name: 'topic/', color: 'teal' },
    ]),
    text: (key) => labels[key],
  });
  return { root, render, open, openLink, copyDOI, rate };
}

function get<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

function value(root: ParentNode, field: string): HTMLElement {
  return get(root, `dd[data-column="${field}"]`);
}

describe('board cards', () => {
  it('renders the title and ordered metadata in an XHTML card, with native item type SVGs', () => {
    const doc = document.implementation.createDocument(
      'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
      'window',
    );
    const { root, render } = fixture(doc);
    render(root, row, ['year', 'title', 'type', 'creators', 'property:Deleted'], []);

    expect([...root.querySelectorAll('*')].every((node) => node.namespaceURI === xhtml)).toBe(true);
    const title = get(root, 'h3');
    expect(title.ownerDocument).toBe(doc);
    expect(title.textContent).toBe(row.title);
    expect(title.title).toBe(row.title);
    expect([...root.querySelectorAll('dt')].map((node) => node.textContent)).toEqual([
      'year',
      'type',
      'creators',
    ]);
    expect(value(root, 'year').textContent).toBe('2024');
    expect(value(root, 'creators').textContent).toBe('Ada Lovelace et al.');
    expect(value(root, 'creators').title).toBe(row.creators);
    expect(value(root, 'type').textContent).toBe('Journal Article');
    const icon = get(value(root, 'type'), '.zb-native-icon');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.style.getPropertyValue('--zb-icon-light')).toContain(
      'chrome://zotero/skin/item-type/16/light/journal-article.svg',
    );
    expect(icon.style.getPropertyValue('--zb-icon-dark')).toContain(
      'chrome://zotero/skin/item-type/16/dark/journal-article.svg',
    );
  });

  it('gives tags and select values their Zotero or configured colors', () => {
    const { root, render } = fixture();
    render(
      root,
      { ...row, nativeTagColors: new Map([['Native tag', '#1374cd']]) },
      ['tags', 'property:Status', 'property:Methods'],
      [status, methods],
    );
    const tags = [...value(root, 'tags').querySelectorAll<HTMLElement>('.zb-cell-pill')];
    expect(tags.map((tag) => tag.textContent)).toEqual(['Native tag', 'topic/papers']);
    expect(tags[0]?.style.getPropertyValue('--zb-native-tag-color')).toBe('#1374cd');
    expect(tags[0]?.dataset.tone).toBeUndefined();
    expect(tags[1]?.dataset.tone).toBe('teal');
    const choice = get(value(root, 'property:Status'), '.zb-cell-pill');
    expect(choice.textContent).toBe('Reading');
    expect(choice.dataset.tone).toBe('red');
    const multi = value(root, 'property:Methods').querySelectorAll<HTMLElement>('.zb-cell-pill');
    expect([...multi].map((pill) => pill.textContent)).toEqual(['Survey', 'Interview']);
    expect(multi[0]?.dataset.tone).toBe('sky');
    expect(multi[1]?.dataset.tone).toBeTruthy();
  });

  it('uses keyboard-focusable actions for safe URL and DOI targets only', () => {
    const { root, render, openLink, copyDOI, open } = fixture();
    const item = { ...row, url: 'javascript:alert(1)', doi: 'DOI: 10.1000/archive?item=1' };
    const fields = ['url', 'doi', 'property:Repository'] as const;
    render(root, item, fields, [repository]);

    expect(value(root, 'url').textContent).toBe(item.url);
    expect(value(root, 'url').querySelector('a, button')).toBeNull();
    const doi = value(root, 'doi');
    const doiOpen = get<HTMLButtonElement>(doi, 'button[aria-label^="Open link"]');
    const doiCopy = get<HTMLButtonElement>(doi, 'button[aria-label^="Copy DOI"]');
    const urlOpen = get<HTMLButtonElement>(value(root, 'property:Repository'), 'button');
    for (const button of [doiOpen, doiCopy, urlOpen]) expect(button.tabIndex).toBe(0);
    expect([doiOpen.dataset.focus, doiCopy.dataset.focus, urlOpen.dataset.focus]).toEqual([
      'cell:42:doi',
      'cell:42:doi:copy',
      'cell:42:property:Repository',
    ]);
    doiOpen.click();
    doiCopy.click();
    urlOpen.click();
    expect(openLink.mock.calls).toEqual([
      ['https://doi.org/10.1000/archive%3Fitem%3D1'],
      ['https://example.org/code?rev=1'],
    ]);
    expect(copyDOI.mock.calls).toEqual([['10.1000/archive?item=1']]);
    expect(open).not.toHaveBeenCalled();

    render(
      root,
      { ...item, url: 'https://example.org/article', doi: 'https://example.org/10.1000/x' },
      fields,
      [repository],
    );
    expect(value(root, 'doi').querySelector('a, button')).toBeNull();
    get<HTMLButtonElement>(value(root, 'url'), 'button').click();
    expect(openLink).toHaveBeenLastCalledWith('https://example.org/article');
  });

  it('keeps one native PDF action and places it in field order when selected', () => {
    const { root, render, open } = fixture();
    render(root, row, ['year'], []);
    const pdf = get<HTMLButtonElement>(root, 'footer button[aria-label^="Open PDF"]');
    const locate = get<HTMLButtonElement>(root, 'footer .zb-board-card-locate');
    expect(pdf.getAttribute('aria-label')).toBe(`Open PDF · ${row.title}`);
    expect(locate.getAttribute('aria-label')).toBe(`Open · ${row.title}`);
    expect(locate.title).toBe(`Locate item · ${row.title}`);
    expect(get(pdf, '.zb-native-icon').style.getPropertyValue('--zb-icon-light')).toContain(
      'chrome://zotero/skin/item-type/12/light/attachment-pdf.svg',
    );
    pdf.click();
    locate.click();
    expect(open.mock.calls).toEqual([
      [row, true],
      [row, false],
    ]);

    render(root, row, ['pdf', 'year'], []);
    expect(root.querySelectorAll('button[aria-label^="Open PDF"]')).toHaveLength(1);
    expect(get(value(root, 'pdf'), 'button').textContent).toBe('Open PDF');
    expect(get(root, 'dl > :first-child dd').dataset.column).toBe('pdf');
    render(root, { ...row, pdf: false, attachment: 'epub', title: '' }, ['pdf'], []);
    expect(root.querySelector('button[aria-label^="Open PDF"]')).toBeNull();
    expect(get(root, 'h3').textContent).toBe('Untitled');
    expect(get(root, 'footer button').getAttribute('aria-label')).toBe('Open · Untitled');
  });

  it('writes exact rating values and clears a rapid re-click before a host refresh', () => {
    const { root, render, rate } = fixture();
    render(root, row, ['property:Impact'], [impact]);
    const group = get(root, '[role="group"]');
    const stars = [...group.querySelectorAll<HTMLButtonElement>('button')];
    const fourth = get<HTMLButtonElement>(group, 'button[aria-label="Rating · 4/5"]');
    expect(stars).toHaveLength(5);
    expect(stars.every((star) => star.tabIndex === 0)).toBe(true);
    expect(fourth.dataset.focus).toBe('cell:42:property:Impact:4');
    expect(group.querySelectorAll('[data-filled]')).toHaveLength(2);
    fourth.click();
    expect(group.querySelectorAll('[data-filled]')).toHaveLength(4);
    expect(fourth.getAttribute('aria-pressed')).toBe('true');
    fourth.click();
    expect(group.querySelectorAll('[data-filled]')).toHaveLength(0);
    expect(fourth.getAttribute('aria-pressed')).toBe('false');
    get<HTMLButtonElement>(group, 'button[aria-label="Rating · 5/5"]').click();
    expect(rate.mock.calls).toEqual([
      [row, impact, '4'],
      [row, impact, null],
      [row, impact, '5'],
    ]);

    render(root, { ...row, writable: false }, ['property:Impact'], [impact]);
    expect(
      get(value(root, 'property:Impact'), '[role="img"]').getAttribute('aria-label'),
    ).toContain('2/5 · Read-only');
    expect(value(root, 'property:Impact').querySelector('button')).toBeNull();
  });
});
