/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#081D24',
        bg2: '#0E2F39',
        brand: '#274C5C',
        mint: '#8FE0CF',
        mint2: '#5FBFAE',
        red: '#EF174A',
        amber: '#F4C467',
        ink: '#EEF7F6',
        dim: '#A9C6C8',
        faint: '#7A9A9F',
      },
      fontFamily: { mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'] },
    },
  },
  plugins: [],
}
