# Etyme — two-ink mural system

One geometric line mural, cropped to fit every placement: the home page, Meta,
Google Display, billboards and profile banners. Two inks per asset, never
three, and both are taken from the live site.

Built against the production site — `smadavaram/etyme2040` — not from an older
brand. Tokens come from `src/app/globals.css` and `tailwind.config.ts`, the
type from the same config, and the mark from `src/components/logo.tsx`.

---

## The two inks

| Role | Hex | Where it comes from |
|---|---|---|
| **Navy** | `#0D1426` | `logo.tsx` — the wordmark's own colour |
| **Canvas** | `#F0EEE6` | `globals.css --color-canvas` — the page background |

`#2B47E5` is the **action** colour — buttons, links, one stat number. It is a
semantic UI colour, not a brand colour, so nothing here uses it. That keeps the
artwork from competing with the things on the page that are actually clickable.

Two colourways, the same two inks either way:

- **`-navy`** — navy artwork on canvas. The home page's own weight. Use this
  everywhere on the site.
- **`-night`** — canvas artwork on navy. For stories, out-of-home, and any
  placement that has to hold its own against a bright feed.

## Why it looks the way it does

The home page is near-monochrome: 1px rules on a warm ground, small
letterspaced labels, serif headlines at regular weight, and a real product
screenshot rather than an illustration. A heavy poster-style mural would fight
all of that.

So this is a **line mural**. Almost every shape is an outline, there is a lot of
air, and solid mass is spent only where the product spends it:

- **the evidence dots** — `globals.css .evidence-dot`, the signature of a
  verified record
- **the figures** — people, at human scale, on the rule everything else
  stands on
- **the one rising slash** — the logo's `t` crossbar at −25°, wall-sized.
  Every diagonal in the system is exactly that angle.

The artwork argues what the page argues, left to right: contractors nobody has
one view of, the chain of firms they arrived through, and then **one record**
holding all of it. The record is the only large object in the piece.

## The mark

`logo.tsx` removes the `t`'s crossbar with a clip-path and lays a rising
gradient slash in its place. On a flat two-ink ground, painting the crossbar out
in the field colour is the same operation, so the wordmark here is genuinely the
site's wordmark rather than an approximation. The offsets in `mural.py` were
measured off the rendered glyph, not estimated.

## Typography

| Role | Face | Setting |
|---|---|---|
| Headline | Iowan Old Style → Palatino → Georgia | regular weight, `-0.02em` |
| Eyebrow | Inter 600 | uppercase, `0.14em` |
| Subhead, button | Inter 400 / 600 | — |

Sizes follow the live hero's own ratios (h1 60px, eyebrow 10, sub 21, button
14). PNG exports render the serif as **Gelasio**, which is metrically Georgia —
the last real face in the site's own stack, so the exports match what most
visitors see. On a Mac the SVGs render in actual Palatino.

## Copy

Verbatim from the live hero, so nothing here has to be re-approved:

> **VENDOR MANAGEMENT SYSTEM**
> Every contractor. Every supplier. One record.
> See every contractor on your sites, which supplier sent them, and what they cost.
> `Open an example program →`

Copy shortens as the slot gets tighter — three lines, then two, then one — and
the subhead, eyebrow and button drop in that order. The lockup is the last thing
to go, and where it cannot fit beside the headline the mark is placed in the
artwork instead, so every asset carries attribution.

## What to use where

### Home page
| File | Size | Use |
|---|---|---|
| `etyme-home-hero-*.svg` | 1920×1080 | hero background, **no text baked in** — set the headline in HTML over it |
| `etyme-home-hero-strip-*.svg` | 2560×720 | short hero band |
| `etyme-section-divider-*.svg` | 2400×440 | between sections, in place of a plain rule |
| `etyme-mural-master-band-*.svg` | 2400×800 | the full mural |
| `etyme-mural-master-block-*.svg` | 1600×1600 | square crop, for a split hero |
| `etyme-mural-master-column-*.svg` | 1000×2000 | tall crop, for the mobile hero |
| `etyme-pattern-tile-*.svg` | 400×400 | seamless evidence-dot field |
| `etyme-og-share-*.png` | 1200×630 | link preview |

### Meta
`etyme-meta-feed-square` 1080×1080 · `etyme-meta-feed-portrait` 1080×1350 ·
`etyme-meta-story-reel` 1080×1920 (top 8.5% kept clear of Instagram's UI) ·
`etyme-meta-link-ad` 1200×628

### Google Display
All ten standard sizes: `300×250`, `336×280`, `300×600`, `160×600`, `728×90`,
`970×250`, `468×60`, `320×50`, `320×100`, plus `1200×628` for responsive
display. Named `etyme-gdn-<size>-*.png`.

### Billboards and boards
`etyme-billboard-48sheet` 2880×960 (3:1) · `etyme-billboard-ultrawide` 3200×800
(4:1) · `etyme-board-portrait` 1080×1620

### Profiles and link-in-bio
`etyme-mark` 512×512 (profile picture, app icon) · `etyme-bio-card` 1080×1080 ·
`etyme-linkedin-banner` 1584×396 · `etyme-x-header` 1500×500

## SVG or PNG

- **Ads: use the PNG.** Meta and Google only accept PNG or JPG, and the type is
  baked in so it cannot fall back to the wrong font.
- **Site: use the SVG.** Far smaller and sharp at any size. Prefer the
  `home-hero` and `mural-master` files, which carry no text, and set the
  headline in HTML so it stays selectable and translatable.

## Regenerating

Colours, wording and sizes are four small files, so a change is one edit and one
command rather than a redraw.

- **Inks** — `generate/mural.py`, the `COLORWAYS` map.
- **Wording** — `generate/layout.py`, the `COPY` dict.
- **Sizes** — `generate/build.py`, the `SPECS` list.

```bash
cd design/mural/generate
python3 build.py ..        # writes ../svg and ../manifest.txt
npm i playwright-core      # once, for the PNG step
node render.js ..          # writes ../png at exact pixel sizes
```

The PNG step needs Chromium plus Inter, Gelasio and IBM Plex Mono installed
locally. Without them the SVGs are still correct and export from any design tool.

```
design/mural/
  svg/   58 source files  (2 colourways × 29 placements)
  png/   58 exports       (pixel-exact, type baked in)
  generate/
    mural.py    tokens, the measured logo, and the product's own motifs
    scenes.py   the three compositions (band / block / column)
    layout.py   how a placement splits into artwork and type
    build.py    the list of sizes
    render.js   SVG → PNG at exact pixel sizes
```
