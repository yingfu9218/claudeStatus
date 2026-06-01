// Generate app icons from assets/icon.png.
//
// Produces:
//   build/icon.png            1024x1024 square (mac/win: electron-builder derives .icns/.ico)
//   build/icons/<N>x<N>.png   pre-sized PNG set (linux: used directly, avoids 0x0 size-inference bug)
//
// Why the directory: electron-builder's Linux icon path infers dimensions of a single
// PNG via its bundled app-builder Go binary. With a jimp-written PNG that inference
// returned 0x0, landing the icon under hicolor/0x0/apps/ (invalid -> broken icon).
// A build/icons/ dir of explicitly-named sizes is consumed directly, no inference.
//
// Run: node scripts/gen-icon.js  (or: npm run icon)
const path = require('node:path');
const fs = require('node:fs');
const Jimp = require('jimp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'icon.png');
const BUILD = path.join(ROOT, 'build');
const ICONS_DIR = path.join(BUILD, 'icons');
const BASE = 1024;
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function squareCanvas(srcImg, size) {
  // Fit inside size×size preserving aspect ratio, centered on a transparent canvas.
  const img = srcImg.clone().contain(size, size, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
  const canvas = new Jimp(size, size, 0x00000000);
  canvas.composite(img, 0, 0);
  return canvas;
}

(async () => {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const src = await Jimp.read(SRC);
  console.log(`source: ${src.bitmap.width}x${src.bitmap.height}`);
  if (src.bitmap.width !== src.bitmap.height) {
    console.warn(`note: source not square (${src.bitmap.width}x${src.bitmap.height}); padding to square.`);
  }

  // Top-level 1024 icon for mac/win derivation.
  const base = await squareCanvas(src, BASE);
  await base.writeAsync(path.join(BUILD, 'icon.png'));
  console.log(`wrote build/icon.png (${BASE}x${BASE})`);

  // Pre-sized set for Linux.
  for (const s of SIZES) {
    const img = await squareCanvas(src, s);
    await img.writeAsync(path.join(ICONS_DIR, `${s}x${s}.png`));
    console.log(`wrote build/icons/${s}x${s}.png`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
