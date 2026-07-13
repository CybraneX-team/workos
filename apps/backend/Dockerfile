# Build context for this Dockerfile is the MONOREPO ROOT (not apps/backend),
# since pnpm needs the root pnpm-lock.yaml/pnpm-workspace.yaml and every
# workspace member's package.json to resolve `workspace:*` deps correctly.
# Build from the repo root, e.g.:
#   docker build -f apps/backend/Dockerfile -t backend .

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/permissions/package.json ./packages/permissions/package.json
COPY packages/metrics/package.json ./packages/metrics/package.json
COPY packages/erpnext-contracts/package.json ./packages/erpnext-contracts/package.json
COPY apps/backend/package.json ./apps/backend/package.json

RUN pnpm install --frozen-lockfile

# Now copy source and build only what's needed.
COPY packages/shared-types ./packages/shared-types
COPY packages/permissions ./packages/permissions
COPY packages/metrics ./packages/metrics
COPY packages/erpnext-contracts ./packages/erpnext-contracts
COPY apps/backend/tsconfig.json ./apps/backend/tsconfig.json
COPY apps/backend/src ./apps/backend/src

RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @cybranex/shared-types build
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @cybranex/permissions build
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @cybranex/metrics build
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @cybranex/erpnext-contracts build
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter backend build

# Produce a pruned, deploy-only node_modules for the backend + its
# workspace deps (no devDependencies, no other workspace members' extras).
RUN pnpm --filter backend deploy --prod /out/backend

# ── Stage 2: production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /out/backend/node_modules ./node_modules
COPY --from=builder /out/backend/package.json ./package.json
COPY --from=builder /app/apps/backend/dist ./dist
COPY apps/backend/scripts ./scripts

# Own all files by the non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "dist/server.js"]
