import { OPTION_COLORS, type OptionColorKey, type Property, type PropertyValue } from './contracts';
import { BASES_SYNC_KEY } from './sync-marker';

const LINE_BREAK = /\r\n|[\r\n\u0085\u2028\u2029]/;
const LINE_PARTS = new RegExp(`(${LINE_BREAK.source})`);
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
// Disjoint from the old JSON string-array format, without interpreting its contents.
const LEGACY_OPTIONS = /^\[\s*(?:"(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*\s*)?\]$/;
const optionColorKeys: ReadonlySet<unknown> = new Set(OPTION_COLORS);

// Preserve labels as written by the user, but key matching is case-insensitive.
function keyIdentity(key: string): string {
  return key.trim().normalize('NFC').toLowerCase();
}

// Native field names can appear as, for example, publicationTitle or publication-title.
function reservedIdentity(key: string): string {
  return keyIdentity(key).replace(/[\s_-]/g, '');
}

const RESERVED = new Set(
  [
    'Citation Key',
    'Citekey',
    'BibTeX Key',
    'BibLaTeX Key',
    'DOI',
    'arXiv',
    'PMID',
    'PMCID',
    'ISBN',
    'ISSN',
    'URL',
    'Item Type',
    'Type',
    'Title',
    'Short Title',
    'Author',
    'Editor',
    'Translator',
    'Date',
    'Issued',
    'Access Date',
    'Accessed',
    'Publication Title',
    'Container Title',
    'Journal Abbreviation',
    'Publisher',
    'Publisher Place',
    'Volume',
    'Issue',
    'Pages',
    'Page',
    'Edition',
    'Series',
    'Language',
    'Abstract',
    'Abstract Note',
    'Archive',
    'Archive Location',
    'Rights',
    'Extra',
    BASES_SYNC_KEY,
  ].map(reservedIdentity),
);

export function isReservedPropertyKey(key: string, extraReserved?: ReadonlySet<string>): boolean {
  const identity = reservedIdentity(key);
  let reserved = RESERVED.has(identity) || identity.startsWith('tex.');
  if (!reserved && extraReserved) {
    for (const name of extraReserved) {
      if (reservedIdentity(name) !== identity) continue;
      reserved = true;
      break;
    }
  }
  return reserved;
}

function validatedKey(raw: string, extraReserved?: ReadonlySet<string>): string {
  const key = raw.trim().normalize('NFC');
  if (!key || raw.includes(':') || LINE_BREAK.test(raw)) {
    throw new Error('Property names must be nonempty, single-line, and contain no colon.');
  }
  if (isReservedPropertyKey(key, extraReserved)) {
    throw new Error('This property name is reserved by Zotero or its citation tools.');
  }
  return key;
}

// Options are case-sensitive. Trim and NFC-normalize them so visually identical labels match.
function optionLabel(raw: string): string {
  const label = readLabel(raw);
  if (!label) {
    throw new Error(
      'Option names must be single-line labels without semicolons or JSON array syntax.',
    );
  }
  return label;
}

export function validateProperty(
  property: Property,
  extraReserved?: ReadonlySet<string>,
): Property {
  const key = validatedKey(property.key, extraReserved);
  const { optionColors } = property;
  if (property.type !== 'single-select' && property.type !== 'multi-select') {
    if (optionColors !== undefined) throw new Error('Only select options can have colors.');
    return { key, type: property.type };
  }
  const options = (property.options ?? []).map(optionLabel);
  const labels = new Set(options);
  if (labels.size !== options.length) throw new Error('Option names must be unique.');
  if (optionColors === undefined) return { key, type: property.type, options };
  if (!optionColors || typeof optionColors !== 'object' || Array.isArray(optionColors)) {
    throw new Error('Invalid option colors.');
  }
  const colors: Partial<Record<string, OptionColorKey>> = Object.create(null);
  let hasColors = false;
  for (const [raw, color] of Object.entries(optionColors)) {
    const label = optionLabel(raw);
    if (!labels.has(label) || !optionColorKeys.has(color) || Object.hasOwn(colors, label)) {
      throw new Error('Each option color must match a unique option and use the palette.');
    }
    colors[label] = color;
    hasColors = true;
  }
  return { key, type: property.type, options, ...(hasColors && { optionColors: colors }) };
}

export function isDecimal(value: string): boolean {
  return DECIMAL.test(value) && Number.isFinite(Number(value));
}

function lineValue(line: string, key: string): string | null {
  const colon = line.indexOf(':');
  return colon >= 0 && keyIdentity(line.slice(0, colon)) === key
    ? line.slice(colon + 1).trim()
    : null;
}

function readLabel(raw: string): string | null {
  const label = raw.trim();
  return label && !raw.includes(';') && !LINE_BREAK.test(raw) && !LEGACY_OPTIONS.test(label)
    ? label.normalize('NFC')
    : null;
}

export function readProperty(extra: string, property: Property): PropertyValue {
  const lines = extra.split(LINE_BREAK);
  const key = keyIdentity(property.key);
  let value: string | null = null;
  for (let index = lines.length - 1; index >= 0; index--) {
    value = lineValue(lines[index] ?? '', key);
    if (value !== null) break;
  }
  switch (property.type) {
    case 'text':
      return value || null;
    case 'number':
      return value && isDecimal(value) ? value : null;
    case 'checkbox':
      return value === 'true';
    case 'single-select':
      return value ? readLabel(value) : null;
    case 'multi-select': {
      if (!value || LEGACY_OPTIONS.test(value)) return [];
      const labels = new Set<string>();
      for (const part of value.split(';')) {
        const label = readLabel(part);
        if (label !== null) labels.add(label);
      }
      return [...labels];
    }
  }
}

function encode(property: Property, value: PropertyValue): string | null {
  if (value === null) return null;
  switch (property.type) {
    case 'text':
      if (typeof value === 'string' && !LINE_BREAK.test(value)) return value.trim() || null;
      throw new Error('Enter a single line of text.');
    case 'number': {
      if (typeof value === 'string' && !LINE_BREAK.test(value)) {
        const decimal = value.trim();
        if (!decimal) return null;
        if (isDecimal(decimal)) return decimal;
      }
      throw new Error('Enter a finite decimal number.');
    }
    case 'checkbox':
      if (typeof value === 'boolean') return value ? 'true' : null;
      throw new Error('Checkbox values must be true or false.');
    case 'single-select':
      if (typeof value === 'string') return optionLabel(value);
      throw new Error('Choose a single option.');
    case 'multi-select':
      if (Array.isArray(value)) return [...new Set(value.map(optionLabel))].join('; ') || null;
      throw new Error('Choose one or more options.');
  }
}

export function writeProperty(extra: string, property: Property, value: PropertyValue): string {
  const key = validatedKey(property.key);
  const identity = keyIdentity(key);
  const encoded = encode(property, value);
  const replacement = encoded === null ? '' : `${key}: ${encoded}`;
  const parts = extra.split(LINE_PARTS);
  let last = -1;
  for (let index = 0; index < parts.length; index += 2) {
    if (lineValue(parts[index] ?? '', identity) === null) continue;
    if (last !== -1) {
      parts[last] = '';
      parts[last + 1] = '';
    }
    last = index;
  }
  if (last === -1) {
    // Use the first existing separator when an append needs a new one.
    const separator = parts.at(-1) ? (parts[1] ?? '\n') : '';
    return replacement ? `${extra}${separator}${replacement}` : extra;
  }
  parts[last] = replacement;
  if (!replacement && last + 1 < parts.length) parts[last + 1] = '';
  return parts.join('');
}
