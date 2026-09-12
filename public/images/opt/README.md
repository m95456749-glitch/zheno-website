# Optimized image derivatives (WebP)

This folder holds **generated** lightweight copies of the real ZHINO photos.
They exist purely for performance (smaller downloads on mobile/slow networks).

- **Originals are never modified.** The camera JPEGs in `public/images/` and
  `public/images/products/` are the source of truth and remain the `<img src>`
  fallback for browsers without WebP support.
- **No visual alteration:** derivatives only change the encoding (WebP) and,
  where noted, the pixel width (downscaled for small display contexts). No
  crop, stretch, recolor, or filter — verified by eye at display size.
- **Regenerate:** `node scripts/optimize-images.mjs` (needs ImageMagick).
  Deploys never run it; the files here are committed as build inputs.

| Derivative pattern | Source | Used as |
|---|---|---|
| `IMG_20260903_*-480.webp` | hero slide JPEGs | phones (hero frame ≤248 CSS px) |
| `IMG_20260903_*-860.webp` | hero slide JPEGs | desktop / high-DPR (frame ≤416 CSS px) |
| `jelly-*-360.webp` / `*-560.webp` | 7 large product JPEGs | cards / cart / detail arch |
| `<flavor>.webp` (15×) | small product JPEGs | same-size WebP (~45% smaller) |
| `hero-bg.webp` | `hero-bg.jpg` | decorative backdrop (CSS `image-set`) |

Mapping from source → derivative lives in `src/utils/responsiveImages.ts`.
