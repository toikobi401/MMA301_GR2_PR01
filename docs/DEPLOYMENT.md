# Deployment

The API runs as a Docker container and reaches the internet through a
Cloudflare Tunnel. The tunnel dials out to Cloudflare, so the host needs no
open inbound port, no port forwarding, and no public IP. That is what makes
running this from a home machine or a lab PC practical.

## Before you start

You need a domain on Cloudflare. Any registrar works, but the nameservers must
point at Cloudflare, which is the free plan's requirement.

## One-time setup

Install the tunnel client and sign in:

```bash
cloudflared tunnel login
cloudflared tunnel create poker
```

Route the hostname to the tunnel:

```bash
cloudflared tunnel route dns poker poker.yourdomain.com
```

Copy the tunnel token from the Cloudflare dashboard, under Zero Trust, then
Networks, then Tunnels. Put it in `.env`:

```
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
PUBLIC_URL=https://poker.yourdomain.com
CORS_ORIGINS=https://poker.yourdomain.com
```

In the dashboard, point the tunnel's public hostname at `http://server:4000`.
That is the container name on the compose network, not `localhost`.

## Running it

```bash
npm run docker:up
docker compose -f infra/docker-compose.yml --profile tunnel up -d cloudflared
```

Check it is live:

```bash
curl https://poker.yourdomain.com/health/ready
```

## WebSockets through the tunnel

Cloudflare proxies WebSocket upgrades on the free plan, so realtime play works
without extra configuration. Two things still matter.

**Idle connections get closed.** Cloudflare drops a connection with no traffic
for roughly 100 seconds. The client sends a ping every 25 seconds, defined as
`PING_INTERVAL_MS` in the shared realtime contract, which keeps the socket
open.

**Reconnection is normal, not exceptional.** Phones change networks, screens
lock, tunnels restart. The protocol handles this with a `resume` message
carrying the last sequence number the client saw, and the server answers with
a full table snapshot rather than trying to replay deltas. Build every screen
assuming the socket will drop at least once per session.

## Environment variables in deployment

Change these from their development defaults:

| Variable | Why |
|---|---|
| `JWT_ACCESS_SECRET` | Generate a fresh 32-byte value |
| `JWT_REFRESH_SECRET` | Generate a fresh 32-byte value, different from the access one |
| `POSTGRES_PASSWORD` | The development default is public in this repository |
| `CORS_ORIGINS` | Set to your domain; leaving it `*` lets any site call the API with a user's token |
| `LOG_LEVEL` | `info` rather than `debug` |
| `NODE_ENV` | `production`, so error responses stop including internals |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## The mobile client

The app reads `EXPO_PUBLIC_API_URL` at build time, so it must be set before
the build, not after:

```
EXPO_PUBLIC_API_URL=https://poker.yourdomain.com
```

Then build an installable file:

```bash
npx eas-cli build --platform android --profile preview
```

## The web client

The static export goes to Vercel. Set `EXPO_PUBLIC_API_URL` in the Vercel
project settings to the tunnel domain, and add that same Vercel domain to
`CORS_ORIGINS` on the server.

## What this setup does not give you

The tunnel is a single point of failure and the container runs on one machine.
If that machine sleeps, the game stops. That is acceptable for a course
project and a private game with friends. It is not a production topology, and
it is worth saying so plainly rather than implying otherwise.
