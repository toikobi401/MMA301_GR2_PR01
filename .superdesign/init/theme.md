# Theme

## Part 1 — Token summary

Two visual registers, deliberately separate:
- **Everything outside the table** — neutral and quiet: near-white (light) / near-black (dark) backgrounds, thin borders, ONE accent colour (indigo `primary`).
- **The table** — dark green felt with a wooden rail, warm casino chips, white cards. The felt stays dark in BOTH themes.

Colours are HSL channels in CSS variables, consumed as `hsl(var(--x))` so Tailwind opacity modifiers work (`bg-primary/50`). Components use semantic classes only (`bg-card`, `text-muted-foreground`), never raw hex.

| Token | Light | Dark |
|---|---|---|
| background | hsl(220 20% 98%) ≈ #F7F8FA | hsl(220 30% 6%) ≈ #0A0D12 |
| foreground | hsl(220 26% 9%) ≈ #12161D | hsl(220 20% 97%) ≈ #F5F6F8 |
| card | #FFFFFF | hsl(220 26% 9%) ≈ #12161D |
| popover | #FFFFFF | hsl(220 24% 12%) |
| primary / ring | hsl(231 87% 66%) ≈ #6376F2 (indigo) | same |
| primary-foreground | #FFFFFF | #FFFFFF |
| secondary / muted | hsl(220 20% 94%) | hsl(220 24% 14%) |
| secondary-foreground | hsl(220 20% 25%) | hsl(220 18% 82%) |
| muted-foreground | hsl(220 11% 48%) | hsl(220 13% 65%) |
| accent | hsl(231 87% 66%) | hsl(231 87% 72%) |
| destructive | hsl(358 75% 59%) ≈ #E5484D | same |
| success | hsl(158 56% 39%) ≈ #2C9A6E | hsl(158 56% 45%) |
| border / input | hsl(220 18% 89%) | hsl(220 24% 17%) |
| felt | hsl(162 42% 13%) ≈ #13302A | hsl(162 45% 10%) |
| felt-rail | hsl(20 25% 14%) (dark wood) | hsl(20 28% 11%) |
| felt-line | hsl(162 25% 24%) | hsl(162 28% 20%) |

Fixed (non-themed) casino colours:
- Chips: white #F2F3F5, red #D9414A, green #2F9E6E, blue #3A6FD8, black #1A1D23
- Suits: red #D9414A (♥ ♦), black #1A1D23 (♠ ♣)

Typography: platform system font (no custom font loaded). Weights 400/500/600/700. `font-mono` (ui-monospace, SFMono-Regular, Menlo) with tabular figures for every chip count so numbers don't jitter.
Type scale via `<Text variant>`: display (4xl bold tight), title (2xl bold tight), heading (xl semibold), subheading (lg semibold), body (base), bodyStrong (base medium), caption (sm), label (xs medium uppercase tracking-wider), numeric (base mono tabular-nums).
Buttons: min height 36/44/52px (sm/default/lg), 44px square icon size — touch-target sized.

Radius: sm 6px · md 10px · lg 14px · xl 20px (cards/sheets use lg). Spacing: Tailwind default 4px scale; screens use `p-4`/`p-6`, gaps `gap-2`–`gap-4`.
Shadows: minimal — borders do the separation work; the felt uses an inset rail.
Dark mode: `darkMode: 'class'`. On web `.dark` on any subtree forces dark; on native `dark:` follows the app scheme, so the table passes `onDarkSurface` props and uses explicit `text-white/xx`.
Breakpoints: none used — layouts are single-column, phone-first, and stretch on web.

## Part 2 — Raw sources

### `apps/client/src/global.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * Colour variables, in HSL channels so Tailwind can apply opacity modifiers
 * like `bg-primary/50`.
 *
 * These mirror packages/design-tokens. That package stays the source of truth
 * for anything read from TypeScript; these values exist so class names work.
 * Change a colour in both places or they drift.
 */

@layer base {
  :root {
    --background: 220 20% 98%;
    --foreground: 220 26% 9%;

    --card: 0 0% 100%;
    --card-foreground: 220 26% 9%;

    --popover: 0 0% 100%;
    --popover-foreground: 220 26% 9%;

    --primary: 231 87% 66%;
    --primary-foreground: 0 0% 100%;

    --secondary: 220 20% 94%;
    --secondary-foreground: 220 20% 25%;

    --muted: 220 20% 94%;
    --muted-foreground: 220 11% 48%;

    --accent: 231 87% 66%;
    --accent-foreground: 0 0% 100%;

    --destructive: 358 75% 59%;
    --destructive-foreground: 0 0% 100%;

    --success: 158 56% 39%;
    --success-foreground: 0 0% 100%;

    --border: 220 18% 89%;
    --input: 220 18% 89%;
    --ring: 231 87% 66%;

    /* The felt stays dark in both themes. A poker table lit like a document
       reads as a spreadsheet, and players expect the cards to pop against a
       dark surface. */
    --felt: 162 42% 13%;
    --felt-rail: 20 25% 14%;
    --felt-line: 162 25% 24%;
  }

  /* `:root` covers the app-wide toggle; the bare `.dark` lets any subtree
     force dark, which the poker table needs since its felt stays dark in
     both themes. */
  .dark:root,
  .dark {
    --background: 220 30% 6%;
    --foreground: 220 20% 97%;

    --card: 220 26% 9%;
    --card-foreground: 220 20% 97%;

    --popover: 220 24% 12%;
    --popover-foreground: 220 20% 97%;

    --primary: 231 87% 66%;
    --primary-foreground: 0 0% 100%;

    --secondary: 220 24% 14%;
    --secondary-foreground: 220 18% 82%;

    --muted: 220 24% 14%;
    --muted-foreground: 220 13% 65%;

    --accent: 231 87% 72%;
    --accent-foreground: 220 30% 6%;

    --destructive: 358 75% 59%;
    --destructive-foreground: 0 0% 100%;

    --success: 158 56% 45%;
    --success-foreground: 220 30% 6%;

    --border: 220 24% 17%;
    --input: 220 24% 17%;
    --ring: 231 87% 66%;

    --felt: 162 45% 10%;
    --felt-rail: 20 28% 11%;
    --felt-line: 162 28% 20%;
  }
}
```

### `apps/client/tailwind.config.js`

```js
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
```
