/** @type {import('tailwindcss').Config} */
// NativeWind v4 requires Tailwind 3. Do not upgrade to Tailwind 4.
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
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
        border: 'hsl(var(--border))',
        input: 'hsl(var(--border))',
        ring: 'hsl(var(--primary))',
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        felt: {
          DEFAULT: 'hsl(var(--felt))',
          rail: 'hsl(var(--felt-rail))',
          line: 'hsl(var(--felt-line))',
        },
        chip: {
          red: 'hsl(var(--chip-red))',
          blue: 'hsl(var(--chip-blue))',
          green: 'hsl(var(--chip-green))',
          black: 'hsl(var(--chip-black))',
          white: 'hsl(var(--chip-white))',
        },
        suit: {
          red: 'hsl(var(--suit-red))',
          black: 'hsl(var(--suit-black))',
        },
      },
    },
  },
  plugins: [],
};
