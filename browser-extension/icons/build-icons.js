#!/usr/bin/env node
/**
 * Gera ícones PNG simples para a extensão usando apenas módulos nativos do Node.
 * Execute com: node browser-extension/icons/build-icons.js
 */

import { createWriteStream } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function writeUint32(buf, offset, value) {
  buf[offset] = (value >> 24) & 0xff;
  buf[offset + 1] = (value >> 16) & 0xff;
  buf[offset + 2] = (value >> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function pngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  writeUint32(chunk, 0, len);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const crc = Buffer.concat([Buffer.from(type, "ascii"), data]);
  writeUint32(chunk, 8 + len, crc32(crc));
  return chunk;
}

function crc32(buf) {
  let c = ~0;
  const table = crc32.table || (crc32.table = makeCrcTable());
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return ~c >>> 0;
}

function makeCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
}

function createIcon(size) {
  const bytesPerPixel = 4;
  const rowSize = 1 + size * bytesPerPixel;
  const imageData = Buffer.alloc(rowSize * size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize;
    imageData[rowStart] = 0; // filter byte
    const ratio = y / (size - 1 || 1);
    const r = Math.round(162 * (1 - ratio) + 0 * ratio);
    const g = Math.round(0 * (1 - ratio) + 212 * ratio);
    const b = Math.round(255 * (1 - ratio) + 255 * ratio);
    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * bytesPerPixel;
      imageData[i] = r;
      imageData[i + 1] = g;
      imageData[i + 2] = b;
      imageData[i + 3] = 255;
    }
  }

  // Draw a simple monitor shape in the center.
  const padX = Math.round(size * 0.18);
  const padY = Math.round(size * 0.22);
  const monW = size - padX * 2;
  const monH = Math.round(size * 0.42);
  const monX = padX;
  const monY = padY;
  const screenX = Math.round(monX + monW * 0.1);
  const screenY = Math.round(monY + monH * 0.12);
  const screenW = Math.round(monW * 0.8);
  const screenH = Math.round(monH * 0.6);

  for (let y = monY; y < monY + monH && y < size; y++) {
    for (let x = monX; x < monX + monW && x < size; x++) {
      const rowStart = y * rowSize;
      const i = rowStart + 1 + x * bytesPerPixel;
      const inScreen = x >= screenX && x < screenX + screenW && y >= screenY && y < screenY + screenH;
      if (inScreen) {
        imageData[i] = 22;
        imageData[i + 1] = 27;
        imageData[i + 2] = 34;
        imageData[i + 3] = 255;
      } else {
        imageData[i] = 13;
        imageData[i + 1] = 17;
        imageData[i + 2] = 23;
        imageData[i + 3] = 255;
      }
    }
  }

  // Draw a small green dot below the monitor.
  const dotR = Math.max(1, Math.round(size / 16));
  const cx = Math.round(size / 2);
  const cy = Math.round(monY + monH + size * 0.08);
  for (let y = cy - dotR; y <= cy + dotR; y++) {
    for (let x = cx - dotR; x <= cx + dotR; x++) {
      if (x >= 0 && x < size && y >= 0 && y < size && (x - cx) ** 2 + (y - cy) ** 2 <= dotR ** 2) {
        const rowStart = y * rowSize;
        const i = rowStart + 1 + x * bytesPerPixel;
        imageData[i] = 0;
        imageData[i + 1] = 255;
        imageData[i + 2] = 136;
        imageData[i + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  writeUint32(ihdr, 0, size);
  writeUint32(ihdr, 4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = deflateSync(imageData);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const buf = createIcon(size);
  const path = join(__dirname, `icon${size}.png`);
  createWriteStream(path).end(buf);
  console.log(`Created ${path}`);
}
