// Resize assets/icon.png to a square 1024x1024 build/icon.png (transparent padding).
// electron-builder derives .ico/.icns from this PNG at build time.
// Run: node scripts/gen-icon.js
const path = require('node:path');
const fs = require('node:fs');
const Jimp = require('jimp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'icon.png');
const OUT_DIR = path.join(ROOT, 'build');
const OUT = path.join(OUT_DIR, 'icon.png');
const SIZE = 1024;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const img = await Jimp.read(SRC);
  console.log(`source: ${img.bitmap.width}x${img.bitmap.height}`);
  // Fit inside SIZExSIZE preserving aspect ratio, then center on transparent canvas.
  img.contain(SIZE, SIZE, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
  const canvas = new Jimp(SIZE, SIZE, 0x00000000);
  canvas.composite(img, 0, 0);
  await canvas.writeAsync(OUT);
  console.log(`wrote ${OUT} (${SIZE}x${SIZE})`);
})().catch((e) => { console.error(e); process.exit(1); });
