#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_PORT="${WORKER_PORT:-8787}"
EXPO_HOST="${EXPO_HOST:-lan}"

cd "$ROOT_DIR"

log() {
  printf '\n%s\n' "$1"
}

fail() {
  printf '\nError: %s\n' "$1" >&2
  exit 1
}

local_ip() {
  if [ -n "${API_HOST:-}" ]; then
    printf '%s' "$API_HOST"
    return
  fi

  for interface in en0 en1; do
    ip="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      printf '%s' "$ip"
      return
    fi
  done

  ip="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }')"
  if [ -n "$ip" ]; then
    printf '%s' "$ip"
    return
  fi

  fail "Could not determine a LAN IP. Set API_HOST manually."
}

cleanup() {
  if [ -n "${WORKER_PID:-}" ] && kill -0 "$WORKER_PID" >/dev/null 2>&1; then
    kill "$WORKER_PID" >/dev/null 2>&1 || true
    wait "$WORKER_PID" 2>/dev/null || true
  fi
  if [ -n "${SEED_SQL:-}" ] && [ -f "$SEED_SQL" ]; then
    rm -f "$SEED_SQL"
  fi
}

command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v npx >/dev/null 2>&1 || fail "npx is not installed."
command -v lsof >/dev/null 2>&1 || fail "lsof is not available. This script targets macOS."
command -v ipconfig >/dev/null 2>&1 || fail "ipconfig is not available. This script targets macOS."
npm exec -w @beach-ranker/mobile -- expo --version >/dev/null 2>&1 ||
  fail "Expo is not installed for apps/mobile. Run npm install, then retry."

trap cleanup EXIT INT TERM

HOST_IP="$(local_ip)"
API_URL="http://${HOST_IP}:${WORKER_PORT}"

if lsof -nP -iTCP:"$WORKER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -nP -iTCP:"$WORKER_PORT" -sTCP:LISTEN >&2 || true
  fail "Port ${WORKER_PORT} is already in use."
fi

log "Building web assets for the Worker..."
npm run build -w packages/domain
npm run build -w packages/api-client
npm run build -w apps/web

log "Applying local D1 migrations..."
npm run d1:migrate:local

log "Seeding local D1 admin user..."
SEED_SQL="$(mktemp)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}" \
  ADMIN_NAME="${ADMIN_NAME:-Beach Admin}" \
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-change-me}" \
  npm run --silent d1:seed:sql > "$SEED_SQL"
npx wrangler d1 execute beach-ranker --local --file "$SEED_SQL"

log "Starting Cloudflare Worker on ${API_URL}..."
JWT_SECRET="${JWT_SECRET:-development-only-local-jwt-secret}" \
  npx wrangler dev --ip 0.0.0.0 --port "$WORKER_PORT" > /tmp/beach-ranker-worker.log 2>&1 &
WORKER_PID="$!"

log "Waiting for Worker health..."
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "${API_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$WORKER_PID" >/dev/null 2>&1; then
    cat /tmp/beach-ranker-worker.log >&2 || true
    fail "Worker exited before becoming ready."
  fi
  sleep 1
done

if ! curl -fsS -o /dev/null "${API_URL}/api/health" >/dev/null 2>&1; then
  cat /tmp/beach-ranker-worker.log >&2 || true
  fail "Worker did not become healthy in time."
fi

log "Worker logs: /tmp/beach-ranker-worker.log"
log "Starting Expo dev client with EXPO_PUBLIC_API_URL=${API_URL}"
log "For a physical iPhone, use the installed BeachRanker development build on the same Wi-Fi network."

EXPO_PUBLIC_API_URL="$API_URL" npm exec -w @beach-ranker/mobile -- expo start --dev-client --host "$EXPO_HOST" --clear
