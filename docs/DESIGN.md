# Design

## The short version

Tailwind classes on React Native components, through NativeWind. One
`className` renders on iOS, Android, and web.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Service status</CardTitle>
  </CardHeader>
  <CardContent>
    <Text tone="muted">Everything is up.</Text>
  </CardContent>
</Card>
```

## Why not shadcn/ui itself

shadcn/ui is built on Radix UI and the DOM. It runs in a browser and nowhere
else, so dropping it in would give us a working web app and a broken phone app
— losing the single codebase this project is built around.

`apps/client/src/components/ui` holds React Native equivalents that follow the
same conventions: variants declared with `class-variance-authority`, a `cn`
helper that merges Tailwind classes, and components that live in the repository
rather than in `node_modules`, so they can be edited freely.

## Two visual registers

**Everything outside the table** is neutral and quiet: near-white or near-black
backgrounds, thin borders, one accent colour. Lobby, wallet, friends, history.

**The table** is dark felt with warm chips and white cards. Poker players
expect it, and cards need a dark surface to read against. The felt stays dark
in both themes.

Keeping these separate is deliberate. If the whole app looked like a casino it
would be tiring; if the table looked like a dashboard it would not feel like
poker.

## Colour

Semantic tokens in `apps/client/src/global.css`, as HSL channels so Tailwind's
opacity modifiers work:

| Token | Use |
|---|---|
| `background` / `foreground` | Page and its text |
| `card` / `card-foreground` | Raised surfaces |
| `muted` / `muted-foreground` | Secondary text, quiet fills |
| `primary` | The one accent; buttons and the acting-player ring |
| `destructive` | Fold, errors, losses |
| `success` | Online, wins |
| `border` / `input` / `ring` | Outlines and focus |
| `felt` / `felt-rail` / `felt-line` | The table only |
| `chip-*` / `suit-*` | Chips and card pips |

Write `bg-card`, never `bg-[#12161D]`. A hex value in a component is a token
that has not been named yet.

## Platform difference worth knowing

`dark:` resolves from the app-level colour scheme on native. A `dark` class on
a nested view cascades on web but does nothing on a phone.

So a subtree that must stay dark on every platform cannot rely on the class.
The table passes an explicit prop instead:

```tsx
<ActionBar onDarkSurface ... />
```

This is the kind of thing that looks right in a browser and breaks on a device,
so check both before calling a screen done.

## Constraints

**NativeWind v4 requires Tailwind 3.** The v4 preset is incompatible. Upgrading
breaks the build with errors that do not point at the cause.

**Touch targets are at least 44 points.** The `Button` component enforces this;
do not override the minimum height to make something fit.

**Numbers that change use `variant="numeric"`.** It applies tabular figures, so
a chip count does not shift the layout as it counts up.

## Adding a component

Put shared primitives in `components/ui`, poker-specific pieces in
`components/poker`. Follow the existing pattern:

```tsx
const badgeVariants = cva('base classes here', {
  variants: { variant: { default: '...', outline: '...' } },
  defaultVariants: { variant: 'default' },
});

export function Badge({ variant, className, ...props }: BadgeProps) {
  return <View className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

Accepting `className` last and merging it with `cn` is what lets a caller
override padding or colour without a new variant.

## Figma

The Figma connector is not authorised in this workspace. To enable it, run
`/mcp` in an interactive Claude Code session and complete the sign-in. Until
then, designs have to be translated by hand.

If you do set up Figma Variables, name them to match the tokens above
(`color/card`, `space/lg`) so the mapping stays mechanical.
