# Etyme brand kit — for the dashboard

This folder is the hand-off from the marketing site to the product. It carries how things
look: colours, type, corners, shadows, motion, the logo, the icons and every component the
site uses. It carries nothing about what the product does. Applying it changes the surface of
the dashboard and nothing underneath.

A live version of everything here is the page `brand-kit.html` on the site.

## Rules for the thread that applies this

1. **Only the surface changes.** Tokens, stylesheet, class names, icons, logo. No change to
   routes, data, database, permissions, seats, menus' contents, or any relationship between
   companies, people and documents.
2. **The sidebar and header keep their structure.** Sections, sub-groups, items, the company
   block, the "+ New" menu, search, the phone drawer: all stay as built. They take the kit's
   colours, type, spacing and icons, nothing else.
3. **Replace, do not add alongside.** Where the product has a token or class that the kit also
   has, the kit's value wins. Old names stay so nothing breaks; their values change.
4. **Verify at 390px** on every screen touched. Nothing scrolls sideways except a table in its
   own box.
5. **Plain English on screen.** Sentence case, no metaphors, buttons say the verb and the thing.

## Files

| File | What it is | Use it for |
|---|---|---|
| `tokens.css` | Every design token as a CSS variable | Paste into `globals.css` `:root` |
| `tailwind.tokens.ts` | The same tokens in the shape of `tailwind.config.ts` `theme.extend` | Replace the product's `colors.etyme`, `fontFamily`, `fontSize`, `borderRadius` |
| `tokens.json` | The same tokens, machine-readable | Any other tool |
| `kit.css` | The full stylesheet the site runs on (copy of `../kit.css`) | Reference for every component's exact CSS |
| `icons.svg` | Sprite of the icon set, 62 icons | Replace text-glyph and ad-hoc icons |
| `logo/wordmark.svg` | The logo, ink letters | Header, sign-in, emails |
| `logo/wordmark-on-dark.svg` | The logo, white letters | Dark bands only |
| `logo/mark.svg` | The crossbar stroke alone | Favicon, rail header beside the name, avatars for Etyme itself |
| `logo/mural-band.svg` | The mural | Documentation home only |

## Tokens

### Colour

One warm cream ground. No dark mode. Text is ink, never pure black. Lines are rule, never grey.

| Token | Hex | Where |
|---|---|---|
| canvas | `#F0EEE6` | page background |
| surface | `#FBFAF7` | panels, the rail, table row hover, modal footers |
| raised | `#FFFFFF` | cards, inputs, menus, modals, drawers |
| sunk | `#E7E4DA` | hover fill on nav items and secondary buttons, meters, skeletons |
| ink | `#1F1E1D` | text, active tab underline, active segment fill, tooltips |
| muted | `#6B6862` | secondary text, nav items at rest, hints |
| faint | `#9C9891` | eyebrows, column headers, placeholders, counts |
| rule | `#E3DFD5` | every border and divider |

Brand strength, for the logo, primary buttons, links and the focus ring:

| Token | Hex |
|---|---|
| violet | `#5228FF` |
| violet hover | `#3F16E8` |
| violet pressed | `#3512C4` |
| orange | `#E16400` (logo, the rule beside a quotation) |
| green | `#00C800` (logo only) |

Product strength, for chips, active navigation, dots and small text:

| Token | Hex | Meaning |
|---|---|---|
| violet-p | `#4421D6` | action, mine, current |
| orange-p | `#C0622E` | attention, waiting |
| green-p | `#2F7D3E` | verified, signed, matched |
| danger | `#B83A3A` | refused, blocked, error |

Washes and lines, for chip fills and borders, the active nav fill and the focus halo:

| Tone | Wash | Line |
|---|---|---|
| violet | `#EDE9FF` | `#C7CDF5` |
| orange | `#F7EDE6` | `#E5C9B5` |
| green | `#EDF1ED` | `#C9D6CA` |
| danger | `#FDE8E8` | `#F0C0C0` |

### What changes in the product's palette

