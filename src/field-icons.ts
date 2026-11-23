import { NATIVE_COLUMN_BY_KEY, isNativeColumn, type Column, type PropertyType } from './contracts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const paths: Record<string, string> = {
  title: 'M3 3h10M8 3v10M5.5 13h5',
  creators: 'M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 13c0-2.3 2.2-4 5-4s5 1.7 5 4',
  calendar: 'M5 2v2M11 2v2M2.5 5.5h11M3 3h10v10H3z',
  book: 'M3 2.5h7a3 3 0 0 1 3 3v8H5a2 2 0 0 1-2-2zm0 9a2 2 0 0 1 2-2h8',
  type: 'M3 3h4l6 6-4 4-6-6zm2 2h.01',
  tags: 'M2.5 3h4l6.5 6.5-3.5 3.5L3 6.5zm2 2h.01M8.5 3h2l3 3',
  pdf: 'M4 2.5h5l3 3v8H4zm5 0v3h3M6 9h4M6 11h4',
  citation: 'M7 4H3v5h4c0 2-1 3-3 4m9-9H9v5h4c0 2-1 3-3 4',
  collections: 'M2 4h4l1-1h6v9H2zm2 10h10',
  link: 'M7 9l2-2M6 10l-1 1a2 2 0 0 1-3-3l3-3a2 2 0 0 1 3 0m2 1 1-1a2 2 0 0 1 3 3l-3 3a2 2 0 0 1-3 0',
  notes: 'M3 2.5h10v8l-3 3H3zm7 11v-3h3M5.5 6h5M5.5 8h5',
  attachments: 'M5 8l4-4a2 2 0 0 1 3 3l-5 5a3 3 0 0 1-4-4l5-5',
  text: 'M2.5 3h11M8 3v10M5.5 13h5',
  number: 'M6 2 4.5 14M11.5 2 10 14M2 6h12M1.5 10h12',
  checkbox: 'M3 3h10v10H3zm2.5 5 1.5 1.5 3.5-3.5',
  'single-select': 'M3 4h10M3 8h7M3 12h10m8-5 2 2 2-2',
  'multi-select': 'M3 4h7M3 8h7M3 12h7m1-8 1 1 2-2m-3 9 1 1 2-2',
};

/** Creates a decorative, monochrome icon in the host document. */
export function createFieldIcon(
  document: Document,
  column: Column,
  propertyType?: PropertyType,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('zb-field-icon');
  const path = document.createElementNS(SVG_NS, 'path');
  const key = isNativeColumn(column) ? NATIVE_COLUMN_BY_KEY[column].icon : (propertyType ?? 'text');
  path.setAttribute('d', paths[key] ?? paths.text!);
  svg.append(path);
  return svg;
}
