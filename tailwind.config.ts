import type { Config } from 'tailwindcss'

/**
 * Design tokens — from the prototype files (Etyme_Demo_AllViews.jsx).
 * CLAUDE.md: "The prototypes in prototypes/ define how the production UI must look and feel.
 * If the production build does not look like the prototypes, we have failed."
 *
 * Warm canvas, ink, one blue, clay for attention.
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
          // Surfaces — warm, not cool
          canvas:  '#F0EEE6',  // page background
          surface: '#FBFAF7',  // card/panel background
          raised:  '#FFFFFF',  // elevated elements

          // Text
          ink:     '#1F1E1D',  // primary text
          muted:   '#6B6862',  // secondary text
          faint:   '#9C9891',  // tertiary / labels
          rule:    '#E3DFD5',  // borders, dividers

          // Semantic
          action:    '#2B47E5',  // primary action, links
          attention: '#C0622E',  // warnings, urgent items
          verified:  '#4F6F52',  // success, verified status
          danger:    '#B83A3A',  // errors, blocked status

          // Brand — login page, logo (kept for brand elements)
          navy:    '#0D1426',
          cyan:    '#00D4FF',
          purple:  '#7C3AED',
        },
      },
      fontFamily: {
        sans:  ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Georgia', 'serif'],
        mono:  ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'eyebrow': ['10px', { letterSpacing: '0.14em', fontWeight: '600', lineHeight: '1.4' }],
        'label':   ['11px', { letterSpacing: '0.06em', fontWeight: '600', lineHeight: '1.4' }],
        'body-sm': ['13px', { lineHeight: '1.65' }],
        'body':    ['14.5px', { lineHeight: '1.65' }],
        'body-lg': ['16px', { lineHeight: '1.6' }],
        'heading': ['22px', { letterSpacing: '-0.015em', lineHeight: '1.2' }],
        'display': ['30px', { letterSpacing: '-0.02em', lineHeight: '1.15' }],
        'hero':    ['42px', { letterSpacing: '-0.025em', lineHeight: '1.1' }],
      },
      borderRadius: {
        'panel': '8px',
      },
      animation: {
        'fade-in':  'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
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
      },
    },
  },
  plugins: [],
}

export default config
