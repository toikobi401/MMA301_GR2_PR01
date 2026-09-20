# Project notes

## Expo

Expo SDK 57 has changed significantly from earlier versions. Read the exact
versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any
client code. `expo-video` and `expo-audio` are the current APIs; `expo-av` is
legacy.

## Repository layout

npm workspaces monorepo with one client for every platform:

- `apps/client` — Expo app for iOS, Android, and web (Expo Router)
- `apps/server` — Fastify API, runs in Docker, never on Vercel
- `packages/shared` — API contracts shared by server and client
- `packages/poker` — rules engine, pure logic, tested

There is no separate web app. Screens in `apps/client/src/app` render natively
on device and as browser routes on web.

Read `docs/ARCHITECTURE.md` before adding a feature.

## Rules

- API request and response types go in `packages/shared` first, then get
  implemented. Both sides must compile against the same schema.
- The UI uses NativeWind (Tailwind classes on React Native). Colours come from
  the semantic tokens in `apps/client/src/global.css`, never from raw hex in a
  component. shadcn/ui itself cannot run here — it needs Radix and the DOM —
  so `src/components/ui` holds the React Native equivalents.
- NativeWind v4 requires Tailwind **3**. Upgrading to Tailwind 4 breaks the
  build.
- `dark:` resolves from the app-level scheme on native; a `dark` class on a
  nested view only cascades on web. A subtree that must stay dark on every
  platform takes an explicit prop, as `ActionBar` does with `onDarkSurface`.
- Workspace packages use extensionless relative imports (`./api`, not
  `./api.js`). Metro cannot resolve the `.js` form. The server uses
  `moduleResolution: "bundler"` for the same reason.
- Write one component for every platform. Only add `.web.tsx` or `.native.tsx`
  variants when the platforms genuinely need different code.
- Every new environment variable goes in three places:
  `packages/shared/src/env.ts`, `.env.example`, and
  `infra/docker-compose.yml`. Client variables must be prefixed
  `EXPO_PUBLIC_`.
- The database is MongoDB. Never read a value and write it back — use a
  conditional atomic update (`findOneAndUpdate` with a guard in the filter),
  or two concurrent requests will lose one of the writes. This matters most
  for chips.
- Let unique indexes reject duplicates. Checking first and inserting after
  leaves a race window.
- Run `npm run typecheck` before committing.
- Start the client through npm (`npm run dev`, `npm run web`), not `npx expo
  start` directly. A pre-hook creates `.expo/types`, which Expo Router writes
  into but does not create; without it the dev server errors on every file
  change. Never delete `.expo` while the server is running.

## The project

Online Texas Hold'em with play money. No real currency anywhere; deposits and
withdrawals are simulated.

Scope: accounts, simulated payments, realtime leaderboard, private and public
tables, friends, in-game chat, hand history, and per-action replay.

- `packages/poker` holds the rules engine: cards, hand evaluation, pot
  splitting, and the betting state machine. It is pure logic with no
  networking, and it is tested. Change it only with tests alongside.
- Deployment runs through Cloudflare Tunnel to a domain. See
  `docs/DEPLOYMENT.md`.

## Poker rules that are easy to get wrong

These are already handled and covered by tests. Do not "simplify" them.

- The wheel (A-2-3-4-5) is a five-high straight, so the ace plays low and the
  hand ranks below a six-high straight.
- Heads-up, the button posts the small blind and acts first preflop, then
  last on every later street.
- The big blind keeps an option to raise after callers, so the preflop street
  does not end merely because everyone has matched.
- An all-in for less than a full raise does not reopen the betting.
- Side pots come from commitment levels. A player can only win, from each
  opponent, up to what they themselves put in.

## Security rules for the game

The server is the only authority. Never trust the client for anything that
decides money or cards.

- Hole cards belong to one player. The server removes other players' cards
  before sending state; it never sends everything and relies on the client to
  hide the rest. `redactForPlayer` does this.
- The deck never leaves the server. It is the remainder of the shuffle, so
  leaking it reveals every future card.
- Shuffle with a cryptographically secure random source. `Math.random` is
  predictable from a handful of observed hands.
