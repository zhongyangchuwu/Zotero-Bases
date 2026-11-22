import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createUpdateFeed } from './release-metadata.mjs';
import { zip } from './zip.mjs';

const result = await build({
  entryPoints: ['src/bootstrap.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'BasesBootstrap',
  target: 'es2022',
  legalComments: 'inline',
  write: false,
  metafile: true,
  footer: {
    js: 'var { startup, shutdown, onMainWindowUnload } = BasesBootstrap;',
  },
});
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.startsWith('src/')) throw new Error(`Unexpected runtime dependency: ${input}`);
}
const [license, preferences, popup, manifest] = await Promise.all(
  ['LICENSE', 'content/preferences.xhtml', 'content/window.xhtml', 'manifest.json'].map((path) =>
    readFile(path),
  ),
);
const files = [
  ['LICENSE', license],
  ['bootstrap.js', Buffer.from(result.outputFiles[0].contents)],
  ['content/preferences.xhtml', preferences],
  ['content/window.xhtml', popup],
  ['manifest.json', manifest],
];
const xpi = zip(files);
const updates = createUpdateFeed(JSON.parse(manifest), xpi);
await mkdir('build', { recursive: true });
await Promise.all([
  writeFile('zotero-bases.xpi', xpi),
  writeFile('build/updates.json', JSON.stringify(updates, null, 2) + '\n'),
]);
console.log('Built zotero-bases.xpi and build/updates.json');
