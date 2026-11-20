export const BASES_SYNC_KEY = 'Zotero Bases Sync';
export const BASES_SYNC_MARKER = `${BASES_SYNC_KEY}: v1`;

export function isBasesSyncCarrier(extra: string): boolean {
  return (
    extra === BASES_SYNC_MARKER ||
    (extra.includes(BASES_SYNC_MARKER) && extra.split(/\r?\n/u).includes(BASES_SYNC_MARKER))
  );
}
