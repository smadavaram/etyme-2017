/**
 * Etyme brand kit — Tailwind theme.extend for the dashboard (etyme2040/tailwind.config.ts).
 *
 * Replace the existing `colors.etyme`, `fontFamily`, `fontSize` and `borderRadius`
 * blocks with these. Class names in the product keep working: `text-etyme-ink`,
 * `bg-etyme-canvas`, `border-etyme-rule`, `text-etyme-action` and so on all still
 * exist — only the values change. New names are added, none are removed.
 *
 * What changes on screen:
 *   action     #2B47E5 (blue)  → #5228FF (brand violet)
 *   verified   #4F6F52 (sage)  → #2F7D3E (kit green)
 *   navy / cyan / purple       → gone; the logo is the SVG in brand-kit/logo/
 */
export const etymeTheme = {
  colors: {
    etyme: {
      // Surfaces — warm, not cool
      canvas:  '#F0EEE6',
      surface: '#FBFAF7',
      raised:  '#FFFFFF',
      sunk:    '#E7E4DA',

      // Text and lines
      ink:   '#1F1E1D',
      muted: '#6B6862',
      faint: '#9C9891',
      rule:  '#E3DFD5',

      // Action — brand violet. Buttons and links use `action`;
      // chips, active navigation and small text use `action-press`.
      action:         '#5228FF',
      'action-hover': '#3F16E8',
      'action-press': '#4421D6',
      'action-down':  '#3512C4',
      'action-wash':  '#EDE9FF',
      'action-line':  '#C7CDF5',

      attention:        '#C0622E',
      'attention-wash': '#F7EDE6',
      'attention-line': '#E5C9B5',

      verified:        '#2F7D3E',
      'verified-wash': '#EDF1ED',
      'verified-line': '#C9D6CA',

      danger:        '#B83A3A',
      'danger-wash': '#FDE8E8',
      'danger-line': '#F0C0C0',

      // Logo colours only — the crossbar of the "t". Never used for UI.
      brand: { violet: '#5228FF', orange: '#E16400', green: '#00C800' },
    },
  },

  fontFamily: {
    sans:  ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
    serif: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Georgia', 'var(--font-gelasio)', 'Gelasio', 'serif'],
    mono:  ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  },

  fontSize: {
    'eyebrow': ['10px',   { letterSpacing: '0.14em', fontWeight: '600', lineHeight: '1.4', textTransform: 'uppercase' }],
    'colhead': ['9.5px',  { letterSpacing: '0.12em', fontWeight: '600', lineHeight: '1.4', textTransform: 'uppercase' }],
    'chip':    ['10px',   { letterSpacing: '0.04em', fontWeight: '600', lineHeight: '1.5' }],
    'meta':    ['12.5px', { lineHeight: '1.6' }],   // mono: dates, ids, footnotes
    'body-sm': ['13.5px', { lineHeight: '1.6' }],   // tables, navigation, hints
    'body':    ['14.5px', { lineHeight: '1.65' }],
    'body-lg': ['16px',   { lineHeight: '1.6' }],
    'h3':      ['19px',   { letterSpacing: '-0.01em', lineHeight: '1.25' }],  // serif
    'heading': ['22px',   { letterSpacing: '-0.015em', lineHeight: '1.2' }],  // serif
    'h2':      ['27px',   { letterSpacing: '-0.02em', lineHeight: '1.15' }],  // serif
    'display': ['31px',   { letterSpacing: '-0.02em', lineHeight: '1.15' }],  // serif page title
    'stat':    ['27px',   { letterSpacing: '-0.02em', lineHeight: '1.1' }],   // serif tile number
    'hero':    ['42px',   { letterSpacing: '-0.025em', lineHeight: '1.08' }], // serif
  },

  borderRadius: {
    panel: '8px',
    lg:    '12px',
    nav:   '6px',
    chip:  '5px',
    box:   '4px',
    pill:  '99px',
  },

  boxShadow: {
    lift:  '0 1px 2px #1f1e1d0f, 0 4px 14px #1f1e1d0f',
    float: '0 8px 20px #1f1e1d14, 0 24px 56px #1f1e1d1a',
  },

  transitionDuration: { fast: '120ms', DEFAULT: '180ms', slow: '260ms' },
  transitionTimingFunction: { etyme: 'cubic-bezier(.2,.7,.3,1)' },
} as const
