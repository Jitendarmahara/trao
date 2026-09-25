# syntax=docker/dockerfile:1
#
# One image for the whole monorepo. It is used by BOTH runtime services:
#   • backend  → runs the Express API with tsx (apps/backend)
#   • frontend → serves the built Next.js app (apps/web)
# packages/core is shared source (consumed as TypeScript via tsx, and as
# type-only imports by the web build), so there is no separate core build.
#
# Build once, run twice — see docker-compose.yml.

# ── Stage 1: install ALL workspace deps (incl. dev: tsx, next, tailwind, tsc) ──
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Only the manifests first, so this layer caches until dependencies change.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/backend/package.json apps/backend/
RUN npm ci

# ── Stage 2: runtime image (deps + source + a production Next build) ──
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# The frontend's /api → backend proxy target is compiled into the Next build
# (Next evaluates next.config `rewrites()` at build time, not at runtime). Inside
# the Compose network the backend is always reachable at http://backend:4000.
ARG BACKEND_URL=http://backend:4000

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js frontend for production (bakes in the proxy target above).
ENV BACKEND_URL=$BACKEND_URL
RUN npm run -w @interview-prep-kit/web build

# Everything below runs as production (secure cookies, next start, etc.).
ENV NODE_ENV=production
ENV PORT=4000

# 3000 = Next frontend, 4000 = Express API. The command is set per-service
# in docker-compose.yml.
EXPOSE 3000 4000
