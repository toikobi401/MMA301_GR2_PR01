# MMA301 GR2 PR01

Cross-platform application built with Expo (React Native), a Fastify API, and a
Next.js web surface, sharing one set of types and design tokens.

The project topic is not fixed yet. Everything here is topic-agnostic
infrastructure that both candidate ideas (media streaming / realtime multiplayer)
need anyway.

## Layout

```
apps/
  mobile/     Expo SDK 57 app (iOS, Android, web)
  server/     Fastify API — runs in Docker
  web/        Next.js app — deploys to Vercel
packages/
  shared/         API contracts, Zod schemas, HTTP client
  design-tokens/  Colours, spacing, typography — one source for RN and web
infra/
  docker-compose.yml   Postgres + Redis + API
```

## Requirements

| Tool | Version |
|---|---|
| Node | 24 or newer |
| Docker Desktop | running before `docker:up` |
| Expo Go | on your phone, for mobile testing |

## First run

```bash
npm install
cp .env.example .env
npm run docker:up
```

Then check the API answers:

```bash
curl http://localhost:4000/health/ready
```

Start the clients in separate terminals:

```bash
npm run mobile     # Expo dev server, scan the QR code
npm run web:dev    # http://localhost:3000
```

Both surfaces show the same service-status panel. Green means the whole chain
works end to end.

## Scripts

| Command | Purpose |
|---|---|
| `npm run docker:up` | Start Postgres, Redis, and the API |
| `npm run docker:logs` | Tail all container logs |
| `npm run docker:down` | Stop containers, keep data |
| `npm run docker:reset` | Stop and delete volumes (wipes the database) |
| `npm run typecheck` | Typecheck every workspace |
| `npm run tokens` | Regenerate `tokens.css` from the TypeScript tokens |

Adminer, a database browser, is available on demand:

```bash
docker compose -f infra/docker-compose.yml --profile tools up -d adminer
```

It runs at http://localhost:8080.

## Testing on a physical phone

`localhost` inside the app points at the phone itself, not your computer. Find
your machine's LAN address and set it in `.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000
```

Restart the Expo server after changing it. Both devices must be on the same
Wi-Fi network.

## Deployment

**Web** goes to Vercel. Import the repository, leave the build settings alone
since `vercel.json` already describes them, and set `NEXT_PUBLIC_API_URL` to the
public API address.

**API** does not go to Vercel. It needs a long-lived process, a persistent disk,
and possibly FFmpeg, none of which fit a serverless function. Deploy the Docker
image to Railway, Render, Fly.io, or a VPS.

**Mobile** builds through EAS when you need an installable file:

```bash
npx eas-cli build --platform android --profile preview
```

## Conventions

Read `docs/ARCHITECTURE.md` before adding a feature. Two rules matter most:

1. Request and response shapes live in `packages/shared`. The server validates
   against them and the clients parse with them, so a contract change breaks the
   build instead of production.
2. Colours and spacing come from `packages/design-tokens`. No hex codes in
   components.
