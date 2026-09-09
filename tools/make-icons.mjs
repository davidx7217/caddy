// Regenerates the extension icons:  node tools/make-icons.mjs
//
// Zero dependencies, like everything else here -- node's zlib is all a PNG
// needs. Committing the PNGs but keeping the source that made them means the
// mark can be changed without hunting for whatever drew it.
//
// The mark matches the dock: the brand green, carrying a white card with a
// stripe across it. Drawn in normalised coordinates and supersampled 4x, so the
// same description renders cleanly at 16px and at 128px.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const GREEN = [10, 125, 63];       // #0a7d3f, the dock's colour
const WHITE = [255, 255, 255];
const SS = 4;                      // supersampling factor per axis

// Rounded rectangle in normalised space. Corners are quarter circles, which is
// why this is a distance test rather than four straight-edge comparisons.
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

// Returns [r,g,b,a] for one sample point, or null for transparent.
function sample(x, y) {
  if (!inRoundRect(x, y, 0, 0, 1, 1, 0.22)) return null;
  if (inRoundRect(x, y, 0.20, 0.28, 0.80, 0.72, 0.06)) {
    // The magnetic stripe, punched back out of the white card.
    return (y >= 0.37 && y <= 0.48) ? GREEN : WHITE;
  }
  return GREEN;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SS);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((pxi * SS + sx + 0.5) * step, (py * SS + sy + 0.5) * step);
          if (c) { r += c[0]; g += c[1]; b += c[2]; hits++; }
        }
      }
      const n = SS * SS;
      const o = (py * size + pxi) * 4;
      if (!hits) continue;                       // fully transparent
      // Average only the covered samples, then let alpha carry the coverage.
      // Averaging over all samples instead would darken every rounded corner.
      px[o] = Math.round(r / hits);
      px[o + 1] = Math.round(g / hits);
      px[o + 2] = Math.round(b / hits);
      px[o + 3] = Math.round((hits / n) * 255);
    }
  }
  return px;
}

function png(size, px) {
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  // Filter byte 0 (None) per scanline. The images are tiny; a smarter filter
  // would save bytes nobody is counting.
  const raw = Buffer.concat(Array.from({ length: size }, (_, y) =>
    Buffer.concat([Buffer.from([0]), px.subarray(y * size * 4, (y + 1) * size * 4)])));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;  // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const out = new URL(`../icons/icon${size}.png`, import.meta.url);
  writeFileSync(out, png(size, render(size)));
  console.log(`icons/icon${size}.png`);
}
