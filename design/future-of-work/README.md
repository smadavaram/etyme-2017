# The Future of Work — a two-colour mural system for Etyme

One piece of artwork, cropped to fit every placement: the home page, Meta and
Google ads, billboards and profile banners. Strictly **two colours**, so it
prints cheaply, survives compression, and stays unmistakable at thumbnail size.

---

## The two colours

| Role | Hex | Where it comes from |
|---|---|---|
| **Etyme Indigo** | `#5337FB` | sampled from the indigo stroke of the "y" in the etyme logo |
| **Bone** | `#F4F0E6` | a warm gallery-wall off-white |

Every file ships in two colourways, and they are the *same two inks* either way:

- **`-light`** — indigo artwork on bone. Calmer, premium, good for the home page
  and for feeds that are mostly white.
- **`-indigo`** — bone artwork on indigo. Loud, high-contrast, good for ads,
  stories and out-of-home, where you are fighting for attention.

Nothing in the kit uses a third colour, a gradient, a shadow or a tint. Depth
comes from knocking bone back out of indigo — which is why the big arch works.

## The idea

The mural reads left to right as a day at work:

**dawn** (arcs breaking a horizon) → **doorways** (openings into work) →
**the hour** (a monumental arch with the clock inside) → **the flow** (people
moving to where they are needed) → **the placement** (growth, and the match
confirmed).

The centrepiece is the **etyme "y" drawn as a pair of clock hands**. The logo's
"y" is already two strokes converging and one continuing — a person and an
opportunity meeting at a point in time. That is the whole company in one shape,
so the mural repeats it: as the clock, as the round badge, and as the app mark.

## What to use where

### Home page
| File | Size | Use |
|---|---|---|
| `etyme-fow-home-hero-*.svg` | 1920×1080 | hero background — **no text baked in**, set your headline in HTML over it |
| `etyme-fow-home-hero-strip-*.svg` | 2560×720 | wide hero band |
| `etyme-fow-mural-master-band-*.svg` | 2400×800 | the full mural, for section dividers or a footer band |
| `etyme-fow-mural-master-block-*.svg` | 1600×1600 | square crop, for a split hero |
| `etyme-fow-mural-master-column-*.svg` | 1000×2000 | tall crop, for a mobile hero |
| `etyme-fow-pattern-tile-*.svg` | 400×400 | seamless scallop repeat for accent bands |
| `etyme-fow-og-share-*.png` | 1200×630 | link preview when the site is shared |

### Meta (Facebook + Instagram)
| File | Size |
|---|---|
| `etyme-fow-meta-feed-square-*.png` | 1080×1080 |
| `etyme-fow-meta-feed-portrait-*.png` | 1080×1350 |
| `etyme-fow-meta-story-reel-*.png` | 1080×1920 (top 8.5% kept clear of Instagram's UI) |
| `etyme-fow-meta-link-ad-*.png` | 1200×628 |

### Google Display Network
All eight standard sizes: `300×250`, `336×280`, `300×600`, `160×600`,
`728×90`, `970×250`, `468×60`, `320×50`, `320×100`, plus `1200×628` for
responsive display ads. Files are named `etyme-fow-gdn-<size>-*.png`.

### Billboards and boards
| File | Size | Use |
|---|---|---|
| `etyme-fow-billboard-48sheet-*.png` | 2880×960 (3:1) | standard 48-sheet |
| `etyme-fow-billboard-ultrawide-*.png` | 3200×800 (4:1) | long roadside board |
| `etyme-fow-board-portrait-*.png` | 1080×1620 | portrait digital board |

### Profiles and link-in-bio
| File | Size | Use |
|---|---|---|
| `etyme-fow-mark-*.svg` | 512×512 | profile picture / app icon |
| `etyme-fow-bio-card-*.svg` | 1080×1080 | link-in-bio card, artwork only |
| `etyme-fow-linkedin-banner-*.png` | 1584×396 | LinkedIn company banner |
| `etyme-fow-x-header-*.png` | 1500×500 | X / Twitter header |

## SVG or PNG?

- **Ads: always use the PNG.** Meta and Google only accept PNG/JPG, and the PNGs
  have the type baked in, so they cannot go wrong on someone else's machine.
- **Website: use the SVG.** It is a fraction of the size and stays sharp on any
  screen. Prefer the `home-hero` / `mural-master` files, which carry **no text** —
  put your headline in HTML on top so it stays selectable and translatable.
- SVGs that *do* carry type reference the **Archivo** typeface. If it is not
  loaded they fall back to Helvetica/Arial, which still looks fine but is not
  the intended cut. Load it on the site with:
  `<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700&family=Archivo+Black&display=swap" rel="stylesheet">`

### Dropping the hero onto the home page

```html
<section class="fow-hero">
  <h1>The future of work.</h1>
  <p>Hiring, contracts, timesheets and payments — one platform.</p>
  <a class="fow-cta" href="/signup">See how it works</a>
</section>
```
```css
.fow-hero {
  background: #F4F0E6 url("/assets/etyme-fow-home-hero-light.svg") right bottom / cover no-repeat;
  min-height: 60vh; padding: 6vw;
}
.fow-hero h1 { font: 700 clamp(40px, 6vw, 96px)/1.02 "Archivo Black", Arial, sans-serif;
               letter-spacing: -0.03em; color: #5337FB; margin: 0 0 .4em; }
.fow-cta    { display: inline-block; background: #5337FB; color: #F4F0E6;
               padding: .9em 1.6em; border-radius: 999px; text-decoration: none;
               font: 700 18px "Archivo", Arial, sans-serif; }
```

## Changing the colours or the copy

Everything is generated from four small Python files in `generate/`, so a change
is one edit and one command — no redrawing.

- **Colours** — `generate/mural.py`, the `INDIGO` and `BONE` constants at the top.
  Swapping indigo for the logo's orange `#DF641D` is a one-value change.
- **Wording** — `generate/layout.py`, the `COPY` dictionary (headline, subhead,
  button label).
- **Sizes** — `generate/build.py`, the `SPECS` list. Add a row to get a new size
  in both colourways.

Then regenerate:

```bash
cd design/future-of-work/generate
python3 build.py ..          # writes ../svg + ../manifest.txt
npm i playwright-core        # once, for the PNG step
node render.js ..            # writes ../png at exact pixel sizes
```

The PNG step needs a Chromium build and the Archivo font installed locally;
without them the SVGs are still correct and can be exported from any design tool.

## Files

```
design/future-of-work/
  svg/        56 source files  (2 colourways × 28 placements)
  png/        56 exports       (pixel-exact, type baked in)
  generate/
    mural.py    the motif vocabulary — arcs, arches, figures, the clock, the "y"
    scenes.py   the three mural compositions (band / block / column)
    layout.py   how a placement splits into artwork and a block of type
    build.py    the list of sizes to produce
    render.js   SVG → PNG at exact pixel sizes
```
