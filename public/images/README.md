# ZHINO — Hero imagery

Drop the two production brand photos here:

| File               | Role                                  | Suggested treatment                                             |
| ------------------ | ------------------------------------- | --------------------------------------------------------------- |
| `hero-bg.jpg`      | IMAGE 1 — cinematic burgundy backdrop | Dark flowing burgundy/brown texture; full-bleed behind the Hero |
| `hero-dish.jpg`    | IMAGE 2 — editorial dessert focal     | Premium food photo (jelly desserts in glass bowls), portrait-leaning works best |

The Hero references both through the site base path, so they deploy to
`/zheno-website/images/...` on GitHub Pages automatically. If a file is
missing, the layered CSS treatments (`src/index.css → .hero-silk`, and the
framed flavor triptych) stand in, so the page never shows a broken image.

Decorative plated-dessert stills for the Hero slider live in `showcase/` —
see `showcase/README.md`. They never replace catalog photos.

## Product photography

Per-product photos live in `products/` — see `products/README.md`. Their filenames
were historically mismatched, so the flavor name **printed inside each photo** is the
ground truth, not the filename.