| Product today | Becomes | Why |
|---|---|---|
| action `#2B47E5` (blue) | violet `#5228FF` for buttons and links; violet-p `#4421D6` for chips, active nav, small text | one brand colour on both surfaces |
| action wash `#EDEFFC` / line `#C7CDF5` | `#EDE9FF` / `#C7CDF5` | violet wash |
| verified `#4F6F52` | green-p `#2F7D3E` | the site's green |
| attention `#C0622E`, danger `#B83A3A` | unchanged | |
| canvas, surface, raised, ink, muted, faint, rule | unchanged | already the same |
| navy `#0D1426`, cyan `#00D4FF`, purple `#7C3AED` | removed | the logo is the SVG in `logo/`; the CSS-drawn "t" with a cyan→purple gradient in `components/logo.tsx` is replaced by it |
| the sidebar's active item (canvas fill, ink text) | violet wash fill, violet-p text, semibold | the site's current-page state |
| text-glyph icons in the sidebar (↻ ⇄ ⊘ ⊙ ⊞ …) | SVG icons from `icons.svg` at 15px | one icon language |

### Type

| Token | Stack | Where |
|---|---|---|
| serif | Iowan Old Style, Palatino Linotype, Palatino, Georgia, **Gelasio**, serif | headings, page titles, tile numbers, big figures. Regular weight, never bold, tight letter-spacing |
| sans | **Inter**, system-ui, -apple-system, Segoe UI, sans-serif | everything read or clicked |
| mono | **IBM Plex Mono**, ui-monospace, SFMono-Regular, Menlo, monospace | numbers in columns, dates, ids, codes, keyboard keys, footnotes |

Load from Google Fonts: Gelasio 400–600, Inter 400–700, IBM Plex Mono 400–500. In Next.js use
`next/font/google` for all three and expose them as `--font-gelasio`, `--font-inter`,
`--font-mono`. The product loads JetBrains Mono today; swap it for IBM Plex Mono.

Type scale:

| Name | Size / line | Family | Notes |
|---|---|---|---|
| hero | 42–54px / 1.08 | serif | letter-spacing −.025em, `text-wrap: balance` |
| display (page title) | 31px / 1.15 | serif | −.02em |
| h2 | 27px / 1.15 | serif | −.02em |
| heading | 22px / 1.2 | serif | modal titles, gate titles |
| h3 | 19px / 1.25 | serif | card titles |
| stat | 27–30px / 1.1 | serif | tile numbers, tabular figures |
| body-lg | 16px / 1.6 | sans | site body |
| body | 14.5px / 1.65 | sans | dashboard body, page-head paragraph |
| body-sm | 13.5px / 1.6 | sans | tables, navigation, hints, menu items |
| meta | 12.5px / 1.6 | mono | dates, ids, footnotes, running-head location |
| eyebrow | 10px / 1.4, 600, .14em, uppercase | sans | section labels, field labels, tile labels, rail group names (9.5px) |
| column header | 9.5px / 1.4, 600, .12em, uppercase | sans | table `th` |
| chip | 10px / 1.5, 600, .04em, uppercase | sans | |

Tabular figures (`font-variant-numeric: tabular-nums`) wherever digits line up.

### Corners, shadows, motion

| Token | Value | Where |
|---|---|---|
| r | 8px | buttons, inputs, cards, panels, tiles, toasts, menus |
| r-lg | 12px | shells, modals, drawers, figures, command palette, capability tiles |
| nav | 6px | rail items, pager buttons, menu items |
| chip | 5px | chips |
| box | 4px | checkboxes, kbd, focus corners |
| pill | 99px | filter pills, badges, meters, switches |
| lift | `0 1px 2px #1f1e1d0f, 0 4px 14px #1f1e1d0f` | a hovered clickable card |
| float | `0 8px 20px #1f1e1d14, 0 24px 56px #1f1e1d1a` | menus, modals, drawers, toasts |
| scrim | `#1f1e1d5c` | behind a modal or drawer, with 2px blur |
| t-fast / t / t-slow | 120ms / 180ms / 260ms | colour / shape / entering |
| ease | `cubic-bezier(.2,.7,.3,1)` | the only curve |

Reduced motion turns every transition off.

## Components

Class names are the kit's (`kit.css`). The right-hand column is the product class that takes the
same look. Exact CSS for each is in `kit.css`; the live page shows every state.

