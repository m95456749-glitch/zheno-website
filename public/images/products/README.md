# ZHINO — Product photography

Real production photos of the jelly powders, one file per product.

## Ground truth: the printed label, not the filename

Every photo has the flavor name printed on the glass («ژله انار», «ژله بلوبری», …).
**That printed label is the source of truth.** Filenames were previously wrong, so a
filename must never be trusted on its own — open the picture and read the label before
wiring it to a product.

## Mapping (verified by reading the label inside each photo)

| Product id          | Product      | File                     | Label in the photo |
| ------------------- | ------------ | ------------------------ | ------------------ |
| `jelly-pomegranate` | انار         | `jelly-pomegranate.jpg`  | ژله انار           |
| `jelly-strawberry`  | توت فرنگی    | `jelly-strawberry.jpg`   | ژله توت فرنگی      |
| `jelly-peach`       | هلو          | `jelly-peach.jpg`        | ژله هلو            |
| `jelly-raspberry`   | تمشک         | `jelly-raspberry.jpg`    | ژله تمشک           |
| `jelly-blueberry`   | بلوبری       | `jelly-blueberry.jpg`    | ژله بلوبری         |
| `jelly-orange`      | پرتقال       | `jelly-orange.jpg`       | ژله پرتقال         |
| `jelly-pineapple`   | آناناس       | `jelly-pineapple.jpg`    | ژله آناناس         |
| `jelly-sour-cherry` | آلبالو       | `jelly-sour-cherry.jpg`  | ژله آلبالو         |
| `jelly-watermelon`  | هندوانه      | `jelly-watermelon.jpg`   | ژله هندوانه        |
| `jelly-cantaloupe`  | طالبی        | `jelly-cantaloupe.jpg`   | ژله خربزه †        |
| `jelly-mulberry`    | شاتوت        | `jelly-mulberry.jpg`     | ژله توت سیاه ‡     |
| `jelly-mango`       | انبه         | `jelly-mango.jpg`        | ژله انبه           |
| `jelly-grape`       | انگور        | `jelly-grape.jpg`        | ژله انگور          |
| `jelly-kiwi`        | کیوی         | `jelly-kiwi.jpg`         | ژله کیوی           |
| `jelly-lemon`       | لیمو         | `jelly-lemon.jpg`        | ژله لیمو           |

† Season 2: the packet prints «ژله خربزه»; the store sells this melon packet
under the name «طالبی» (owner-confirmed same product — do not re-map).

‡ Season 2: the packet prints «ژله توت سیاه» — «توت سیاه» and «شاتوت» are the
same fruit (mulberry); the card keeps the store name «شاتوت».

Custard products have no production photography yet. They deliberately carry no
`imageUrl` and fall back to the catalog-driven plated visual in `ProductVisual`.
Do not invent, generate, or borrow images for them.

## How it is wired

`src/data/products.ts` is the single source of truth: each product carries an
`imageUrl` (site-root-relative, e.g. `images/products/jelly-peach.jpg`).
`ProductCard` → `ProductVisual` resolves it against the Vite base path, so the
same field also feeds the cart and product-detail pages. Adding a photo to a new
product means setting `imageUrl` — no component changes.

Framing is presentation-only (`object-cover` in CSS); the source files are never
cropped or re-encoded.

## Adding a photo

1. Read the label printed in the picture.
2. Save it here as `jelly-<flavor>.jpg` / `custard-<flavor>.jpg` matching that label.
3. Point the product's `imageUrl` at it in `src/data/products.ts`.
4. Run `npm run verify:data` — it asserts the mapping and fails on regressions.
