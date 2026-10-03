# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

# Prune the monorepo down to the API and its workspace dependencies.
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2 prune @cockpit/api --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@cockpit/api

# The API is fully bundled — the runtime image needs no node_modules.
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/packages/db/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Release first (migrations + owner account), then serve. `exec` hands signals to the server.
CMD ["sh", "-c", "node --enable-source-maps dist/release.js && exec node --enable-source-maps dist/index.js"]
