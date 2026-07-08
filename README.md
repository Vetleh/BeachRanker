# BeachRanker

A private full-stack app for ranking beach volleyball doubles matches with individual Elo ratings.

## Stack

- React + Vite frontend
- Node.js + Express backend
- Postgres + Prisma persistence
- Cookie-based authentication
- Cloudflare Worker + D1 deployment target

## Local setup

Install dependencies with:

```sh
npm install
```

Then run the full local stack with Docker:

```sh
npm run dev:local
```

The script creates `apps/api/.env` if needed, starts Postgres with Docker Compose, runs Prisma migrations, seeds the admin user, and starts both dev servers. Make sure Docker is running before starting the local stack.

Manual setup:

1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Start Postgres with `docker compose up -d`.
3. Run migrations and seed an admin:

```sh
npm run prisma:migrate
npm run seed
```

4. Start both apps:

```sh
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to `http://localhost:4000`.

## Cloudflare deployment

The Cloudflare-native deployment uses `apps/worker` as the production runtime. It serves the built Vite app from `apps/web/dist` and handles `/api/*` requests with Cloudflare Workers + D1.

One-time Cloudflare setup:

1. Create a D1 database:

```sh
npx wrangler d1 create beach-ranker
```

2. Copy the returned database ID into `wrangler.jsonc` under `d1_databases[0].database_id`.
3. Set the production JWT secret:

```sh
npx wrangler secret put JWT_SECRET
```

4. Apply D1 migrations:

```sh
npm run d1:migrate:remote
```

5. Seed the first admin user:

```sh
ADMIN_EMAIL="admin@example.com" ADMIN_NAME="Beach Admin" ADMIN_PASSWORD="change-me" npm run d1:seed:sql > /tmp/beach-ranker-admin.sql
npx wrangler d1 execute beach-ranker --remote --file /tmp/beach-ranker-admin.sql
```

GitHub CI/CD:

- Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Pushes to `main` run tests, typecheck, build, apply D1 migrations, and deploy with Wrangler.
- Pull requests run the same verification steps without deploying.

Useful scripts:

```sh
npm run worker:dev
npm run worker:dry-run
npm run worker:types
npm run worker:deploy
npm run d1:migrate:local
npm run d1:migrate:remote
npm run d1:seed:sql
```
