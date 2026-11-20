import { crc32, deflateRawSync } from 'node:zlib';

export function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  for (const [path, bytes] of files) {
    const name = Buffer.from(path);
    const compressed = deflateRawSync(bytes, { level: 9 });
    const data = Buffer.alloc(26);
    data.writeUInt16LE(20, 0);
    data.writeUInt16LE(0x800, 2); // UTF-8 paths
    data.writeUInt16LE(8, 4); // deflate
    data.writeUInt16LE(33, 8); // 1980-01-01, independent of host and TZ
    data.writeUInt32LE(crc32(bytes), 10);
    data.writeUInt32LE(compressed.length, 14);
    data.writeUInt32LE(bytes.length, 18);
    data.writeUInt16LE(name.length, 22);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    data.copy(header, 4);
    local.push(header, name, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(0x0314, 4); // Unix permissions, ZIP v2.0
    data.copy(record, 6);
    record.writeUInt32LE(0o100644 * 65536, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += header.length + name.length + compressed.length;
    centralSize += record.length + name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
