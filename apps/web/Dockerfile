FROM node:24-slim AS builder
RUN npm install -g pnpm
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
# prisma generate resolves DATABASE_URL at install time; the real value comes from compose at runtime
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
# next.config evaluates rewrites() at build time and bakes them into
# routes-manifest.json, so the /api/* BFF proxy target must exist NOW — a
# runtime-only value leaves the proxy empty and every /api/* 404s.
ARG INTERNAL_SERVER_URL=http://server:3000
ENV INTERNAL_SERVER_URL=$INTERNAL_SERVER_URL
RUN cd apps/web && pnpm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

ENV HOSTNAME=0.0.0.0
ENV PORT=3001
EXPOSE 3001

CMD ["node", "apps/web/server.js"]
