/** @type {import('tailwindcss').Config} */
// NativeWind v4 requires Tailwind 3. Do not upgrade to Tailwind 4 — the
// preset is incompatible and the build fails in ways that are hard to read.
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Semantic names, resolved from CSS variables in global.css so light
        // and dark share one set of class names. Values mirror
        // packages/design-tokens, which stays the source of truth.
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
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        // The poker table is its own world: dark felt, warm chips. Kept
        // separate from the semantic palette so the rest of the app stays
        // neutral and only the table reads as a casino.
        felt: {
          DEFAULT: 'hsl(var(--felt))',
          rail: 'hsl(var(--felt-rail))',
          line: 'hsl(var(--felt-line))',
        },
        chip: {
          white: '#F2F3F5',
          red: '#D9414A',
          green: '#2F9E6E',
          blue: '#3A6FD8',
          black: '#1A1D23',
        },
        suit: {
          red: '#D9414A',
          black: '#1A1D23',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      fontFamily: {
        // Tabular figures keep chip counts from jittering as they change.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
