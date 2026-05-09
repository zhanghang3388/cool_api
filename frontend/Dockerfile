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
# nginx:alpine is small (~20 MB). The outer nginx (in deploy/) handles TLS and
# reverse proxying; this inner instance just serves the static bundle.
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
