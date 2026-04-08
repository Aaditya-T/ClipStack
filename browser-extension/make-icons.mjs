import { writeFileSync } from 'fs';
import zlib from 'zlib';

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rawData = Buffer.allocUnsafe(size * (size * 4 + 1));
  let offset = 0;

  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const r = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    rawData[offset++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r + 0.5) {
        const alpha = Math.min(1, Math.max(0, (r + 0.5 - dist)));
        const t = Math.max(0, 1 - dist / r);
        // Deep purple / indigo
        const rv = Math.round(100 + t * 24);
        const gv = Math.round(80 + t * 20);
        const bv = Math.round(220 + t * 35);
        const av = Math.round(alpha * 255);
        rawData[offset++] = Math.min(255, rv);
        rawData[offset++] = Math.min(255, gv);
        rawData[offset++] = Math.min(255, bv);
        rawData[offset++] = av;
      } else {
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

for (const size of [16, 48, 128]) {
  const png = makePng(size);
  writeFileSync(`icons/icon${size}.png`, png);
  console.log(`Created icons/icon${size}.png (${png.length} bytes)`);
}
