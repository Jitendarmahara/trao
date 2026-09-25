import type { Config } from 'tailwindcss';

/**
 * "Readiness Dossier" design tokens.
 * Cool-limestone paper, ink-navy authority, a brass signal used sparingly.
 * Difficulty/status colours are harmonised to the palette (pine/brass/clay)
 * rather than default emerald/amber/red.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#EEEFEA',
        surface: '#FBFBF8',
        ink: {
          DEFAULT: '#1A1D23',
          soft: '#565B64',
          faint: '#8A8F98',
        },
        line: {
          DEFAULT: '#E1E2DB',
          strong: '#CFD1C8',
        },
        navy: {
          DEFAULT: '#1F2A54',
          hover: '#28356A',
          tint: '#E9ECF4',
        },
        brass: {
          DEFAULT: '#9C7A1E',
          bright: '#C7A034',
          tint: '#F4EDD6',
        },
        pine: '#2C6E5B',
        clay: '#B04A38',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      boxShadow: {
        card: '0 1px 2px rgba(26,29,35,0.04), 0 1px 1px rgba(26,29,35,0.03)',
        lift: '0 8px 24px -12px rgba(31,42,84,0.22)',
        key: '0 1px 0 rgba(26,29,35,0.02), 0 12px 32px -18px rgba(31,42,84,0.30)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};
export default config;
