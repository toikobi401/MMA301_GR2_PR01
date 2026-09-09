# Design workflow

## Figma to code

The bridge is `packages/design-tokens`. Figma Variables and the token names in
`tokens.ts` are kept identical, so translating a design never involves guessing
which grey was used.

### Naming

| Figma Variable | Token |
|---|---|
| `color/background` | `colors.background` |
| `color/text/primary` | `colors.textPrimary` |
| `space/lg` | `spacing.lg` |
| `radius/md` | `radius.md` |

Create the Figma variables to match this list rather than inventing new names,
otherwise the mapping has to be maintained by hand.

### Changing a colour

1. Update the value in `packages/design-tokens/src/tokens.ts`.
2. Run `npm run tokens` to regenerate the CSS variables.
3. Mobile picks it up on the next reload. No component changes.

If you find yourself typing a hex code inside a component, the token is missing.
Add it to `tokens.ts` instead.

## Using tokens

React Native:

```tsx
const theme = useTheme();

<View style={{
  backgroundColor: theme.colors.surface,
  padding: theme.spacing.lg,
  borderRadius: theme.radius.md,
}} />
```

Web:

```css
.card {
  background: var(--color-surface);
  padding: var(--space-lg);
  border-radius: var(--radius-md);
}
```

## Dark mode

Both themes are defined in `tokens.ts` and share the `ThemeColors` shape, so a
missing colour in one theme is a compile error. Mobile follows the OS setting
through `useColorScheme()`. Web follows `prefers-color-scheme`.

Never define a colour only inside a dark-mode block.

## Figma MCP connection

Claude Code can read Figma files directly once the Figma connector is
authorised. It is not connected yet. To enable it, run `/mcp` in an interactive
Claude Code session and complete the sign-in, after which designs can be
translated to code without manual measurement.
