# syntax=docker/dockerfile:1.7

# ---- build ----
FROM node:20-bookworm-slim AS builder
WORKDIR /build

# pnpm via corepack keeps the version pinned to what package.json declares.
RUN corepack enable \
    && corepack prepare pnpm@latest --activate

# Install deps first for better caching.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build-time API base lets the bundle talk to a separate API domain. Passed in
# from docker compose (VITE_API_BASE) so `pnpm build` embeds it as a literal.
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}

COPY . .
RUN pnpm build

# ---- serve ----
# Caddy is tiny (~40 MB), gzip/zstd by default, and lets us add cache headers
# with a one-liner. Overkill-free compared to nginx.
FROM caddy:2.8-alpine AS runtime
COPY --from=builder /build/dist /usr/share/caddy
COPY Caddyfile.frontend /etc/caddy/Caddyfile
EXPOSE 80
