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
          blue: '#2563EB',
          purple: '#7C3AED',
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
        'clock-tick': 'clockTick 60s linear infinite',
        'clock-minute': 'clockMinute 3600s linear infinite',
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        clockTick: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        clockMinute: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
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
