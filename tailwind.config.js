/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)', ink2: 'var(--ink2)', ink3: 'var(--ink3)', line: 'var(--line)',
        blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)',
      },
      fontFamily: { sans: 'var(--sans)', mono: 'var(--mono)' },
    },
  },
  plugins: [],
};
