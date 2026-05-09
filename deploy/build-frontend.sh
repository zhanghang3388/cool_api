#!/usr/bin/env bash
# Build the frontend SPA and deploy it to /var/www/aethergate so host nginx
# can serve it as a static root.
#
# Why the API base is a build arg: Vite inlines `import.meta.env.VITE_API_BASE`
# at build time, so the bundle needs to be regenerated whenever the API domain
# changes.

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f deploy/.env ]]; then
    echo "[error] deploy/.env not found. Copy deploy/.env.example to .env first." >&2
    exit 1
fi
# shellcheck disable=SC1091
source deploy/.env

: "${API_DOMAIN:?API_DOMAIN must be set in .env}"
: "${WEB_ROOT:=/var/www/aethergate}"

cd frontend

# Install deps if node_modules is missing. `pnpm install --frozen-lockfile`
# is fast when everything is already in place.
if [[ ! -d node_modules ]]; then
    pnpm install --frozen-lockfile
fi

echo "[step] building with VITE_API_BASE=https://${API_DOMAIN}"
VITE_API_BASE="https://${API_DOMAIN}" pnpm build

# `sudo` only when we don't already own the target (so devs can point
# WEB_ROOT at something under their home dir for testing).
echo "[step] syncing dist/ → ${WEB_ROOT}"
if [[ -w "$(dirname "${WEB_ROOT}")" ]] || [[ "$(id -u)" == "0" ]]; then
    mkdir -p "${WEB_ROOT}"
    rsync -av --delete dist/ "${WEB_ROOT}/"
else
    sudo mkdir -p "${WEB_ROOT}"
    sudo rsync -av --delete dist/ "${WEB_ROOT}/"
fi

echo "[done] frontend deployed to ${WEB_ROOT}"
echo "      reload nginx if the config also changed: sudo systemctl reload nginx"
