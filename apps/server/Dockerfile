# syntax=docker/dockerfile:1.7

# ---------- base ----------
FROM node:24-alpine AS base
ENV PNPM_HOME=/usr/local/bin
WORKDIR /repo

# ---------- dependencies ----------
# Copy only manifests first so the install layer is cached until a dependency
# actually changes.
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root --omit=optional

# ---------- build ----------
FROM deps AS build
COPY packages/shared packages/shared
COPY packages/design-tokens packages/design-tokens
COPY apps/server apps/server
RUN npm run build --workspace @app/server

# ---------- production dependencies ----------
FROM base AS prod-deps
COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root --omit=dev --omit=optional

# ---------- runtime ----------
FROM node:24-alpine AS runtime
# FFmpeg is here for the streaming variant of the project. Drop this line if
# the group settles on a topic that does not transcode media.
RUN apk add --no-cache ffmpeg tini && \
    addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs appuser

WORKDIR /repo
ENV NODE_ENV=production

COPY --from=prod-deps --chown=appuser:nodejs /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=appuser:nodejs /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build --chown=appuser:nodejs /repo/apps/server/dist ./apps/server/dist
COPY --chown=appuser:nodejs apps/server/package.json ./apps/server/
COPY --chown=appuser:nodejs packages ./packages

USER appuser
EXPOSE 4000

# tini reaps zombie processes — important once FFmpeg children are spawned.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]
