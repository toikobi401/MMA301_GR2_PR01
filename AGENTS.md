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
- `packages/design-tokens` — colours and spacing for every platform

There is no separate web app. Screens in `apps/client/src/app` render natively
on device and as browser routes on web.

Read `docs/ARCHITECTURE.md` before adding a feature.

## Rules

- API request and response types go in `packages/shared` first, then get
  implemented. Both sides must compile against the same schema.
- Colours and spacing come from `packages/design-tokens`. No hex codes inside
  components.
- Workspace packages use extensionless relative imports (`./api`, not
  `./api.js`). Metro cannot resolve the `.js` form. The server uses
  `moduleResolution: "bundler"` for the same reason.
- Write one component for every platform. Only add `.web.tsx` or `.native.tsx`
  variants when the platforms genuinely need different code.
- Every new environment variable goes in three places:
  `packages/shared/src/env.ts`, `.env.example`, and
  `infra/docker-compose.yml`. Client variables must be prefixed
  `EXPO_PUBLIC_`.
- Run `npm run typecheck` before committing.

## Topic status

The project topic is not decided yet. Candidates are a personal media
streaming system and an online poker game with play money. The infrastructure
here serves either one.
