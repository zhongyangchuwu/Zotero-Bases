import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
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
const paths = ['LICENSE', 'content/window.xhtml', 'manifest.json'];
const files = await Promise.all(paths.map(async (path) => [path, await readFile(path)]));
files.push(['bootstrap.js', Buffer.from(result.outputFiles[0].contents)]);
files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
await writeFile('zotero-bases.xpi', zip(files));
console.log('Built zotero-bases.xpi');