- Validate every action against `legalActions` on the server, whatever the
  client shows.

## Realtime

- Hand state lives in memory in `apps/server/src/game`. Only the finished hand
  is written to Mongo. This is single-process by design: two server instances
  would each hold their own copy of the same table.
- A player action triggers exactly one broadcast, from the engine's `onChange`
  callback. Do not broadcast again from the socket handler — clients that act
  on the first state while a second is in flight read a stale turn.
- Reconnects get a full snapshot, never a replay of missed messages. Clients
  ignore any state whose sequence is not newer than the last one applied.

## Bots

Four tiers in `packages/poker/src/bot`: easy plays at random, medium weighs
hand strength against pot odds, hard runs a Monte Carlo equity estimate, and
expert adds opponent modelling on top of hard.

- **A bot never sees a `HandState`.** It receives a `BotView`, which has no
  `deck` field and no `holeCards` key on opponents — reaching for an
  opponent's cards is a compile error, not a review finding. `buildBotView` is
  the only bridge.
- Policies are synchronous and pure. Not being async is deliberate: it means a
  policy cannot perform I/O, which is where a cheating implementation would go
  looking for information.
- The driver clamps every decision before acting, so a buggy policy degrades
  to a legal action rather than wedging the table.
- Bots are `users` rows with `isBot`, seated with a fixed stack. They do not
  touch the wallet and get no `playerStats` row, so chips are **not** conserved
  across a table with bots on it. That is deliberate: the ledger stays a record
  of human money.
- Run `npm run seed:bots` once before adding bots to a table.

### Thresholds are on different scales per street

Preflop strength comes from the Chen formula, where a premium hand scores
about 0.7. Postflop comes from `category / 8`, where top pair is about 0.22
and a flush is 0.73. One set of thresholds for both makes a bot check top pair
every time. Check the scale before tuning a number.

## The table's public log

`GET /api/v1/tables/:id/hands` is the record of finished hands at one table,
readable by anyone seated there.

The rule it encodes: **betting is public, cards are not.** Every action
happened in front of the table, so reviewing it afterwards only levels the
field between a player taking notes and one who is not. Cards appear only
where they were actually shown — `holeCards` is written at showdown and left
null otherwise, so passing it through reveals nothing new.

- A hand joins the record when it ends with a winner, never before. A partial
  record would leak live betting to someone who had already folded.
- Restricted to seated players and moderators. Opening it wider would turn the
  lobby into a database of how everyone plays, which is a different thing.
- `hand_finished` over the socket is the signal to refetch. It was defined in
  the protocol from the start and never emitted until now.

## Static rendering and hydration

The web build is prerendered with no URL parameters and no session. A screen
that branches on either before hydrating renders one thing at build time and
another in the browser, and React discards the server markup — error #418.

Every session- or param-dependent screen gates on `useHydrated()` as well as
`restoring`. Adding a new one means doing the same.

## Mocked endpoints

`apps/client/src/lib/api-client.ts` is the single list of every call a screen
makes. Each is marked LIVE or MOCK. A MOCK returns fixtures from
`mock-api.ts`, which names the exact route that needs building at the top of
the file.

Still missing on the server, all with contracts already written: friends,
user search, hand history, leaderboard, and the chat backlog. Sending chat
already works over the socket; only fetching past messages is mocked.

Replacing a mock is one line in `api-client.ts`. No screen changes.

## Sessions

The refresh token is persisted — the keychain on device, `localStorage` on
web, because `expo-secure-store` is a no-op there. That fallback is a real
weakening: anything running in the page can read it. Accepted because the
alternative is an httpOnly cookie, which the native app cannot use, and
access tokens last fifteen minutes.

Screens that gate on `token` must also check `restoring`, or every reload
flashes the signed-out view before the stored token is exchanged.

## Deal animation

The animation is entirely client-side. The server sends the finished state and
`DealtCard` replays the deal visually.

Driving it from the server — one card per message — would leave the table in a
half-dealt state if the connection dropped mid-deal, with no way to recover.
A player joining mid-hand skips the animation and renders immediately.
