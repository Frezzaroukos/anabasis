import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        elevated: 'hsl(var(--elevated))',
        gold: 'hsl(var(--gold))',
        category: {
          push: 'hsl(var(--cat-push))',
          pull: 'hsl(var(--cat-pull))',
          legs: 'hsl(var(--cat-legs))',
          core: 'hsl(var(--cat-core))',
          mixed: 'hsl(var(--cat-mixed))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Manrope Variable', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fira Sans Condensed', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Απαλή λάμψη στο accent — active chart points, hero στοιχεία.
        glow: '0 0 12px hsl(var(--primary) / 0.35)',
        'glow-sm': '0 0 8px hsl(var(--primary) / 0.25)',
      },
    },
  },
  plugins: [
    animate,
    // `tap:` — στοχεύει κάθε συσκευή αφής (τηλέφωνο ΚΑΙ tablet), ΟΧΙ ποντίκι/desktop.
    // Δύο μέτωπα γιατί κανένα μόνο media δεν τα πιάνει όλα: τα τηλέφωνα (narrow
    // viewport) αναφέρουν pointer:fine στα headless προφίλ, ενώ τα tablet
    // αναφέρουν pointer:coarse. Το max-width πιάνει τα τηλέφωνα, το coarse τα
    // tablet· το desktop (fine + ≥1100px) δεν ταιριάζει σε κανένα → μένει πυκνό.
    // Χρήση: `tap:min-h-11 tap:min-w-11` για WCAG 2.5.5 στόχους αφής 44×44.
    plugin(({ addVariant }) => {
      addVariant('tap', ['@media (max-width: 1099px)', '@media (pointer: coarse)']);
    }),
  ],
};

export default config;
