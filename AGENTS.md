# AGENTS.md

## Commands

```
pnpm dev              # wrangler dev (local worker)
pnpm typecheck        # tsc --noEmit
pnpm generate         # drizzle-kit generate (create migration files)
pnpm migrate:local    # apply migrations to local D1
pnpm migrate:remote   # apply migrations to remote D1
pnpm deploy           # wrangler deploy
```

There is no test runner, linter, or formatter configured.

## Stack

- **Runtime**: Cloudflare Workers (wrangler v4)
- **Framework**: Hono v4 (JSX mode — `jsxImportSource: "hono/jsx"`, but no JSX files exist yet)
- **DB**: D1 (SQLite) via Drizzle ORM v0.39 (`drizzle-orm/d1`)
- **Storage**: R2 (`BUCKET` binding)
- **Queue**: Cloudflare Queues (`PUBLISH_QUEUE` binding)
- **Validation**: Zod + `@hono/zod-validator`
- **Package manager**: pnpm (workspace, but `pnpm-workspace.yaml` is a placeholder — needs `allowBuilds` configured)

## Architecture

Entrypoint: `src/index.ts` — creates a Hono app inside `fetch()`, mounts a sub-app at `/api` with auth middleware.

**Module layout** (each under `src/app/<name>/`):
- `*.routes.ts` — defines Hono router
- `*.service.ts` — business logic, takes `DbClient` (and sometimes `Env`) in constructor
- `src/app/platform/` — per-platform publish implementations (only B站 currently)

**Key types**: `Env` in `src/env.ts` — Cloudflare bindings + `JWT_SECRET` + `INTERNAL_TOKEN`.

## Auth

Custom JWT (HS256) using Web Crypto API, no JWT library. Two auth methods:
1. `Authorization: Bearer <token>` — user JWT (7-day expiry)
2. `x-api-key: <key>` — API key (SHA-1 hashed in `api_keys` table)
3. `Authorization: Internal <token>` — internal service-to-service, bypasses JWT, sets `userId='internal'`

Password hashing: custom HMAC-SHA256 with per-user salt (no bcrypt/argon2).

## Database

- Schema: `src/db/schema.ts` (tables: `users`, `api_keys`, `accounts`, `publish_records`, `credit_logs`)
- Migrations: `drizzle-kit generate` writes to `./migrations/`
- Apply: `wrangler d1 migrations apply mvp-db --local` or `--remote`
- `drizzle.config.ts` needs env vars: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_ID`, `CLOUDFLARE_API_TOKEN`

## Publish flow

1. Client posts to `POST /api/publish` → creates a `publish_records` row
2. If publish time is within 30s (`IMMEDIATE_PUBLISH_TOLERANCE_MS`), enqueues to `PUBLISH_QUEUE` immediately
3. Consumer (`src/app/publish/publish.consumer.ts`) picks up batch, calls platform-specific publisher
4. Retries with exponential backoff (`2^(retry+1) * 5s`) up to `maxRetries` (default 3)

## Conventions

- Timestamps are Unix milliseconds (`Date.now()`)
- IDs are UUIDs from `crypto.randomUUID()`
- API responses use `{ code: number, data: T | null, message?: string }` shape
- Services return `Response` objects directly (not data), using `jsonResponse`/`errorResponse`/`paginatedResponse` from `src/shared/utils.ts`
- `src/shared/schemas.ts` holds all Zod validation schemas
- Only B站 is implemented as a publish platform; other platforms in `createAccountSchema.platform` are declared but have no publisher in `platformPublishers`
