# Extractable components

There is no NavBar/Sidebar/Footer — the shared chrome is the native stack header (see layouts.md). The reusable, multi-page UI patterns are the poker pieces and the screen header row.

## Layout Components

## ScreenHeader
- Source: `apps/client/src/app/_layout.tsx` (native stack header styling)
- Category: layout
- Description: Native stack header — back chevron + centred/left title, white (light) / #12161D (dark), 1px bottom border
- Extractable props: title (string, default: "Poker"), showBack (boolean, default: true)
- Hardcoded: colours, font weight 600, height

## TableTopBar
- Source: `apps/client/src/app/table.tsx` (top row of the table screen)
- Category: layout
- Description: Dark bar above the felt: "← Lobby" ghost button, History, Chat (unread count), hand number
- Extractable props: handNumber (number, default: 1), unreadChat (number, default: 0)
- Hardcoded: labels, dark neutral-950 background, white text

## Basic Components

## PlayingCard
- Source: `apps/client/src/components/poker/playing-card.tsx`
- Category: basic
- Description: White rounded card with rank + suit pip (red/black), or a face-down back
- Extractable props: rank (string, default: "A"), suit (string, default: "s"), faceDown (boolean, default: false), size (string, default: "md")
- Hardcoded: suit glyphs, card back pattern, radius

## PlayerSeat
- Source: `apps/client/src/components/poker/player-seat.tsx`
- Category: basic
- Description: Avatar + name + stack plate with hole cards, committed chips, dealer "D", acting ring/clock, bot/banned badges
- Extractable props: name (string), stack (number), isActing (boolean, default: false), isDealer (boolean, default: false), isBot (boolean, default: false), status (string, default: "active")
- Hardcoded: layout, colours, badge styles

## ChipStack / PotDisplay
- Source: `apps/client/src/components/poker/chip-stack.tsx`
- Category: basic
- Description: Coloured chip discs with a mono tabular amount; pot pill in the table centre
- Extractable props: amount (number, default: 0)
- Hardcoded: chip colours, formatting

## ActionBar
- Source: `apps/client/src/components/poker/action-bar.tsx` (+ `bet-slider.tsx`)
- Category: basic
- Description: "Raise to" amount, presets 0.5x/1x/3x pot/All in, drag slider + numeric field, Fold/Check|Call/Bet|Raise buttons
- Extractable props: toCall (number, default: 0), amount (number, default: 40)
- Hardcoded: labels, preset set, dark surface styling

## Card (panel)
- Source: `apps/client/src/components/ui/card.tsx`
- Category: basic
- Description: Bordered rounded-lg panel with header/title/description/content/footer
- Extractable props: none
- Hardcoded: all styling

## Button, Badge, Tabs, Input, Avatar, EmptyState
- Source: `apps/client/src/components/ui/*.tsx`
- Category: basic
- Description: shadcn-style primitives (see components.md for variants)
- Extractable props: variant, size, label
- Hardcoded: cva class maps
