import type { Config } from 'tailwindcss'

/**
 * Design tokens — from the brand kit, adopted 2026-09-26.
 *
 * CLAUDE.md, "Design system — the brand kit for the surface, the prototypes
 * for the rest": the kit decides color, type, corners, shadows, motion, icons
 * and the logo. The prototypes in prototypes/ still decide layout, screens and
 * behavior. Where the two disagree about a color or a typeface, the kit wins.
 *
 * Source values: brand-kit/tailwind.tokens.ts on the production remote
 * (git show deploy/main:brand-kit/tailwind.tokens.ts). The folder is not
 * checked into this branch on purpose — the values are here, the copy is not.
 *
 * NAMES STAY, VALUES CHANGE. 88 files use `etyme-action`, 95 use
 * `etyme-attention`, 56 use `etyme-verified`. None of them moves. Deleting a
 * token name turns a five-file change into a two-hundred-file one, and a
 * deleted Tailwind class fails silently — no error, just no background.
 */

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    './prototypes/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        etyme: {
          // Surfaces — one warm cream ground. No dark mode; the kit has none.
          canvas:  '#F0EEE6',  // page background
          surface: '#FBFAF7',  // panels, the rail, table row hover
          raised:  '#FFFFFF',  // cards, inputs, menus, modals
          sunk:    '#E7E4DA',  // hover fill on nav items and secondary buttons, meters, skeletons

          // Text and lines
          ink:     '#1F1E1D',  // primary text — ink, never pure black
          muted:   '#6B6862',  // secondary text
          faint:   '#9C9891',  // eyebrows, column headers, placeholders
          rule:    '#E3DFD5',  // every border and divider

          /**
           * Action — the brand violet, and it splits by use. Founder's
           * decision, 2026-09-26, on measurement rather than taste:
           *
           *   `action`       #5228FF on a filled button. White on it is 6.76:1.
           *   `action-press` #4421D6 for links, chips, active nav, small text.
           *                  8.26:1 on surface against the brighter violet's
           *                  6.48, and 7.27:1 on the chip wash against 5.70.
           *
           * Small type is most of this product, so the deeper violet is what a
           * reader meets most often.
           */
          action:         '#5228FF',
          'action-hover': '#3F16E8',
          'action-press': '#4421D6',
          'action-down':  '#3512C4',
          'action-wash':  '#EDE9FF',
          'action-line':  '#C7CDF5',

          attention:        '#C0622E',  // unchanged by the kit
          'attention-wash': '#F7EDE6',
          'attention-line': '#E5C9B5',

          /**
           * Verified — OURS, KEPT. The kit proposes #2F7D3E and this token does
           * not take it. Measured with the same WCAG arithmetic
           * __tests__/invariants/chart-colors.test.ts uses: on the verified
           * chip's own wash (#EDF1ED) the kit's green scores 4.46:1 and our
           * sage scores 4.94:1. The verified chip is the most-read small text
           * in the product, and the kit's green takes it from passing 4.5 to
           * just under.
           *
           * A darker green has been asked for from the kit's author — one that
           * clears 4.5 on #EDF1ED. Until that arrives this value does not move.
           * Do not "finish the job" by swapping it in.
           */
          verified:        '#4F6F52',
          'verified-wash': '#EDF1ED',
          'verified-line': '#C9D6CA',

          danger:        '#B83A3A',  // unchanged by the kit
          'danger-wash': '#FDE8E8',
          'danger-line': '#F0C0C0',

          /**
           * Navy — retired by the kit, kept alive because six places still draw
           * with it: the login page's dark ground (3) and the import page's
           * button hover (3). Removing the name would blank a Tailwind class
           * silently rather than loudly, and the login page's whole background
           * is one of them. It goes when those screens are reworked in the
           * screen-by-screen pass; it is not a color for anything new.
           *
           * Cyan #00D4FF and purple #7C3AED are gone — they existed only for
           * the CSS-drawn logo, which is now the kit's SVG.
           *
           * The logo's vivid green #00C800 is deliberately NOT a token. White
           * on it scores 2.27:1, unusable on any control, so it lives in the
           * logo SVG and nowhere a screen can reach. This differs from the
           * kit, which offers it as colors.etyme.brand.green; the founder's
           * decision is logo-only, enforced rather than described.
           */
          navy: '#0D1426',
        },
      },
      fontFamily: {
        sans:  ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Gelasio sits after Georgia on purpose: it is metric-compatible with
        // Georgia and is the webfont for the machines that have no Georgia.
        serif: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Georgia', 'var(--font-gelasio)', 'Gelasio', 'serif'],
        mono:  ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // The kit's scale. `label` is not the kit's and is kept because names stay.
        // Uppercasing is left to the .eyebrow / th CSS rules — Tailwind's
        // fontSize options carry lineHeight, letterSpacing and fontWeight only.
        'eyebrow': ['10px',   { letterSpacing: '0.14em',  fontWeight: '600', lineHeight: '1.4' }],
        'colhead': ['9.5px',  { letterSpacing: '0.12em',  fontWeight: '600', lineHeight: '1.4' }],
        'chip':    ['10px',   { letterSpacing: '0.04em',  fontWeight: '600', lineHeight: '1.5' }],
        'label':   ['11px',   { letterSpacing: '0.06em',  fontWeight: '600', lineHeight: '1.4' }],
        'meta':    ['12.5px', { lineHeight: '1.6' }],    // mono: dates, ids, footnotes
        'body-sm': ['13.5px', { lineHeight: '1.6' }],    // tables, navigation, hints
        'body':    ['14.5px', { lineHeight: '1.65' }],
        'body-lg': ['16px',   { lineHeight: '1.6' }],
        'h3':      ['19px',   { letterSpacing: '-0.01em',  lineHeight: '1.25' }],  // serif, card titles
        'heading': ['22px',   { letterSpacing: '-0.015em', lineHeight: '1.2' }],   // serif, modal titles
        'h2':      ['27px',   { letterSpacing: '-0.02em',  lineHeight: '1.15' }],  // serif
        'stat':    ['27px',   { letterSpacing: '-0.02em',  lineHeight: '1.1' }],   // serif tile number
        'display': ['31px',   { letterSpacing: '-0.02em',  lineHeight: '1.15' }],  // serif page title
        'hero':    ['42px',   { letterSpacing: '-0.025em', lineHeight: '1.08' }],  // serif
      },
      /**
       * The kit's radii. One deliberate rename: the kit calls the 12px step
       * `lg`, which collides with Tailwind's own built-in `rounded-lg` — 310
       * elements in this app use that class and are at 8px today, which is the
       * value the kit's own table gives panels, cards, buttons and inputs.
       * Taking the kit's key literally would move all 310 to 12px silently, on
       * a run scoped to tokens. So the 12px step is `r-lg` (rounded-r-lg) and
       * Tailwind's `lg` keeps its 8px. Same value, no collateral.
       */
      borderRadius: {
        panel:  '8px',   // buttons, inputs, cards, panels, tiles — kept, 4 callers
        'r-lg': '12px',  // shells, modals, drawers, figures, command palette
        nav:    '6px',   // rail items, pager buttons, menu items
        chip:   '5px',   // chips
        box:    '4px',   // checkboxes, kbd, focus corners
        pill:   '99px',  // filter pills, badges, meters, switches
      },
      boxShadow: {
        lift:  '0 1px 2px #1f1e1d0f, 0 4px 14px #1f1e1d0f',    // a hovered clickable card
        float: '0 8px 20px #1f1e1d14, 0 24px 56px #1f1e1d1a',  // menus, modals, drawers, toasts
      },
      transitionDuration: { fast: '120ms', DEFAULT: '180ms', slow: '260ms' },
      transitionTimingFunction: { etyme: 'cubic-bezier(.2,.7,.3,1)' },
      animation: {
        'fade-in':  'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        // The phone's navigation sheet. Used under motion-safe: only.
        'slide-in-left': 'slideInLeft 0.22s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-100%)' },
          to:   { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
