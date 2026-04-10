/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#18120e',
        surface: '#221a13',
        card:    '#2a1f17',
        amber:   { DEFAULT: '#f59e0b', dim: '#d4860a', soft: 'rgba(245,158,11,0.12)' },
        terra:   { DEFAULT: '#e07a5f', dim: '#c4614a' },
        cream:   { DEFAULT: '#fef3e2', muted: '#a08c7a', faint: '#5a4a3a' },
        herb:    '#4a7c59',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem', '4xl': '2rem' },
    },
  },
  plugins: [],
}
