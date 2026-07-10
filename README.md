# BeachRanker

BeachRanker is a private full-stack app for ranking beach volleyball doubles matches with individual Elo ratings.

## Stack

- React + Vite web client
- Expo React Native mobile client
- Cloudflare Worker API
- Cloudflare D1 persistence
- Shared domain rules and API client packages

## Local development

Install dependencies:

```sh
npm install
```

Start the web client and Worker together:

```sh
npm run dev:web
```

The web client runs on `http://localhost:5173`; the Worker runs on `http://localhost:8787`.

For a mobile development build using a LAN address:

```sh
npm run ios:dev-build:local
npm run ios:local
```

Override the detected host/device when necessary:

```sh
API_HOST=192.168.1.42 IOS_DEVICE_ID=YOUR_DEVICE_UDID npm run ios:local
```

The local iOS script passes temporary environment variables to each process and does not rewrite project environment files.

## Checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

## Cloudflare setup

Create a D1 database and set its ID in `wrangler.jsonc` or the deployment environment:

```sh
npx wrangler d1 create beach-ranker
npx wrangler secret put JWT_SECRET
```

Apply local migrations with:

```sh
npm run d1:migrate:local
```

Production migrations are intentionally separate from deployment. Apply them only through the approved production migration workflow:

```sh
npm run d1:migrate:remote
```

Deploy the Worker and built web assets with:

```sh
npm run worker:deploy
```

Seed the first admin user by generating SQL and executing it against the intended database:

```sh
ADMIN_EMAIL="admin@example.com" ADMIN_NAME="Beach Admin" ADMIN_PASSWORD="change-me" \
  npm run d1:seed:sql > /tmp/beach-ranker-admin.sql
npx wrangler d1 execute beach-ranker --remote --file /tmp/beach-ranker-admin.sql
```
