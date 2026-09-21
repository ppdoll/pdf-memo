// PWA 아이콘 PNG를 외부 의존성 없이 생성한다 (zlib만 사용).
// 실행: pnpm --filter @pdf-memo/web gen:icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const INDIGO = [79, 70, 229];
const WHITE = [255, 255, 255];
const LINE = [203, 213, 225];
const AMBER = [245, 158, 11];

// ---------- PNG 인코딩 ----------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** pixel(u, v) → [r, g, b, a], u/v ∈ [0, 1). 2x2 슈퍼샘플링으로 가장자리를 부드럽게 한다. */
function encodePng(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const offsets = [0.25, 0.75];
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const dy of offsets) {
        for (const dx of offsets) {
          const [pr, pg, pb, pa] = pixel((x + dx) / size, (y + dy) / size);
          r += pr * pa;
          g += pg * pa;
          b += pb * pa;
          a += pa;
        }
      }
      const o = y * stride + 1 + x * 4;
      if (a > 0) {
        raw[o] = Math.round(r / a);
        raw[o + 1] = Math.round(g / a);
        raw[o + 2] = Math.round(b / a);
      }
      raw[o + 3] = Math.round((a / 4) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 도형 ----------
function inRoundRect(u, v, x0, y0, x1, y1, r) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = u < x0 + r ? x0 + r : u > x1 - r ? x1 - r : u;
  const cy = v < y0 + r ? y0 + r : v > y1 - r ? y1 - r : v;
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

/** 아이콘 본체. scale로 안전 영역 안에 축소 배치할 수 있다. */
function artwork(u, v, scale) {
  const cu = 0.5 + (u - 0.5) / scale;
  const cv = 0.5 + (v - 0.5) / scale;
  if (cu < 0 || cu > 1 || cv < 0 || cv > 1) return null;
  // 펜 스트로크
  if (cu >= 0.34 && cu <= 0.66) {
    const t = (cu - 0.34) / 0.32;
    const curve = 0.63 + 0.07 * Math.sin(t * Math.PI * 2);
    if (Math.abs(cv - curve) < 0.028) return AMBER;
  }
  // 종이 위 가로줄
  if (cu >= 0.34 && cu <= 0.66) {
    for (const ly of [0.32, 0.41]) if (Math.abs(cv - ly) < 0.012) return LINE;
  }
  // 종이
  if (inRoundRect(cu, cv, 0.26, 0.18, 0.74, 0.82, 0.04)) return WHITE;
  return null;
}

function roundedIcon(u, v) {
  if (!inRoundRect(u, v, 0, 0, 1, 1, 0.22)) return [0, 0, 0, 0];
  return [...(artwork(u, v, 1) ?? INDIGO), 1];
}
function fullBleedIcon(scale) {
  return (u, v) => [...(artwork(u, v, scale) ?? INDIGO), 1];
}

mkdirSync(OUT_DIR, { recursive: true });
const files = [
  ['icon-192.png', encodePng(192, roundedIcon)],
  ['icon-512.png', encodePng(512, roundedIcon)],
  ['maskable-512.png', encodePng(512, fullBleedIcon(0.8))],
  ['apple-touch-icon.png', encodePng(180, fullBleedIcon(0.9))],
];
for (const [name, buf] of files) {
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}
