// ============================================================
// ZHINO — image derivative generator (one-shot, re-runnable)
//
// Generates the lightweight WebP derivatives in
// public/images/opt/ from the ORIGINAL camera/product JPEGs.
//
//   - Originals are NEVER modified, moved, or re-encoded in
//     place. They stay exactly where they are and remain the
//     <img src> fallback for browsers without WebP support.
//   - Derivatives only change container/encoding + pixel width
//     (downscale for small display contexts). No crop, no
//     stretch, no color/filter alteration.
//   - Quality settings were chosen for visual transparency at
//     the sizes these files are displayed (verified by eye).
//
// Requires ImageMagick (`convert` with WebP delegate). The
// generated files are committed, so this script only needs to
// run when source photos change — deploys never run it.
//
// Usage: node scripts/optimize-images.mjs
// ============================================================

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'public', 'images');
const OPT = path.join(IMG, 'opt');

function haveConvert() {
  try {
    execFileSync('convert', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert one source JPEG into a stripped WebP derivative.
 * width = 0 keeps the source pixel size.
 */
function webp(srcRel, outName, { width = 0, quality = 80 } = {}) {
  const src = path.join(IMG, srcRel);
  const out = path.join(OPT, outName);
  if (!existsSync(src)) {
    console.error(`SKIP (missing source): ${srcRel}`);
    process.exitCode = 1;
    return;
  }
  const args = [src, '-strip', '-quality', String(quality)];
  if (width > 0) args.push('-resize', `${width}x`);
  args.push(out);
  execFileSync('convert', args, { stdio: 'inherit' });
  console.log(`ok: ${outName}`);
}

function main() {
  if (!haveConvert()) {
    console.error('ImageMagick `convert` not found — cannot regenerate derivatives.');
    console.error('The committed files in public/images/opt/ are still used as-is.');
    process.exit(1);
  }
  mkdirSync(OPT, { recursive: true });

  // ── Hero slideshow: 9 real finished-dessert photos ──────────
  // Displayed at most 416 CSS px wide (mobile 248px) → 480w for
  // phones, 860w (≈ source width) for large / high-DPR screens.
  const hero = [
    'IMG_20260903_002041',
    'IMG_20260903_002115',
    'IMG_20260903_002139',
    'IMG_20260903_002159',
    'IMG_20260903_002226',
    'IMG_20260903_002256',
    'IMG_20260903_002320',
    'IMG_20260903_002353',
    'IMG_20260903_002418',
  ];
  for (const base of hero) {
    webp(`${base}.jpg`, `${base}-480.webp`, { width: 480, quality: 82 });
    webp(`${base}.jpg`, `${base}-860.webp`, { width: 860, quality: 82 });
  }

  // ── Season-2 product photos (large originals, ~200KB) ───────
  // Cards show ≤264 CSS px, detail arch ≤328px, cart thumbs 112px
  // → 360w covers phones/cards, 560w (≈ source width) covers 2x.
  const large = [
    'jelly-cantaloupe',
    'jelly-grape',
    'jelly-kiwi',
    'jelly-lemon',
    'jelly-mango',
    'jelly-mulberry',
    'jelly-watermelon',
  ];
  for (const base of large) {
    webp(`products/${base}.jpg`, `${base}-360.webp`, { width: 360, quality: 80 });
    webp(`products/${base}.jpg`, `${base}-560.webp`, { width: 560, quality: 80 });
  }

  // ── Small product photos (already 10–19KB) ──────────────────
  // Same pixel size, WebP container only (~45% smaller, no
  // visible change). Displayed ≤264 CSS px everywhere.
  const small = [
    'custard-banana',
    'custard-cantaloupe',
    'custard-chocolate',
    'custard-mahlab-vanilla',
    'custard-orange',
    'custard-seven-fruit',
    'custard-strawberry',
    'jelly-blueberry',
    'jelly-orange',
    'jelly-peach',
    'jelly-pineapple',
    'jelly-pomegranate',
    'jelly-raspberry',
    'jelly-sour-cherry',
    'jelly-strawberry',
  ];
  for (const base of small) {
    const dir = base.startsWith('custard-') || base.startsWith('jelly-') ? 'products' : 'products';
    webp(`${dir}/${base}.jpg`, `${base}.webp`, { quality: 82 });
  }

  // ── Hero backdrop (decorative, heavily scrimmed) ─────────────
  webp('hero-bg.jpg', 'hero-bg.webp', { quality: 78 });

  console.log('\nDone. Originals untouched; derivatives in public/images/opt/.');
}

main();