| Component | Kit class | Look | Product class today |
|---|---|---|---|
| Primary button | `.btn.btn-p` | violet, white text, 14px 600, 12×18px, 8px corners; hover #3F16E8, press #3512C4 and down 1px | `.btn-primary` |
| Secondary button | `.btn.btn-s` | raised, rule border, ink text; hover sunk | `.btn-secondary` |
| Tertiary button | `.btn.btn-t` | text only, muted → ink | text links used as buttons |
| Danger button | `.btn.btn-d` | danger fill, white text | — |
| Sizes | `.btn-sm` 8×13px 13px, `.btn-lg` 15×24px 15px | | |
| States | `[disabled]` 45%, `.loading` spinner, `:focus-visible` 2px violet outline | | |
| Chip | `.chip.chip--action/--attention/--verified/--danger/--passive` | 10px caps, wash fill, line border, 5px corners | `.chip.chip--*` (same names; values change) |
| Dot | `.dot`, `.dot--pending`, `.dot--blocked`, `.dot--action`, `.dot--off` | 6px circle | `.evidence-dot` |
| Badge | `.badge` | violet pill, white count | — |
| Live | `.live` | red pulsing pip + LIVE | — |
| Tier | `.rung`, `.rung.hi` | tiny bordered label with a mono number | — |
| Panel | `.panel` | surface, rule, 8px, 22px padding | `.panel` |
| Card | `.card`, `.card.tap` | raised, rule, 8px; `.tap` lifts on hover | `.card` |
| Tile | `.d-tile` with `.k` `.v` `.s` in `.d-tiles` | eyebrow, serif 27px number, 11.5px line | `.stat-label` / `.stat-value` in a `.card` |
| Table | `table` + `thead th`, `tbody td`, `.num`, `td .who`, `.av` | 9.5px caps headers, 13.5px rows, 12×10px cells, surface hover | `.data-table` |
| Tabs | `.tabs button[aria-selected]` + `.ct` count | underline in ink | `.filter-tab` row (keep it for the bold pill style; underline tabs for page sections) |
| Segmented control | `.seg button[aria-pressed]` | joined buttons, ink fill when on | `.filter-tab--active` / `--inactive` |
| Filter pill | `.filt[aria-pressed]` | pill, violet wash when on | — |
| Field | `.field` > `label`, `input/select/textarea`, `.hint`; `.field.bad` | eyebrow label, raised input 11×14px 15px, violet halo on focus | form inputs |
| Switch, box, radio | `.tog[aria-checked]`, `.box.on`, `.rad.on` | violet when on | — |
| Rail item | `.d-nav`, `.d-nav[aria-current="page"]`, `.d-nav .ct` | 13.5px muted, 8×10px, 6px corners; hover sunk + ink; current violet wash + violet-p 600 | sidebar links (the active state becomes this) |
| Rail group | `.d-side .grp` | 9.5px eyebrow | `.eyebrow` in the sidebar |
| Rail | `.d-side` | surface, rule on the right, 14×10px padding | the sidebar container |
| Header bar | `.d-bar`, `.d-search`, `.av` | search field with a kbd hint, avatar in violet wash | the header |
| Breadcrumb | `.crumb` | 12.5px muted with faint separators | — |
| Pager | `.pager button[aria-current]` | 6px corners, ink when current | — |
| Meter | `.meter` > `i`, `.meter-row` | 6px pill bar | — |
| Refusal | `.refuse`, `.refuse.warn`, `.refuse.ok` | wash box with an icon, one bold sentence, one line of what to do | — |
| Callout | `.callout` | violet wash box | — |
| Toast | `.toasts` > `.toast`, `.toast.warn/.bad/.act` | raised, coloured left edge, float shadow, bottom right | — |
| Empty state | `.empty` | dashed rule, centred, icon, serif title, one line, one button | — |
| Skeleton | `.sk`, `.sk.t`, `.sk.lg` | shimmering sunk bars | `animate-pulse` bars |
| Modal | `.scrim` > `.modal` (header, `.body`, footer) | 460px, 12px corners, float shadow, surface footer | — |
| Drawer | `.drawer-s` > `.drawer-p` | 420px from the right | the phone navigation sheet |
| Menu | `.menu-wrap` > `.menu` (buttons, `hr`, `.k`) | 214px, 8px corners, pops in | the "+ New" and account menus |
| Tooltip | `.tip` > `.bubble` | ink bubble, 12px | — |
| Command palette | `.cmd-s` > `.cmd` | 540px, input, groups, items | search |
| Keyboard key | `kbd` | mono 11px, surface, 2px bottom border | — |
| Accordion | `.acc` > `div` > `button[aria-expanded]` + `.pan` | rule-separated rows, chevron turns | — |
| Avatar stack | `.av-s` > `.av`, `.av-more` | overlapping circles | — |
| Code block | `.codeb` > `.hd`, `pre` | surface, mono 12.5px | — |
| Site header | `.eh`, `.eh-nav`, `.mega`, `.eh-drawer` | sticky surface bar, 62px, mega menus, phone drawer | — (site only) |
| Footer | `footer.book`, `.book-cols`, `.book-base` | five columns and the address line | — (site only) |

