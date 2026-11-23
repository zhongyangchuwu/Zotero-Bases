import { expect, it } from 'vitest';
import { DEFAULT_COLUMNS, NATIVE_COLUMN_DEFINITIONS, isNativeColumn } from '../src/contracts';

it('keeps the eight default columns and exposes every requested Zotero field exactly once', () => {
  const defaults = ['title', 'creators', 'year', 'source', 'type', 'tags', 'pdf', 'added'];
  const common = [
    ...defaults,
    'citationKey',
    'collections',
    'date',
    'dateModified',
    'lastRead',
    'notesCount',
    'attachmentsCount',
    'doi',
    'url',
    'journalAbbreviation',
    'publisher',
    'shortTitle',
  ];
  const more = [
    'volume',
    'issue',
    'pages',
    'language',
    'series',
    'seriesTitle',
    'callNumber',
    'place',
    'edition',
    'accessDate',
    'archive',
    'archiveLocation',
    'rights',
  ];
  expect(DEFAULT_COLUMNS).toEqual(defaults);
  expect(
    NATIVE_COLUMN_DEFINITIONS.filter(({ group }) => group === 'common').map(({ key }) => key),
  ).toEqual(common);
  expect(
    NATIVE_COLUMN_DEFINITIONS.filter(({ group }) => group === 'more').map(({ key }) => key),
  ).toEqual(more);
  expect(isNativeColumn('toString')).toBe(false);
  expect(isNativeColumn('property:Year')).toBe(false);
});
