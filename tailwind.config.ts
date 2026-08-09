import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    './prototypes/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        etyme: {
          ink: '#0D1426',
          navy: '#131B2E',
          slate: '#1E293B',
          cyan: '#00D4FF',
          purple: '#7C3AED',
          blue: '#2563EB',
          amber: '#F59E0B',
          green: '#059669',
          surface: '#FFFFFF',
          ground: '#F8FAFC',
          border: '#E2E8F0',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
