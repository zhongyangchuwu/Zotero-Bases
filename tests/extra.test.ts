import { describe, expect, it } from 'vitest';
import type { Property, PropertyValue } from '../src/contracts';
import { readProperty, validateProperty, writeProperty } from '../src/extra';

const note: Property = { key: 'Reading Note', type: 'text' };
const score: Property = { key: 'Confidence', type: 'number' };
const checked: Property = { key: 'Reviewed', type: 'checkbox' };
const stage: Property = { key: 'Status', type: 'single-select', options: ['Draft', 'Reading'] };
const methods: Property = {
  key: 'Method',
  type: 'multi-select',
  options: ['Transformer', 'Diffusion'],
};

describe('property definitions', () => {
  it.each([
    '  dOi ',
    'ARXIV',
    'pmid',
    'PMCID',
    'citation-key',
    'citationKey',
    'BibTeX_Key',
    'container_title',
    'publicationTitle',
    ' TeX.custom-field ',
  ])('protects the reserved Extra key %s', (key) => {
    expect(() => validateProperty({ key, type: 'text' })).toThrow(/reserved/);
    expect(() => writeProperty(`${key}: keep`, { key, type: 'text' }, null)).toThrow(/reserved/);
  });

  it('protects a host-provided field using its native and display aliases', () => {
    const native = new Set(['runningTime', 'Conference Name']);
    expect(() => validateProperty({ key: 'Running_Time', type: 'number' }, native)).toThrow(
      /reserved/,
    );
    expect(() => validateProperty({ key: 'conference-name', type: 'text' }, native)).toThrow(
      /reserved/,
    );
    expect(validateProperty(note, native)).toEqual(note);
  });

  it('normalizes labels but preserves distinct casing and bracketed literal names', () => {
    expect(
      validateProperty({
        key: '  E\u0301tape ',
        type: 'single-select',
        options: [' Cafe\u0301 ', 'café', '[Reading]'],
      }),
    ).toEqual({ key: 'Étape', type: 'single-select', options: ['Café', 'café', '[Reading]'] });
    expect(() => validateProperty({ ...methods, options: ['  Café', 'Cafe\u0301 '] })).toThrow(
      /unique/,
    );
  });

  it.each(['', ' ', 'X:Y', 'X\n', 'X\rY', 'X\u2028Y'])('rejects non-line-key name %j', (key) => {
    expect(() => validateProperty({ key, type: 'text' })).toThrow();
  });

  it.each([' ', 'X; Y', 'X\nY', 'X\r', '["opt_8f3a"]'])(
    'rejects ambiguous or empty option %j',
    (label) => {
      expect(() => validateProperty({ ...methods, options: [label] })).toThrow();
      expect(() => writeProperty('', methods, [label])).toThrow();
    },
  );
});

describe('Extra property values', () => {
  const roundTrips: readonly (readonly [Property, PropertyValue, string, PropertyValue])[] = [
    [
      note,
      '  Introduction: see table 2  ',
      'Reading Note: Introduction: see table 2',
      'Introduction: see table 2',
    ],
    [score, '  +002.5000e-1  ', 'Confidence: +002.5000e-1', '+002.5000e-1'],
    [checked, true, 'Reviewed: true', true],
    [stage, ' Reading ', 'Status: Reading', 'Reading'],
    [
      methods,
      [' Diffusion ', 'Transformer', 'Diffusion'],
      'Method: Diffusion; Transformer',
      ['Diffusion', 'Transformer'],
    ],
  ];

  it.each(roundTrips)(
    'round-trips a typed value as readable text',
    (property, value, extra, expected) => {
      expect(writeProperty('', property, value)).toBe(extra);
      expect(readProperty(extra, property)).toEqual(expected);
    },
  );

  it('keeps literal orphan labels instead of losing them during unrelated option edits', () => {
    const extra = 'Method: Transformer; Retired; Retired; [Other]';
    expect(readProperty(extra, methods)).toEqual(['Transformer', 'Retired', '[Other]']);
    expect(writeProperty(extra, methods, ['Diffusion', 'Retired', '[Other]'])).toBe(
      'Method: Diffusion; Retired; [Other]',
    );
    expect(readProperty('Status: Retired', stage)).toBe('Retired');
    expect(readProperty('Status: reading', stage)).toBe('reading');
    expect(readProperty('Status: Cafe\u0301', stage)).toBe('Café');
  });

  it('does not decode the old machine-ID format', () => {
    expect(readProperty('Status: ["opt_8f3a"]', stage)).toBeNull();
    expect(readProperty('Method: ["opt_8f3a", "opt_1200"]', methods)).toEqual([]);
    expect(readProperty('Method: [ ]', methods)).toEqual([]);
  });

  it.each(['Infinity', 'NaN', '0x20', '1e309', '12 items', '1,25'])(
    'rejects non-decimal number %s',
    (value) => {
      expect(readProperty(`Confidence: ${value}`, score)).toBeNull();
      expect(() => writeProperty('', score, value)).toThrow(/finite decimal/);
    },
  );

  it('clears false and empty values without storing placeholders, and refuses line injection', () => {
    expect(writeProperty('Reviewed: true', checked, false)).toBe('');
    expect(readProperty('', checked)).toBe(false);
    expect(readProperty('Reviewed: TRUE', checked)).toBe(false);
    expect(readProperty('Reviewed: false', checked)).toBe(false);
    expect(readProperty('Reviewed: 1', checked)).toBe(false);
    expect(writeProperty('Reading Note: old', note, '  ')).toBe('');
    expect(writeProperty('Confidence: 0', score, null)).toBe('');
    expect(writeProperty('Status: Reading', stage, null)).toBe('');
    expect(writeProperty('Method: Transformer', methods, [])).toBe('');
    expect(() => writeProperty('', note, 'First\nDOI: changed')).toThrow();
    expect(() => writeProperty('', score, '2\n')).toThrow();
  });

  it('reads the latest matching key, and collapses duplicates in that position on write', () => {
    const extra =
      'DOI: 10.0000/A\r\n  STATUS : Draft\r\nfree text  \rstatus-code: keep\nstatus: Reading\n\n';
    expect(readProperty(extra, stage)).toBe('Reading');
    expect(writeProperty(extra, stage, 'Draft')).toBe(
      'DOI: 10.0000/A\r\nfree text  \rstatus-code: keep\nStatus: Draft\n\n',
    );
    expect(readProperty('E\u0301TAPE: Reading', { ...stage, key: 'Étape' })).toBe('Reading');
  });

  it('treats a malformed latest value as missing and removes all matching lines when clearing', () => {
    const extra =
      'Confidence: 99\r\nNative note:  preserved\n cOnFiDeNcE : not a number\rOther: keep';
    expect(readProperty(extra, score)).toBeNull();
    expect(writeProperty(extra, score, null)).toBe('Native note:  preserved\nOther: keep');
    expect(readProperty('Reading Note: old\nReading Note:    ', note)).toBeNull();
  });

  it('keeps untouched line endings when appending, replacing, or removing', () => {
    expect(writeProperty('Native: keep\r\nfree text', checked, true)).toBe(
      'Native: keep\r\nfree text\r\nReviewed: true',
    );
    expect(writeProperty('Native: keep\r\n', checked, true)).toBe('Native: keep\r\nReviewed: true');
    expect(writeProperty('Status: Draft\u2028Other: keep', stage, 'Reading')).toBe(
      'Status: Reading\u2028Other: keep',
    );
    expect(writeProperty('Native: keep\rReviewed: true', checked, false)).toBe('Native: keep\r');
  });
});
