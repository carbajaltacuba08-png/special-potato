/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        scada: {
          bg: '#0B1120',
          surface: '#1E293B',
          card: '#151F32',
          border: '#334155',
          cyan: '#06B6D4',
          emerald: '#10B981',
          amber: '#F59E0B',
          crimson: '#EF4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      }
    },
  },
  plugins: [],
}