## Icons

Line icons on a 24-unit grid, stroke 1.8, round caps and joins, `currentColor`. Sizes: 15px in
the rail, 16px in buttons and chips, 18px in menus, 26px on capability tiles. In the rail an
icon sits at 60% opacity and goes to 100% on the current item.

`icons.svg` holds the set as `<symbol id="i-…">`. Names:

arrow-left, arrow-right, bell, block, book, briefcase, building, calendar, chat, check,
chevron-down, chevron-left, chevron-right, chevron-up, clock, close, compliance, contract, copy,
database, download, edit, expense, external, eye, factory, filter, flag, grid, home, id-card,
info, integration, invoice, lanes, link, list, lock, logout, mail, menu, more, network, payment,
phone, plus, refresh, report, requisition, search, send, settings, shield, sign, star, swap,
timesheet, trash, upload, user, users, warn.

Draw any missing icon in the same style. No emoji, no filled icons, no text glyphs, no second
icon set.

## Logo

- `wordmark.svg`: "etyme" in ink; the crossbar of the t is three rising strokes in violet
  `#5228FF`, orange `#E16400`, green `#00C800`.
- `wordmark-on-dark.svg`: white letters, same strokes. Only on a dark band (`#1F1E1D`).
- `mark.svg`: the strokes alone. Favicon, rail header beside the name at 28px.
- Heights: 26px in the site header, 22px in a running head, 40px on sign-in, 28px mark in a rail.
- Clear space: one x-height all round. Never recoloured, stretched, given a gradient or put in a circle.

## Layout

- Content width 1180px on the site, 1200px in the dashboard; 20–24px side gutters, 16px on a phone.
- Rail 186–220px, surface, rule on its right; hidden under 900px, then a drawer from the menu button.
- Breakpoints: 900px (rail and site nav fold), 820px (grids to one column), 480px (tiles to one column).
- 8px spacing steps; groups use `gap`, not margins. Cards pad 22px, tiles 14px, table cells 12×10px.
- Tables and drawings scroll inside their own `overflow-x: auto` box. The page never scrolls sideways.

## Words on screen

- Plain English, sentence case, no metaphors. Eyebrows and chips are the only capitals.
- A rule is one present-tense sentence naming who and what: "Nobody signs their own week."
- A button is the verb and the thing: "Raise requisition", "Export CSV". Never "Submit", "OK".
- Numbers keep their unit and their date. Money has two decimals and a currency.
- An empty screen says what belongs there and how to add the first one.
- An error says what to do next, not what went wrong inside.

## How to apply it, in order

1. `tailwind.config.ts`: replace `colors.etyme`, `fontFamily`, `fontSize`, `borderRadius` with
   `tailwind.tokens.ts`. Add `boxShadow`, `transitionDuration`, `transitionTimingFunction`.
2. `globals.css`: replace the `:root` block with `tokens.css`; point `--color-action` at
   `--violet`, `--color-verified` at `--green-p`. Re-style `.chip--*`, `.btn-primary`,
   `.btn-secondary`, `.filter-tab`, `.data-table`, `.stat-*`, `.panel`, `.card`, `.page-head`
   to the values in the table above. Focus ring: 2px `--violet`, offset 2px.
3. Fonts: load Gelasio, Inter and IBM Plex Mono with `next/font/google`; expose as
   `--font-gelasio`, `--font-inter`, `--font-mono`.
4. Logo: replace `components/logo.tsx` output with `logo/wordmark.svg` (and `mark.svg`); delete
   the navy/cyan/purple tokens.
5. Sidebar and header: keep every section, item and menu. Apply the rail item, rail group, rail
   and header bar looks; swap glyph icons for `icons.svg` at 15px.
6. Everything else by the component table, screen by screen. Add refusal, toast, empty state and
   skeleton where a screen has none.
7. Check every touched screen at 390px and with the keyboard.

## Open questions for the product owner

1. Buttons and links in the dashboard: violet `#5228FF` (as on the site) or the deeper
   `#4421D6`? The kit says `#5228FF` for buttons, `#4421D6` for small text and chips.
2. Verified green: move to the site's `#2F7D3E`, or keep the product's sage `#4F6F52`?
   The kit says move.
3. Dark mode: the kit has none. Stay on one cream ground?
4. The sidebar's active item: violet wash (site) or the current canvas fill? The kit says violet wash.
