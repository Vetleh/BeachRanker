# Repository Guidelines

## Project Structure & Module Organization

BeachRanker is an npm-workspaces TypeScript monorepo. Shared Elo rules live in `packages/domain/src`; the typed HTTP client is in `packages/api-client/src`. Apps are under `apps/`: `web` is Vite/React, `worker` is the Cloudflare Worker API and D1 migrations, and `mobile` is Expo/React Native. Keep shared rules in `packages/domain`. Web and worker tests are in each app’s `src/__tests__`; domain tests sit beside their module.

## Build, Test, and Development Commands

- `npm run dev:web` builds shared packages and starts the Worker and web app together.
- `npm run build` builds every deployable workspace.
- `npm test` builds shared packages, then runs all Vitest suites.
- `npm run typecheck` checks all app workspaces without emitting code.
- `npm run lint` and `npm run format:check` run ESLint and Prettier validation.
- `npm run mobile:dev` starts the Expo development client.

Run a focused web check with `npm run test --workspace=@beach-ranker/web`; use the same pattern for other workspaces. Use `npm run d1:migrate:local` before testing changes that depend on new D1 schema migrations.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow Prettier (two spaces and trailing commas) and ESLint’s React hook and TypeScript rules. Use `PascalCase` for components and types, `camelCase` for variables and functions, and descriptive lowercase filenames such as `ratingService.ts`. Keep locale keys grouped by feature. Name D1 migrations with a zero-padded sequence, for example `0011_feature_name.sql`.

## Testing Guidelines

Vitest is the test runner. Add or update tests whenever behavior changes, especially for domain rules, API routes, routing, and form validation. Use `*.test.ts` or `*.test.tsx`, match the nearby test style, and favor behavior-focused test names. Run the focused suite during development and `npm test` before handoff.

## Commit & Pull Request Guidelines

Recent history uses brief imperative summaries, such as `Paginate match history across clients` or `Fix pipeline`. Keep commits focused. Pull requests should explain the change, note schema or deployment implications, link an issue when available, include UI screenshots, and state verification commands.

## Configuration & Data Changes

Do not commit secrets. Worker configuration belongs in `wrangler.jsonc`; use Cloudflare-managed secrets for credentials. Treat D1 migrations as append-only: never rewrite an applied migration, and document any required migration or seed step in the pull request.
