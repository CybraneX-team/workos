# Build from the monorepo root:
# docker build -f apps/erpnext-control-plane/Dockerfile -t erpnext-control-plane .
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/erpnext-contracts/package.json ./packages/erpnext-contracts/package.json
COPY apps/erpnext-control-plane/package.json ./apps/erpnext-control-plane/package.json
RUN pnpm install --frozen-lockfile

COPY packages/erpnext-contracts ./packages/erpnext-contracts
COPY apps/erpnext-control-plane/tsconfig.json ./apps/erpnext-control-plane/tsconfig.json
COPY apps/erpnext-control-plane/src ./apps/erpnext-control-plane/src
COPY apps/erpnext-control-plane/scripts ./apps/erpnext-control-plane/scripts
COPY apps/erpnext-control-plane/db ./apps/erpnext-control-plane/db
RUN pnpm --filter @cybranex/erpnext-contracts build
RUN pnpm --filter erpnext-control-plane build
RUN pnpm --filter erpnext-control-plane deploy --prod /out/control-plane

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /out/control-plane/node_modules ./node_modules
COPY --from=builder /out/control-plane/package.json ./package.json
COPY --from=builder /app/apps/erpnext-control-plane/dist ./dist
COPY --from=builder /app/apps/erpnext-control-plane/db ./db
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:8090/healthz || exit 1
CMD ["node", "dist/src/server.js"]
