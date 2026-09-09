# Project notes

## Expo

Expo SDK 57 has changed significantly from earlier versions. Read the exact
versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any
mobile code. `expo-video` and `expo-audio` are the current APIs; `expo-av` is
legacy.

## Repository layout

This is an npm workspaces monorepo, not a single Expo app:

- `apps/mobile` — Expo app
- `apps/server` — Fastify API, runs in Docker, never on Vercel
- `apps/web` — Next.js, deploys to Vercel
- `packages/shared` — API contracts shared by server and clients
- `packages/design-tokens` — colours and spacing for both platforms

Read `docs/ARCHITECTURE.md` before adding a feature.

## Rules

- API request and response types go in `packages/shared` first, then get
  implemented. Both sides must compile against the same schema.
- Colours and spacing come from `packages/design-tokens`. No hex codes inside
  components.
- Every new environment variable goes in three places: `packages/shared/src/env.ts`,
  `.env.example`, and `infra/docker-compose.yml`.
- Run `npm run typecheck` before committing.

## Topic status

The project topic is not decided yet. Candidates are a personal media
streaming system and an online poker game with play money. The infrastructure
here serves either one.
