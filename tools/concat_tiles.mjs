#!/usr/bin/env node
/**
 * 工具：将8张16x16 PNG横向拼合为1张128x16 PNG（tileset格式）
 * 用法：node tools/concat_tiles.mjs tile1.png tile2.png ... tile8.png out.png
 * 用PNG原生字节格式：纯手动组装8张16x16子图的像素数据，无需任何图像库
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

function pngDecode(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('not PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const bitDepth = buf[24], colorType = buf[25];
  // 解析 IDAT 块
  const idatChunks = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // CRC
    if (type === 'IDAT') idatChunks.push(data);
    else if (type === 'IEND') break;
  }
  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);
  // 去 filter 字节（每行首字节是 filter type）
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1; // bytes per pixel
  const stride = w * bpp;
  const pixels = Buffer.alloc(w * h * bpp);
  let prevRow = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const cur = raw[rowStart + x];
      const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const up = prevRow[x];
      const upLeft = x >= bpp ? prevRow[x - bpp] : 0;
      let v = cur;
      if (filter === 1) v = (cur + left) & 0xff;
      else if (filter === 2) v = (cur + up) & 0xff;
      else if (filter === 3) v = (cur + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        const paeth = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
        v = (cur + paeth) & 0xff;
      }
      pixels[y * stride + x] = v;
    }
    prevRow = pixels.slice(y * stride, (y + 1) * stride);
  }
  return { width: w, height: h, colorType, bitDepth, pixels, bpp };
}

function pngEncode(width, height, colorType, bitDepth, pixels) {
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // IDAT: 加 filter 字节 + deflate
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0 (none)
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw);
  // CRC
  function crc32(buf) {
    let c, table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const args = process.argv.slice(2);
if (args.length < 3) { console.error('用法: node concat_tiles.mjs tile1.png ... tile8.png out.png'); process.exit(1); }
const out = args.pop();
const inputs = args;
const decoded = inputs.map(p => pngDecode(fs.readFileSync(p)));
const w = decoded.reduce((s, d) => s + d.width, 0);
const h = decoded[0].height;
const colorType = decoded[0].colorType;
const bitDepth = decoded[0].bitDepth;
const bpp = decoded[0].bpp;
const total = w * h * bpp;
const merged = Buffer.alloc(total);
let xoff = 0;
for (const d of decoded) {
  d.pixels.copy(merged, xoff * bpp);
  xoff += d.width;
}
const out2 = pngEncode(w, h, colorType, bitDepth, merged);
fs.writeFileSync(out, out2);
console.log(`✓ ${w}x${h} (${decoded.length} tiles hstacked) → ${out} (${out2.length}B)`);