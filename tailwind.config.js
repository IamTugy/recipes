/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        card:    'rgb(var(--color-card) / <alpha-value>)',
        amber:   {
          DEFAULT: 'rgb(var(--color-amber) / <alpha-value>)',
          dim:  'rgb(var(--color-amber) / 0.7)',
          soft: 'rgb(var(--color-amber) / 0.12)',
        },
        terra:   'rgb(var(--color-terra) / <alpha-value>)',
        cream:   'rgb(var(--color-cream) / <alpha-value>)',
        herb:    'rgb(var(--color-herb) / <alpha-value>)',
        tint:    'rgb(var(--color-tint) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans:  ['Inter', 'Heebo', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem', '4xl': '2rem' },
    },
  },
  plugins: [],
}
