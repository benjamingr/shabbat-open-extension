#!/usr/bin/env node
/*
 * Generate extension icons (16/32/48/128 px) as PNGs — no external deps.
 * Draws a Shabbat candle with a flame on a deep-purple rounded-square tile,
 * supersampled 4x for anti-aliasing. Run: node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// public/ is copied verbatim into dist/ by Vite, so the icons land at dist/icons/.
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [42, 35, 80]; // #2a2350 deep purple
const BODY = [245, 236, 208]; // cream candle
const BODY_SH = [214, 201, 165]; // candle shadow side
const FLAME_OUT = [230, 178, 60]; // gold
const FLAME_IN = [255, 224, 138]; // bright tip
const WICK = [58, 48, 38];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function inRoundedRect(x, y, l, t, r, b, rad) {
  if (x < l || x > r || y < t || y > b) return false;
  const cx = x < l + rad ? l + rad : x > r - rad ? r - rad : x;
  const cy = y < t + rad ? t + rad : y > b - rad ? b - rad : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Returns [r,g,b,a] for a point in the hi-res unit space (0..1).
function sample(u, v, S) {
  const x = u * S, y = v * S;
  // Flame: teardrop = circle (lower) + triangle (upper), pointing up.
  const fcx = 0.5 * S, fcy = 0.32 * S, fr = 0.10 * S, ftop = 0.14 * S;
  const inFlameCircle = (x - fcx) ** 2 + (y - fcy) ** 2 <= fr * fr;
  const inFlameTri = inTriangle(x, y, fcx, ftop, fcx - fr, fcy, fcx + fr, fcy);
  if (inFlameCircle || inFlameTri) {
    // brighter toward center/tip
    const d = Math.hypot(x - fcx, y - (fcy - fr * 0.3)) / (fr * 1.4);
    return [...mix(FLAME_IN, FLAME_OUT, Math.min(1, d)), 255];
  }
  // Wick
  if (x >= 0.485 * S && x <= 0.515 * S && y >= 0.4 * S && y <= 0.45 * S) {
    return [...WICK, 255];
  }
  // Candle body (rounded rect) with a soft left-light / right-shadow.
  const bl = 0.4 * S, br = 0.6 * S, bt = 0.45 * S, bb = 0.86 * S, brad = 0.03 * S;
  if (inRoundedRect(x, y, bl, bt, br, bb, brad)) {
    const t = (x - bl) / (br - bl); // 0 left .. 1 right
    return [...mix(BODY, BODY_SH, Math.max(0, (t - 0.55) * 1.6)), 255];
  }
  // Background tile
  if (inRoundedRect(x, y, 0.02 * S, 0.02 * S, 0.98 * S, 0.98 * S, 0.2 * S)) {
    return [...BG, 255];
  }
  return [0, 0, 0, 0]; // transparent
}

function renderPNG(size) {
  const ss = 4; // supersample factor
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (px + (sx + 0.5) / ss) / size;
          const v = (py + (sy + 0.5) / ss) / size;
          const s = sample(u, v, 1000);
          // premultiply for correct edge blending
          const af = s[3] / 255;
          r += s[0] * af; g += s[1] * af; b += s[2] * af; a += s[3];
        }
      }
      const n = ss * ss;
      const af = a / n;
      const i = (py * size + px) * 4;
      if (af > 0) {
        buf[i] = Math.round((r / n) / (af / 255));
        buf[i + 1] = Math.round((g / n) / (af / 255));
        buf[i + 2] = Math.round((b / n) / (af / 255));
      }
      buf[i + 3] = Math.round(af);
    }
  }
  return encodePNG(buf, size, size);
}

// --- minimal PNG encoder ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw with per-row filter byte 0
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const png = renderPNG(size);
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`wrote public/icons/icon${size}.png (${png.length} bytes)`);
}
