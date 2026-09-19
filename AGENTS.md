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
