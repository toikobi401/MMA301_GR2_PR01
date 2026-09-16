# MMA301 GR2 PR01

Cross-platform application built with Expo (React Native). iOS, Android, and
web all render from a single `src/app` directory, backed by a Fastify API.

The project topic is not fixed yet. Everything here is topic-agnostic
infrastructure that both candidate ideas (media streaming / realtime multiplayer)
need anyway.

## Layout

```
apps/
  client/     Expo SDK 57 — iOS, Android, and web from one source tree
    src/app/        File-based routes (Expo Router)
    src/components/ Shared UI, renders on every platform
    src/features/   Feature modules
    src/theme/      Token bindings
  server/     Fastify API — runs in Docker
packages/
  shared/         API contracts, Zod schemas, HTTP client
  design-tokens/  Colours, spacing, typography — one source for all platforms
infra/
  docker-compose.yml   Postgres + Redis + API
```

There is no separate web app. Expo Router compiles the same screens to a
native stack on device and to browser routes on web, so a screen written once
runs in three places.

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
npm run dev     # Expo dev server — press w for web, scan the QR for a phone
npm run web     # web only, opens the browser directly
```

Every platform shows the same service-status panel. Green means the whole
chain works end to end.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Expo dev server for all platforms |
| `npm run web` | Open the app in a browser |
| `npm run android` / `npm run ios` | Launch on a device or simulator |
| `npm run build:web` | Static web export into `apps/client/dist` |
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

**Web** goes to Vercel as a static export. Import the repository, leave the
build settings alone since `vercel.json` already describes them, and set
`EXPO_PUBLIC_API_URL` to the public API address.

Static export means there is no server-side rendering. Pages are pre-rendered
at build time and fetch live data in the browser, which suits an app whose
content sits behind a login anyway.

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
