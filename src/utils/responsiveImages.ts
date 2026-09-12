// ============================================================
// ZHINO — responsive image manifest (WebP derivatives)
//
// Maps each real photo (site-root-relative path, as stored in
// the catalog) to its lightweight WebP derivatives in
// public/images/opt/ (see scripts/optimize-images.mjs).
//
// Rules:
//   - The ORIGINAL JPEG is always the <img src> fallback, so a
//     browser without WebP (or a missing derivative) renders
//     exactly what it renders today — never a broken image.
//   - Unknown paths (e.g. admin-added custom images) resolve to
//     no derivatives: plain <img src> as before.
//   - All URLs go through withSiteBase, so the custom-domain
//     root and the legacy /zheno-website sub-path keep working.
// ============================================================

import { withSiteBase } from './siteBase';

export interface ResponsiveSource {
  /** original JPEG — always usable as the <img src> fallback */
  fallbackSrc: string;
  /** WebP srcset value ("" when there is only one derivative) */
  webpSrcSet: string;
  /** single WebP file (used when no srcset applies) */
  webpSrc: string;
  /** true when at least one WebP derivative exists */
  hasWebp: boolean;
}

interface Derivative {
  /** file stem inside images/opt (without size suffix/extension) */
  stem: string;
  /** available widths; single entry = same-size file `<stem>.webp` */
  widths: number[];
}

const OPT_DIR = 'images/opt';

/** hero slideshow (9 real finished-dessert photos) */
const HERO_DERIVATIVES: Record<string, Derivative> = {
  'images/IMG_20260903_002041.jpg': { stem: 'IMG_20260903_002041', widths: [480, 860] },
  'images/IMG_20260903_002115.jpg': { stem: 'IMG_20260903_002115', widths: [480, 860] },
  'images/IMG_20260903_002139.jpg': { stem: 'IMG_20260903_002139', widths: [480, 860] },
  'images/IMG_20260903_002159.jpg': { stem: 'IMG_20260903_002159', widths: [480, 860] },
  'images/IMG_20260903_002226.jpg': { stem: 'IMG_20260903_002226', widths: [480, 860] },
  'images/IMG_20260903_002256.jpg': { stem: 'IMG_20260903_002256', widths: [480, 860] },
  'images/IMG_20260903_002320.jpg': { stem: 'IMG_20260903_002320', widths: [480, 860] },
  'images/IMG_20260903_002353.jpg': { stem: 'IMG_20260903_002353', widths: [480, 860] },
  'images/IMG_20260903_002418.jpg': { stem: 'IMG_20260903_002418', widths: [480, 860] },
};

/** product photos: 7 large (srcset) + 15 small (single WebP) */
const PRODUCT_DERIVATIVES: Record<string, Derivative> = {
  'images/products/jelly-cantaloupe.jpg': { stem: 'jelly-cantaloupe', widths: [360, 560] },
  'images/products/jelly-grape.jpg': { stem: 'jelly-grape', widths: [360, 560] },
  'images/products/jelly-kiwi.jpg': { stem: 'jelly-kiwi', widths: [360, 560] },
  'images/products/jelly-lemon.jpg': { stem: 'jelly-lemon', widths: [360, 560] },
  'images/products/jelly-mango.jpg': { stem: 'jelly-mango', widths: [360, 560] },
  'images/products/jelly-mulberry.jpg': { stem: 'jelly-mulberry', widths: [360, 560] },
  'images/products/jelly-watermelon.jpg': { stem: 'jelly-watermelon', widths: [360, 560] },
  'images/products/custard-banana.jpg': { stem: 'custard-banana', widths: [] },
  'images/products/custard-cantaloupe.jpg': { stem: 'custard-cantaloupe', widths: [] },
  'images/products/custard-chocolate.jpg': { stem: 'custard-chocolate', widths: [] },
  'images/products/custard-mahlab-vanilla.jpg': { stem: 'custard-mahlab-vanilla', widths: [] },
  'images/products/custard-orange.jpg': { stem: 'custard-orange', widths: [] },
  'images/products/custard-seven-fruit.jpg': { stem: 'custard-seven-fruit', widths: [] },
  'images/products/custard-strawberry.jpg': { stem: 'custard-strawberry', widths: [] },
  'images/products/jelly-blueberry.jpg': { stem: 'jelly-blueberry', widths: [] },
  'images/products/jelly-orange.jpg': { stem: 'jelly-orange', widths: [] },
  'images/products/jelly-peach.jpg': { stem: 'jelly-peach', widths: [] },
  'images/products/jelly-pineapple.jpg': { stem: 'jelly-pineapple', widths: [] },
  'images/products/jelly-pomegranate.jpg': { stem: 'jelly-pomegranate', widths: [] },
  'images/products/jelly-raspberry.jpg': { stem: 'jelly-raspberry', widths: [] },
  'images/products/jelly-sour-cherry.jpg': { stem: 'jelly-sour-cherry', widths: [] },
  'images/products/jelly-strawberry.jpg': { stem: 'jelly-strawberry', widths: [] },
};

const DERIVATIVES: Record<string, Derivative> = {
  ...HERO_DERIVATIVES,
  ...PRODUCT_DERIVATIVES,
};

/**
 * Resolve a catalog image path to its responsive sources.
 * `imageUrl` may be a site-root-relative path (catalog form) or an
 * already-resolved absolute URL (hero slides) — both are handled.
 */
export function getResponsiveSource(imageUrl: string): ResponsiveSource {
  const fallbackSrc = imageUrl.startsWith('/') ? imageUrl : withSiteBase(imageUrl);
  const key = imageUrl.replace(/^\/zheno-website\//, '').replace(/^\//, '');
  const derivative = DERIVATIVES[key];
  if (!derivative) {
    return { fallbackSrc, webpSrcSet: '', webpSrc: '', hasWebp: false };
  }
  if (derivative.widths.length === 0) {
    return {
      fallbackSrc,
      webpSrcSet: '',
      webpSrc: withSiteBase(`${OPT_DIR}/${derivative.stem}.webp`),
      hasWebp: true,
    };
  }
  const srcset = derivative.widths
    .map((w) => `${withSiteBase(`${OPT_DIR}/${derivative.stem}-${w}.webp`)} ${w}w`)
    .join(', ');
  return { fallbackSrc, webpSrcSet: srcset, webpSrc: '', hasWebp: true };
}

/* ── sizes hints (must match the CSS frame at each breakpoint) ── */

/** hero slideshow frame: max-w 15.5rem → 18rem → 26rem */
export const HERO_SLIDE_SIZES = '(max-width: 640px) 248px, (max-width: 1024px) 288px, 416px';

/** product card visual: 2-col → 3-col → ~264px desktop */
export const PRODUCT_CARD_SIZES = '(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 264px';

/** product detail arch: max-w 18rem → 20.5rem */
export const PRODUCT_DETAIL_SIZES = '(max-width: 640px) 288px, 328px';

/** cart line thumbnail: 96px → 112px */
export const CART_THUMB_SIZES = '112px';

/**
 * Hero backdrop (decorative): WebP first with JPEG fallback via
 * CSS image-set — same pixels the browser would decode today,
 * ~60% fewer bytes on supporting browsers, identical rendering
 * elsewhere (old browsers ignore image-set and use the plain
 * url() fallback, which is why both are provided).
 */
export function getHeroBackgroundImage(): string {
  const webp = withSiteBase(`${OPT_DIR}/hero-bg.webp`);
  const jpg = withSiteBase('images/hero-bg.jpg');
  return `image-set(url("${webp}") type("image/webp"), url("${jpg}") type("image/jpeg"))`;
}
