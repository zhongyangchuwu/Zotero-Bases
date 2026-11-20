import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const RELEASES = 'https://github.com/zhongyangchuwu/Zotero-Bases/releases';
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function createUpdateFeed(manifest, xpi) {
  const zotero = manifest.applications?.zotero;
  assert.equal(
    zotero?.update_url,
    `${RELEASES}/latest/download/updates.json`,
    'The XPI must declare the public HTTPS update_url for Zotero Bases',
  );
  const { id, strict_min_version, strict_max_version } = zotero;
  const { version } = manifest;
  assert(typeof version === 'string' && STABLE_VERSION.test(version), 'Expected a stable version');

  return {
    addons: {
      [id]: {
        updates: [
          {
            version,
            update_link: `${RELEASES}/download/v${version}/zotero-bases.xpi`,
            update_hash: `sha256:${createHash('sha256').update(xpi).digest('hex')}`,
            applications: { zotero: { strict_min_version, strict_max_version } },
          },
        ],
      },
    },
  };
}
