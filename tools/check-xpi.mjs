import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { createUpdateFeed } from './release-metadata.mjs';

const xpi = await readFile('zotero-bases.xpi');
const end = xpi.length - 22;
assert.equal(xpi.readUInt32LE(end), 0x06054b50);
const count = xpi.readUInt16LE(end + 10);
const directory = xpi.readUInt32LE(end + 16);
let pointer = directory;
let offset = 0;
const actual = new Map();
for (let i = 0; i < count; i++) {
  assert.equal(xpi.readUInt32LE(pointer), 0x02014b50);
  assert.equal(xpi.readUInt32LE(offset), 0x04034b50);
  assert.equal(xpi.readUInt32LE(pointer + 42), offset);
  assert.deepEqual(xpi.subarray(pointer + 6, pointer + 32), xpi.subarray(offset + 4, offset + 30));
  assert.equal(xpi.readUInt16LE(pointer + 10), 0);
  assert.equal(xpi.readUInt32LE(pointer + 12), 33 << 16);
  assert.equal(xpi.readUInt32LE(pointer + 30), 0); // No extra fields or comments.
  const length = xpi.readUInt16LE(pointer + 28);
  const name = xpi.subarray(pointer + 46, pointer + 46 + length);
  assert.deepEqual(name, xpi.subarray(offset + 30, offset + 30 + length));
  const dataStart = offset + 30 + length;
  offset = dataStart + xpi.readUInt32LE(pointer + 20);
  const data = xpi.subarray(dataStart, offset);
  assert.equal(data.length, xpi.readUInt32LE(pointer + 24));
  assert.equal(crc32(data), xpi.readUInt32LE(pointer + 16));
  assert(!actual.has(name.toString()), 'Duplicate ZIP member');
  actual.set(name.toString(), data);
  pointer += 46 + length;
}
assert.equal(offset, directory);
assert.equal(pointer, end);
assert.deepEqual(
  [...actual.keys()],
  ['LICENSE', 'bootstrap.js', 'content/window.xhtml', 'manifest.json'],
);
for (const path of ['LICENSE', 'content/window.xhtml', 'manifest.json']) {
  assert.deepEqual(actual.get(path), await readFile(path));
}
const manifest = JSON.parse(actual.get('manifest.json'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const zotero = manifest.applications.zotero;
const updates = JSON.parse(await readFile('build/updates.json', 'utf8'));
assert.equal(manifest.version, pkg.version);
assert.deepEqual(updates, createUpdateFeed(manifest, xpi), 'Update feed does not match the XPI');
assert.equal(zotero.strict_min_version, '10.0');
assert.equal(zotero.strict_max_version, '10.0.*');
console.log(`Verified ${count} XPI members, version ${manifest.version}`);
