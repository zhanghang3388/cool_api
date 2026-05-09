#!/usr/bin/env bash
# First-time Let's Encrypt certificate issuance for nginx.
#
# Why this script exists: the real nginx config references
# /etc/letsencrypt/live/<domain>/fullchain.pem, but on a fresh server those
# files don't exist yet — nginx would refuse to start, so certbot can't do
# the HTTP-01 challenge through it. We break the cycle by running nginx in
# "bootstrap" mode (plain :80 only), issuing the certs via certbot's webroot
# plugin, then swapping back to the full config.
#
# Run this ONCE after editing .env. Afterwards `docker compose up -d` is all
# you need; renewals happen automatically via the `certbot` service.

set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
    echo "[error] .env not found. Copy .env.example to .env and edit it first." >&2
    exit 1
fi
# shellcheck disable=SC1091
source .env

: "${WEB_DOMAIN:?WEB_DOMAIN must be set in .env}"
: "${API_DOMAIN:?API_DOMAIN must be set in .env}"
: "${ACME_EMAIL:?ACME_EMAIL must be set in .env}"

echo "[info] Issuing certificates for ${WEB_DOMAIN} and ${API_DOMAIN}"
echo "[info] Make sure both domains already resolve to this server (A records)."
read -r -p "Continue? [y/N] " ans
[[ "${ans,,}" == "y" ]] || { echo "aborted"; exit 0; }

# Fresh bootstrap nginx: only serves ACME challenge on :80.
echo "[step] starting bootstrap nginx on :80"
docker run --rm -d \
    --name aethergate-bootstrap-nginx \
    -p 80:80 \
    -v "$(pwd)/nginx-bootstrap.conf:/etc/nginx/nginx.conf:ro" \
    -v aethergate_certbot_webroot:/var/www/certbot \
    nginx:1.27-alpine >/dev/null

cleanup() {
    docker rm -f aethergate-bootstrap-nginx >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 2  # give nginx a moment to come up

# Ask Let's Encrypt for one cert covering both domains via SAN. Cheaper than
# two separate certs and survives either domain failing the challenge less
# gracefully, so emit two separate ones instead.
for domain in "${WEB_DOMAIN}" "${API_DOMAIN}"; do
    echo "[step] requesting cert for ${domain}"
    docker run --rm \
        -v aethergate_letsencrypt:/etc/letsencrypt \
        -v aethergate_certbot_webroot:/var/www/certbot \
        certbot/certbot:latest \
        certonly --webroot \
            -w /var/www/certbot \
            -d "${domain}" \
            --email "${ACME_EMAIL}" \
            --agree-tos --no-eff-email \
            --non-interactive
done

cleanup
trap - EXIT

echo
echo "[done] Certificates issued. Now run: docker compose up -d --build"
