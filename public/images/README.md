# ZHINO — Hero imagery

## Hero backdrop

| File          | Role                                  | Treatment                                             |
| ------------- | ------------------------------------- | ----------------------------------------------------- |
| `hero-bg.jpg` | IMAGE 1 — cinematic burgundy backdrop | Dark flowing burgundy/brown texture; full-bleed behind the Hero (layered over the CSS `hero-silk` gradient) |

## Hero slideshow (IMAGE 2 — the small dessert frame)

The rotating frame uses **only the owner's 9 real finished-dessert photos**,
uploaded unchanged (byte-identical to the originals) from one Android
session on 2026-09-03 00:17–00:19:

| # | File | Verified |
| - | ---- | -------- |
| 1 | `IMG_20260903_002041.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 2 | `IMG_20260903_002115.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 3 | `IMG_20260903_002139.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 4 | `IMG_20260903_002159.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 5 | `IMG_20260903_002226.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 6 | `IMG_20260903_002256.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 7 | `IMG_20260903_002320.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 8 | `IMG_20260903_002353.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |
| 9 | `IMG_20260903_002418.jpg` | real camera photo (EXIF), no label/packaging, finished dessert |

Rotation: one photo at a time, every 3000 ms, subtle opacity crossfade,
no arrows, subtle dots only. Every slide is `object-contain` inside the
small fixed frame — the files are never cropped, stretched or re-encoded.

### Never used in the Hero slideshow

- `products/*.jpg` — real photos, but they are **powder-in-glass package
  shots** wired to the product cards (see `products/README.md`).
- `jelly-powder-hero.jpg` (when present on a branch) — jelly **powder**
  photo, excluded by the owner.
- `hero-dish.jpg` and `showcase/*.jpg` — generated stills, retired from
  the Hero (kept only as unused legacy assets).

If a slideshow file is missing at runtime the slide is dropped from the
rotation; if none remain, the tasting-trio fallback renders, so the page
never shows a broken image.
