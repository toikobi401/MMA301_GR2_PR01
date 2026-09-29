# Design System — MMA301 Poker (play-money Texas Hold'em)

This is a HARD constraint. Every draft uses only the fonts, colours, radii, spacing and component styles below. Do not introduce new fonts, gradients, neon, purple/pink, glassmorphism, or casino gold-and-red decoration.

## Product context

- Online Texas Hold'em with **play money only** — no real currency anywhere. Chips are simulated.
- One Expo (React Native) codebase rendered on **iOS, Android and web**. Design phone-first (390px wide); web stretches the same single column.
- Users: players (register, wallet, lobby, play at a table, chat, read the table's hand log), moderators/admins ("Tournament control": open/close tables, ban players, change roles). Bots sit at tables with difficulty badges.
- Key screens: Lobby + sign-in (`/`), **Table** (`/table`, the core), Wallet, Friends, Leaderboard, Hand history, Tournament control.
- JTBD: "Sit down and play a hand quickly and read the table clearly", "Know my chip balance", "Review what opponents did".

## Two visual registers (the defining rule)

1. **Everything outside the table — neutral and quiet.** Near-white (light) or near-black (dark) background, white/near-black cards with 1px borders, ONE accent colour (indigo). Reads like a calm modern app, not a casino.
2. **The table — dark felt.** Deep green felt inside a dark wood rail, white playing cards, warm casino chips. **The felt stays dark in both light and dark themes.** Text on the table is white at varying opacity.

Never blend them: no felt green in the lobby, no indigo panels on the felt except the acting-player ring and primary buttons.

## Colour tokens

Semantic tokens (HSL). Light / Dark:

| Token | Light | Dark | Use |
|---|---|---|---|
| background | #F7F8FA | #0A0D12 | page |
| foreground | #12161D | #F5F6F8 | text |
| card | #FFFFFF | #12161D | raised panels |
| primary | #6376F2 (indigo, hsl 231 87% 66%) | same | the only accent: primary buttons, active tab, acting-player ring, focus ring, slider fill |
| secondary / muted | hsl(220 20% 94%) | hsl(220 24% 14%) | secondary buttons, quiet fills |
| muted-foreground | hsl(220 11% 48%) | hsl(220 13% 65%) | secondary text |
| destructive | #E5484D | same | Fold, errors, losses, BANNED badge |
| success | #2C9A6E | #33B07E | wins, online dot, positive chip deltas |
| border / input | hsl(220 18% 89%) | hsl(220 24% 17%) | 1px outlines |

Table-only:
- felt `#13302A` (dark: `#0E2620`), felt-rail (dark wood) `hsl(20 25% 14%)`, felt-line `hsl(162 25% 24%)` for the inner 1px outline.
- Table chrome (top bar, action panel): `neutral-950` / `neutral-900` with `border-white/10`.
- Chips: white #F2F3F5, red #D9414A, green #2F9E6E, blue #3A6FD8, black #1A1D23.
- Suits: red #D9414A (♥ ♦), black #1A1D23 (♠ ♣). Cards are white.
- Text on felt: `white`, `white/70`, `white/50`, `white/30`.

## Typography

- System font stack only (SF / Roboto / Segoe). No custom or serif fonts.
- Scale: display 36 bold tight · title 24 bold tight · heading 20 semibold · subheading 18 semibold · body 16 · bodyStrong 16 medium · caption 14 · label 12 medium UPPERCASE tracking-wider · numeric 16 mono tabular.
- **Every chip amount uses the monospace tabular-figure style** (ui-monospace, SFMono-Regular, Menlo) so numbers don't jitter. Thousands separated with commas (1,990).

## Shape, spacing, elevation

- Radius: sm 6 · md 10 · lg 14 · xl 20. Buttons/inputs md; cards and sheets lg; felt outer rail 40, inner felt 32; badges fully rounded or 4.
- Spacing: 4px grid. Screen padding 16–24; gaps 8–16.
- Elevation: almost none. Separation comes from 1px borders and background steps, not shadows.
- Touch targets ≥ 44px (buttons 36 sm / 44 default / 52 lg).

## Components

- **Button**: solid primary (indigo, white text), secondary (muted fill), outline (1px border, transparent), ghost (transparent), destructive (red), success (green). Medium weight label, radius md.
- **Card**: white/`card` panel, 1px border, radius lg, padding 16–24; header = title (heading) + description (muted caption).
- **Input**: 44px min height, 1px border, radius md, label above in caption medium, focus = indigo ring border, error = red border + red caption.
- **Badge**: small pill; variants default (indigo), secondary, outline, destructive, success, muted.
- **Tabs**: segmented control on a muted track; active segment is a raised card-coloured pill.
- **Avatar**: circle with initials on muted fill.
- **EmptyState**: centred title + muted description + optional button.
- **Bottom sheet** (hand log, chat, add bot): dim black/50 backdrop, sheet with rounded top (lg), 1px top border, card background (dark on the table), max 80% height, title row with ghost "Refresh"/"Close".

### Poker components
- **PlayingCard**: white with a 1px black/10 border, radius md, rank above a suit pip, both in suit red/black. Face-down = **solid indigo (`bg-primary`)** with a 1px white/10 border and an inset 2/3-size frame in white/20 — deliberately no pattern, which turns to noise at phone size. Sizes sm 32×44 / default 48×64 / lg 68×96. Folded cards at 30% opacity; dimmed cards 40%.
- **Board**: five card slots in a row centred on the felt; empty slots are faint outlined placeholders.
- **PotDisplay**: dark translucent pill on the felt: "POT" label (white/60, label style) + mono amount (white, semibold).
- **ChipStack**: 1–3 overlapping coloured chip discs + mono amount.
- **PlayerSeat**: centred column — committed chips (ChipStack) above, hole cards, then a name plate: rounded-lg, 1px white/10 border on black/40 (own seat: white/25 border). Inside: avatar (neutral-800 circle, initials) with a small white "D" dealer disc at top-right; name (white caption medium) with tiny badges (bot difficulty in white/15, BANNED in destructive); stack in mono white/70, or **"ALL IN" in chip-red** when all-in. The acting player's plate becomes **indigo: border-primary on primary/15**, with a 4px clock bar underneath (indigo, turning destructive red below 25%). Folded: cards 30% opacity, plate 40%. Empty seat = dashed white/30 outline with "+ Add bot".
- **ActionBar** (dark panel under the felt): row "Raise to" label + large mono amount; preset chips `0.5x pot · 1x pot · 3x pot · All in` (outline, selected = solid indigo); drag slider (white/15 track, indigo fill, white-bordered indigo thumb) with a 96px mono numeric field on the right; then a row of equal-width buttons **Fold** (outline white/20) · **Check / Call N** (secondary) · **Bet / Raise** (primary indigo). When it isn't your turn: "Waiting for other players" in white/50.

## Layout patterns

- **Table screen** (no stack header): top bar (← Lobby ghost · History · Chat (n) · Hand #N) → felt fills the screen: opponents spread across the top row, pot + board + "Deal" in the centre, viewer's own seat at the bottom → action panel pinned at the bottom.
- **Other screens**: native stack header (white / #12161D, title semibold, back chevron) → scrollable single column of Cards with 16–24 padding.
- **Lobby**: small brand block ("MMA301 · Group 2" label, "Texas Hold'em" title, "Play money. No real currency anywhere." muted) + theme toggle (☾/☀), then either the Sign in / Register card or: balance, nav buttons row (Wallet, Friends, Leaderboard, History, Tournament control for staff), list of table cards (name, blinds, buy-in range, seated n/max, Join).
- Icons: no icon library — plain text glyphs (←, ☾, ☀, ♠♥♦♣, +). Do not introduce icon sets.

## Motion

- Deal: cards slide from the centre and fade in, staggered per seat (~1.2s total). Joining mid-hand renders instantly.
- Acting clock bar drains smoothly. Buttons press with opacity 90%. No bouncy or decorative animation.

## Voice

Short, plain labels in English ("Fold", "Call 10", "Raise to", "Waiting for other players", "Play money. No real currency anywhere."). Numbers over words.
