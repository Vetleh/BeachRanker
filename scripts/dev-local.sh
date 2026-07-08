#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV="$ROOT_DIR/apps/api/.env"
API_ENV_EXAMPLE="$ROOT_DIR/apps/api/.env.example"

cd "$ROOT_DIR"

log() {
  printf '\n%s\n' "$1"
}

fail() {
  printf '\nError: %s\n' "$1" >&2
  exit 1
}

docker_compose() {
  docker compose "$@"
}

command -v docker >/dev/null 2>&1 || fail "docker is not installed."
command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v node >/dev/null 2>&1 || fail "node is not installed."
docker compose version >/dev/null 2>&1 || fail "docker compose is not available. Install the Docker Compose CLI plugin."

if ! docker info >/dev/null 2>&1; then
  fail "Docker is not running or is not reachable. Start Docker and try again."
fi

if [ ! -f "$API_ENV" ]; then
  cp "$API_ENV_EXAMPLE" "$API_ENV"
  log "Created apps/api/.env from apps/api/.env.example"
fi

log "Starting Postgres with Docker Compose..."
docker_compose up -d postgres

log "Waiting for Postgres..."
for _ in $(seq 1 40); do
  if docker exec beachranker-postgres pg_isready -U beachranker -d beachranker >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec beachranker-postgres pg_isready -U beachranker -d beachranker >/dev/null 2>&1; then
  fail "Postgres did not become ready in time."
fi

log "Running Prisma migration and seed..."
npm run prisma:migrate
npm run seed

log "Starting BeachRanker..."
npm run dev
