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

## Mobile local development

The mobile app uses an Expo development build. The QR code from `npm run ios:local` is not an Expo Go QR code, so install the development build on the target device first:

```sh
npm run ios:dev-build:local
```

The local iOS build script enables Xcode provisioning updates so Xcode can register the connected iPhone and create/download the development provisioning profile. It defaults to the current development team and device; override them when needed:

```sh
APPLE_TEAM_ID=YOURTEAMID IOS_DEVICE_ID=YOUR_DEVICE_UDID npm run ios:dev-build:local
```

On the first physical-device install, iOS may install the app but refuse to launch it until the development profile is trusted. On the iPhone, open `Settings > General > VPN & Device Management`, trust the Apple Development profile for the Apple ID/team, then rerun `npm run ios:dev-build:local`.

If you select a simulator, the build is installed only on that simulator. To use the QR code on a physical iPhone, connect that iPhone and select it when installing the development build.

After the development build is installed, start the local Worker and Expo dev server:

```sh
npm run ios:local
```

Scan the QR code with the installed BeachRanker development app or the iOS camera. If iOS says "no usable data found", the development build is not installed for this project yet, or the installed build is stale and needs to be rebuilt.

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
