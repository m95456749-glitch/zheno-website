# ZHINO — Hero imagery

## Hero backdrop

| File          | Role                                  | Treatment                                             |
| ------------- | ------------------------------------- | ----------------------------------------------------- |
| `hero-bg.jpg` | IMAGE 1 — cinematic burgundy backdrop | Dark flowing burgundy/brown texture; full-bleed behind the Hero (layered over the CSS `hero-silk` gradient) |

## Hero slideshow (IMAGE 2 — the small dessert frame)

The rotating frame uses **only the owner's 9 real finished-dessert photos**
from one Android session on 2026-09-03 00:17–00:19.

**Blank outer-margin pass (hero-polish branch).** Every file was measured
column-by-column and row-by-row; a column/row counts as blank when ≥90% of
its pixels are near-white (≥232 on R, G and B). Only fully blank outer
bands were trimmed — each removed strip measured 96–100% near-white, so no
dessert, plate, glass, fruit, decoration or photographic edge was touched.
Aspect ratio is unchanged (nothing stretched), and each file was re-encoded
with its own original camera quantization tables, so colours are unchanged.
EXIF provenance (Android BP2A.250605.031.A3, original capture timestamps)
is preserved on all 9.

| File | Trimmed blank margin | Size after |
| ---- | -------------------- | ---------- |
| `IMG_20260903_002041.jpg` | left 8px + right 7px white bars | 875×873 |
| `IMG_20260903_002115.jpg` | left 3px + right 1px white edge | 876×858 |
| `IMG_20260903_002139.jpg` | left 3px + right 4px, top 2px | 875×861 |
| `IMG_20260903_002159.jpg` | left 3px white edge | 874×868 |
| `IMG_20260903_002226.jpg` | left 1px white edge | 869×876 |
| `IMG_20260903_002320.jpg` | top 2px white strip | 858×851 |
| `IMG_20260903_002256.jpg` | none found — file untouched | 835×820 |
| `IMG_20260903_002353.jpg` | none found — file untouched | 856×835 |
| `IMG_20260903_002418.jpg` | none found — file untouched | 851×862 |

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
compact **square** frame — the photos are within ~2% of square, so they
fill it edge to edge with no letterbox dead space. The dessert
photographs are never cropped, stretched or distorted (only the blank
outer bands above were trimmed).

### Never used in the Hero slideshow

- `products/*.jpg` — real photos, but they are **powder-in-glass package
  shots** wired to the product cards (see `products/README.md`).
- `jelly-powder-hero.jpg` (when present on a branch) — excluded by the
  owner. Re-inspected forensically: no camera provenance (zero JPEG
  metadata markers) and its JPEG quantization tables are identical to
  the retired generated showcase set's — it comes from the same
  generation/encoder pipeline, not from the owner's camera. Not a real
  finished-dessert photo.
- `hero-dish.jpg` and `showcase/*.jpg` — generated stills, retired from
  the Hero (kept only as unused legacy assets).

If a slideshow file is missing at runtime the slide is dropped from the
rotation; if none remain, the tasting-trio fallback renders, so the page
never shows a broken image.
