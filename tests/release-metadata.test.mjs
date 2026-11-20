import { describe, expect, it } from 'vitest';
import { createUpdateFeed } from '../tools/release-metadata.mjs';

const id = 'bases@example.test';
const releases = 'https://github.com/zhongyangchuwu/Zotero-Bases/releases';
const zotero = {
  id,
  update_url: `${releases}/latest/download/updates.json`,
  strict_min_version: '10.0',
  strict_max_version: '10.0.*',
};
const manifest = { version: '0.2.0', applications: { zotero } };
const bytes = Buffer.from('abc');

describe('Zotero update feed', () => {
  it('publishes the checked package version, byte hash, and Zotero compatibility at the tag URL', () => {
    expect(createUpdateFeed(manifest, bytes)).toEqual({
      addons: {
        [id]: {
          updates: [
            {
              version: '0.2.0',
              update_link: `${releases}/download/v0.2.0/zotero-bases.xpi`,
              update_hash:
                'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
              applications: {
                zotero: { strict_min_version: '10.0', strict_max_version: '10.0.*' },
              },
            },
          ],
        },
      },
    });
  });

  it.each([
    undefined,
    'updates.json',
    'https://example.org/updates.json',
    zotero.update_url.replace('https:', 'http:'),
  ])('rejects a missing, insecure, or unrelated feed URL: %s', (update_url) => {
    expect(() =>
      createUpdateFeed({ ...manifest, applications: { zotero: { ...zotero, update_url } } }, bytes),
    ).toThrow(/update_url/u);
  });

  it.each(['0.2.0-beta.1', '0.02.0', '0.2.0/other'])(
    'does not advertise %s as a stable release',
    (version) => {
      expect(() => createUpdateFeed({ ...manifest, version }, bytes)).toThrow(/stable version/u);
    },
  );
});
