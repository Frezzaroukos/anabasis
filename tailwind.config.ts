import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

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
  plugins: [animate],
};

export default config;
