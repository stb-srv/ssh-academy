# syntax=docker/dockerfile:1.7
# Mehrstufiges Image für die SSH-Academy (Next.js im Standalone-Modus)

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# --- Abhängigkeiten ---------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/gateway/package.json apps/gateway/
COPY packages/db/package.json packages/db/
COPY packages/ssh/package.json packages/ssh/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build -----------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @ssh-academy/web build && pnpm --filter @ssh-academy/gateway build

# --- Migrationen (einmalig vor dem Start) ----------------------------------
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY packages/db ./packages/db
USER node
CMD ["node", "packages/db/src/migrate.ts"]

# --- SSH-Gateway (eine gebündelte Datei, keine node_modules nötig) ---------
FROM node:22-alpine AS gateway
ENV NODE_ENV=production GATEWAY_PORT=4000 GATEWAY_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/gateway/dist ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "--enable-source-maps", "server.mjs"]

# --- Laufzeit-Image --------------------------------------------------------
FROM node:22-alpine AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
