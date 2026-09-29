# Pages — component dependency trees

All pages also depend on `apps/client/src/global.css` and `apps/client/tailwind.config.js` (tokens) and render inside `apps/client/src/app/_layout.tsx`.

## /table (Poker table — the core screen)
Entry: apps/client/src/app/table.tsx
Dependencies:
- apps/client/src/components/ui/button.tsx
  - apps/client/src/components/ui/text.tsx
- apps/client/src/components/poker/index.ts
  - apps/client/src/components/poker/table-felt.tsx
  - apps/client/src/components/poker/board.tsx
    - apps/client/src/components/poker/dealt-card.tsx
      - apps/client/src/components/poker/playing-card.tsx
  - apps/client/src/components/poker/chip-stack.tsx (PotDisplay)
  - apps/client/src/components/poker/player-seat.tsx
    - apps/client/src/components/ui/avatar.tsx
    - apps/client/src/components/poker/chip-stack.tsx
    - apps/client/src/components/poker/dealt-card.tsx
    - apps/client/src/components/poker/playing-card.tsx
  - apps/client/src/components/poker/action-bar.tsx
    - apps/client/src/components/poker/bet-slider.tsx
    - apps/client/src/components/poker/chip-stack.tsx
  - apps/client/src/components/poker/hand-log.tsx
    - apps/client/src/components/ui/{badge,button,tabs,text}.tsx
    - apps/client/src/components/poker/playing-card.tsx
  - apps/client/src/components/poker/table-chat.tsx
    - apps/client/src/components/ui/{button,input,text}.tsx
  - apps/client/src/components/poker/add-bot-sheet.tsx
    - apps/client/src/components/ui/{button,text}.tsx
- apps/client/src/lib/cn.ts
- (logic only, skip for design) lib/api.ts, lib/api-client.ts, lib/session.ts, lib/use-table-socket.ts, lib/use-hydrated.ts

## / (Lobby + sign in)
Entry: apps/client/src/app/index.tsx
Dependencies:
  - apps/client/src/components/ui/index.ts (Button, Card*, Input, Badge, Avatar, Tabs, EmptyState, Text)
    - apps/client/src/components/ui/*.tsx
      - apps/client/src/lib/cn.ts
- apps/client/src/lib/theme.ts
- (logic only) lib/api.ts, lib/session.ts, lib/use-hydrated.ts

## /wallet
Entry: apps/client/src/app/wallet.tsx
Dependencies:
  - apps/client/src/components/ui/index.ts (Button, Card*, Input, Badge, Avatar, Tabs, EmptyState, Text)
    - apps/client/src/components/ui/*.tsx
      - apps/client/src/lib/cn.ts
- apps/client/src/components/poker/chip-stack.tsx (formatChips)
- (logic only) lib/api-client.ts, lib/session.ts, lib/use-hydrated.ts

## /moderation (Tournament control)
Entry: apps/client/src/app/moderation.tsx
Dependencies:
  - apps/client/src/components/ui/index.ts (Button, Card*, Input, Badge, Avatar, Tabs, EmptyState, Text)
    - apps/client/src/components/ui/*.tsx
      - apps/client/src/lib/cn.ts
- apps/client/src/components/poker/chip-stack.tsx (formatChips)
- (logic only) lib/api-client.ts, lib/session.ts, lib/use-hydrated.ts

## /leaderboard
Entry: apps/client/src/app/leaderboard.tsx
Dependencies:
  - apps/client/src/components/ui/index.ts (Button, Card*, Input, Badge, Avatar, Tabs, EmptyState, Text)
    - apps/client/src/components/ui/*.tsx
      - apps/client/src/lib/cn.ts
- apps/client/src/components/poker/chip-stack.tsx (formatChips)
- (logic only) lib/api-client.ts, lib/mock-api.ts, lib/session.ts

## /history
Entry: apps/client/src/app/history.tsx
Dependencies:
  - apps/client/src/components/ui/index.ts (Button, Card*, Input, Badge, Avatar, Tabs, EmptyState, Text)
    - apps/client/src/components/ui/*.tsx
      - apps/client/src/lib/cn.ts
- apps/client/src/components/poker/playing-card.tsx (CardRow)
- apps/client/src/components/poker/chip-stack.tsx (formatChips)
- (logic only) lib/api-client.ts, lib/mock-api.ts, lib/session.ts

## /friends
Entry: apps/client/src/app/friends.tsx
Dependencies:
  - apps/client/src/components/ui/index.ts (Button, Card*, Input, Badge, Avatar, Tabs, EmptyState, Text)
    - apps/client/src/components/ui/*.tsx
      - apps/client/src/lib/cn.ts
- (logic only) lib/api-client.ts, lib/mock-api.ts, lib/session.ts
