/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#111417', 2: '#1C2126', 3: '#2A3138' },
        paper: { DEFAULT: '#FBFAF7', 2: '#F3F1EB', 3: '#ECE8DF' },
        line: { DEFAULT: '#E3DED3', dark: '#2E353C' },
        muted: { DEFAULT: '#646A71', dark: '#9AA1A8' },
        signal: { DEFAULT: '#D2341E', 600: '#B52B17', 50: '#FBEDEA' },
        lake: { DEFAULT: '#123A40', 600: '#0D2C31', 50: '#E7F0F0' },
        brass: { DEFAULT: '#C7962F', 50: '#F7F0DE' },
        ok: '#1F7A4D',
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { DEFAULT: '3px', sm: '2px', md: '4px', lg: '6px' },
      maxWidth: { page: '1240px' },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        ticker: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      animation: { rise: 'rise .5s cubic-bezier(.2,.7,.2,1) both', ticker: 'ticker 60s linear infinite' },
    },
  },
  plugins: [],
};
