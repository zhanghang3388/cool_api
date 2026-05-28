import type { Config } from 'tailwindcss';

const config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          50: '#0a0a0f',
          100: '#111118',
          200: '#1a1a24',
          300: '#242432',
          400: '#2e2e40',
        },
        amber: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
        cyan: { 400: '#22d3ee', 500: '#06b6d4' },
        emerald: { 400: '#34d399', 500: '#10b981' },
        rose: { 400: '#fb7185', 500: '#ef4444' },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Sora', 'sans-serif'],
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 4px currentColor' },
          '50%': { opacity: '0.5', boxShadow: '0 0 8px currentColor' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'caret-blink': {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.4s ease-out forwards',
        'caret-blink': 'caret-blink 1s step-end infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

export default config;
