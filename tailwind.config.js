/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0A0F1A',
          900: '#0F172A',
          800: '#16213A',
          700: '#1E2C4A',
          600: '#2A3B5C'
        },
        paper: {
          50: '#FAFAF8',
          100: '#F4F5F2',
          200: '#E9EBE5'
        },
        signal: {
          500: '#15803D',
          600: '#166534',
          400: '#16A34A',
          100: '#DCFCE7'
        },
        rose: {
          500: '#B3413A',
          100: '#FBEAE8'
        }
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px -12px rgba(15, 23, 42, 0.15)'
      },
      borderRadius: {
        xs: '4px'
      }
    }
  },
  plugins: []
};
