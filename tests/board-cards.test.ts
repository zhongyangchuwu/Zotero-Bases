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

function fixture(doc = document, authorFormat: 'etAl' | 'singleLine' = 'etAl') {
  const root = doc.createElementNS(xhtml, 'article') as HTMLElement;
  root.className = 'zb-board-card';
  const open = vi.fn<(item: Row, pdf: boolean) => void>();
  const openLink = vi.fn<(url: string) => void>();
  const copyDOI = vi.fn<(doi: string) => void>();
  const rate = vi.fn<(item: Row, property: Property, value: string | null) => void>();
  const { render } = createBoardCards(doc, {
    open,
    linkActions: { open: openLink, copy: copyDOI },
    columnName: (column) => column.replace(/^property:/u, ''),
    authorFormat: () => authorFormat,
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
  return get(root, `.zb-board-card-value[data-column="${field}"]`);
}

describe('board cards', () => {
  it('renders a title, author-year byline and unlabeled native metadata in an XHTML card', () => {
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
    expect(root.querySelector('dl, dt, dd')).toBeNull();
    expect(get(root, '.zb-board-card-byline').textContent).toBe('Ada Lovelace et al. · 2024');
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

  it('uses the author preference and only separates two enabled, nonempty byline values', () => {
    const { root, render } = fixture(document, 'singleLine');
    render(root, row, ['creators'], []);
    expect(get(root, '.zb-board-card-byline').textContent).toBe(row.creators);
    render(root, { ...row, creators: '' }, ['creators', 'year'], []);
    expect(get(root, '.zb-board-card-byline').textContent).toBe(row.year);
    render(root, { ...row, year: '' }, ['creators', 'year'], []);
    expect(get(root, '.zb-board-card-byline').textContent).toBe(row.creators);
    render(root, row, ['source'], []);
    expect(root.querySelector('.zb-board-card-byline')).toBeNull();
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

  it('limits tags and multiselect to two pills plus an exact full-value tooltip', () => {
    const { root, render } = fixture();
    const tags = ['An especially long exact tag', 'topic/papers', 'Another tag', 'Last tag'];
    const choices = ['Survey', 'Long interview label', 'Fieldwork'];
    render(
      root,
      { ...row, tags, extra: `Methods: ${choices.join('; ')}` },
      ['tags', 'property:Methods'],
      [methods],
    );
    for (const [field, all] of [
      ['tags', tags],
      ['property:Methods', choices],
    ] as const) {
      const strip = get(value(root, field), '.zb-cell-pills');
      const pills = [...strip.querySelectorAll<HTMLElement>('.zb-cell-pill')];
      expect(pills.map((pill) => pill.textContent)).toEqual([
        ...all.slice(0, 2),
        `+${all.length - 2}`,
      ]);
      expect(pills.map((pill) => pill.getAttribute('title'))).toEqual([null, null, strip.title]);
      expect(strip.title).toBe(all.join('; '));
    }
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
      {
        ...item,
        url: 'https://example.org/article?q=search#result',
        doi: 'https://example.org/10.1000/x',
      },
      fields,
      [repository],
    );
    expect(value(root, 'doi').querySelector('a, button')).toBeNull();
    const nativeURL = get<HTMLButtonElement>(value(root, 'url'), 'button');
    expect(nativeURL.textContent).toBe('example.org/article');
    expect(nativeURL.title).toBe('Open link · https://example.org/article?q=search#result');
    expect(urlOpen.textContent).toBe('example.org/code');
    nativeURL.click();
    expect(openLink).toHaveBeenLastCalledWith('https://example.org/article?q=search#result');
  });

  it('compacts dates and exposes overflow fields in a keyboard-focusable region', () => {
    const { root, render } = fixture();
    const item = {
      ...row,
      date: '2024-00-00 Spring 2024',
      added: '2024-01-01 12:34:56',
      dateModified: '2024-06-20T00:30:00+02:00',
    };
    render(
      root,
      item,
      [
        'date',
        'added',
        'dateModified',
        'type',
        'source',
        'property:Repository',
        'property:Missing',
      ],
      [repository],
    );
    const region = get(root, '[data-board-card-scroll]');
    expect(region.tabIndex).toBe(0);
    expect(region.getAttribute('aria-label')).toBe(row.title);
    expect(value(region, 'date').textContent).toBe('Spring 2024');
    expect(value(region, 'added').textContent).toBe('2024-01-01');
    expect(value(region, 'dateModified').textContent).toBe('2024-06-20');
    expect(value(region, 'added').title).toBe(item.added);
    expect(value(region, 'property:Repository').querySelector('button')).not.toBeNull();
    expect(region.querySelector('[data-column="property:Missing"]')).toBeNull();
  });

  it('shows icon-only PDF only when enabled and available, with a separate Locate overlay', () => {
    const { root, render, open } = fixture();
    render(root, row, ['year'], []);
    expect(root.querySelector('.zb-board-card-pdf, footer')).toBeNull();

    render(root, row, ['pdf', 'year', 'property:Impact', 'tags'], [impact]);
    const details = get(root, '.zb-board-card-fields');
    const pdf = get<HTMLButtonElement>(details, '.zb-board-card-pdf');
    const locate = get<HTMLButtonElement>(root, '.zb-board-card-locate');
    expect(pdf.getAttribute('aria-label')).toBe(`Open PDF · ${row.title}`);
    expect(pdf.title).toBe('Open PDF');
    expect(pdf.textContent).toBe('');
    expect(pdf.dataset.focus).toBe('board:42:pdf');
    expect(locate.getAttribute('aria-label')).toBe(`Locate item · ${row.title}`);
    expect(locate.title).toBe(`Locate item · ${row.title}`);
    expect(locate.textContent).toBe('Open');
    expect(locate.dataset.focus).toBe('board:42:locate');
    expect([pdf.tabIndex, locate.tabIndex]).toEqual([0, 0]);
    expect(details.contains(locate)).toBe(false);
    expect(details.contains(value(root, 'property:Impact'))).toBe(true);
    expect(details.contains(value(root, 'tags'))).toBe(false);
    expect(get(pdf, '.zb-native-icon').style.getPropertyValue('--zb-icon-light')).toContain(
      'chrome://zotero/skin/item-type/12/light/attachment-pdf.svg',
    );
    pdf.click();
    locate.click();
    expect(open.mock.calls).toEqual([
      [row, true],
      [row, false],
    ]);

    render(root, { ...row, pdf: false, attachment: 'epub', title: '' }, ['pdf'], []);
    expect(root.querySelector('.zb-board-card-pdf')).toBeNull();
    expect(get(root, '.zb-board-card-title').textContent).toBe('Untitled');
    expect(get(root, '.zb-board-card-locate').getAttribute('aria-label')).toBe(
      'Locate item · Untitled',
    );
  });

  it('writes exact rating values and clears a rapid re-click before a host refresh', () => {
    const { root, render, rate } = fixture();
    render(root, row, ['property:Impact'], [impact]);
    const group = get(root, '[role="group"]');
    const stars = [...group.querySelectorAll<HTMLButtonElement>('button')];
    const fourth = get<HTMLButtonElement>(group, 'button[aria-label="Rating · Impact · 4/5"]');
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
    get<HTMLButtonElement>(group, 'button[aria-label="Rating · Impact · 5/5"]').click();
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

  it('keeps multiple named empty ratings in the tray, omits read-only empties, and honors pending writes', () => {
    const { root, render, rate } = fixture();
    const quality: Property = { key: 'Quality', type: 'rating' };
    const fields = ['property:Impact', 'property:Quality'] as const;
    const item = { ...row, extra: '' };
    render(root, { ...item, writable: false }, fields, [impact, quality]);
    expect(root.querySelector('.zb-rating, .zb-board-card-rating-tray')).toBeNull();

    root.setAttribute('data-pending', '');
    root.dataset.pendingRating = impact.key;
    root.dataset.pendingRatingValue = '';
    render(root, row, fields, [impact, quality]);
    const tray = get(root, '.zb-board-card-rating-tray');
    const details = get(root, '.zb-board-card-fields');
    const impactField = value(tray, 'property:Impact');
    const qualityField = value(tray, 'property:Quality');
    const impactStar = get<HTMLButtonElement>(
      impactField,
      'button[aria-label="Rating · Impact · 1/5"]',
    );
    const qualityStar = get<HTMLButtonElement>(
      qualityField,
      'button[aria-label="Rating · Quality · 1/5"]',
    );
    expect(impactField.querySelector('[data-filled]')).toBeNull();
    expect(qualityField.querySelector('[data-filled]')).toBeNull();
    qualityStar.click();
    expect(rate).not.toHaveBeenCalled();
    expect(qualityStar.getAttribute('aria-pressed')).toBe('false');
    expect(details.childElementCount).toBe(0);

    document.body.append(root);
    try {
      impactStar.focus();
      impactStar.click();
      expect(value(details, 'property:Impact')).toBe(impactField);
      expect(document.activeElement).toBe(impactStar);
      impactStar.click();
      expect(value(tray, 'property:Impact')).toBe(impactField);
      expect(tray.firstElementChild).toBe(impactField);
      expect(document.activeElement).toBe(impactStar);
      expect(rate.mock.calls).toEqual([
        [row, impact, '1'],
        [row, impact, null],
      ]);
    } finally {
      root.remove();
    }
  });
});
