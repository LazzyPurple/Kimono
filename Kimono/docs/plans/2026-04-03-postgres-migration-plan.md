# Migration MySQL -> PostgreSQL (Kimono)

Date: 2026-04-03
Status: Prepared
Scope: Runtime DB layer + bootstrap + startup jobs + packaging

## Goal

Migrate Kimono from MySQL (`mysql2`) to PostgreSQL (`postgres`) on the current cleaned codebase, without changing public API contracts.

Important context:
- Prisma and local SQLite are already removed.
- The app is now MySQL-only in runtime.
- This plan is adapted to the current repo, not to the older migration note.

## Current state of the repo

### Runtime files still tied to MySQL

- `lib/db.ts`
- `lib/db/index.ts`
- `lib/db/repository.ts`
- `lib/jobs/creator-sync.ts`
- `lib/server/creator-sync-runtime.cjs`
- `lib/server/startup-db-maintenance.cjs`
- `lib/server/startup.cjs`
- `deploy/o2switch-init.sql`
- `package.json`
- `scripts/o2switch-package-config.mjs`
- `DEPLOY.md`

### MySQL-specific patterns still present

- `mysql2/promise`
- `DATABASE_URL=mysql://...`
- `Connection` from `mysql2/promise`
- `?` placeholders
- backticks `` `Table` ``
- `ON DUPLICATE KEY UPDATE`
- `INFORMATION_SCHEMA.COLUMNS ... DATABASE()`
- boolean coercion through `1/0`
- startup/runtime CJS scripts creating direct MySQL connections

### Key repository facts

- `lib/db/repository.ts` is the main migration surface.
- It still contains all upserts and most SQL dialect assumptions.
- The startup CJS files also contain direct SQL and driver logic and must be migrated too.
- Tests currently assert MySQL in a few places and must be updated at the end.

## Migration strategy

Use a 4-phase migration.

### Phase A - Introduce PostgreSQL driver compatibility layer

Replace `mysql2` with `postgres` in:
- `package.json`
- `package-lock.json`
- `scripts/o2switch-package-config.mjs`

Target dependency changes:
- add `postgres`
- remove `mysql2`

Replace `lib/db.ts` with a PostgreSQL client wrapper that exports:
- `sql`
- `query()`
- `execute()`

Recommended env model:
- keep `DATABASE_URL` as the primary production variable if possible
- optionally support split vars:
  - `DB_HOST`
  - `DB_PORT`
  - `DB_NAME`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_SSL`

Recommendation:
- support both, but prefer `DATABASE_URL` for minimal operational churn.
- this avoids rewriting all startup diagnostics that currently reason about `DATABASE_URL`.

### Phase B - Migrate the repository SQL dialect

Primary file:
- `lib/db/repository.ts`

Required transformations:

1. Remove `Connection` import from `mysql2/promise`
2. Replace the internal query abstraction to use the PostgreSQL wrapper from `lib/db.ts`
3. Replace `?` placeholders with `$1`, `$2`, ...
4. Replace backticks with PostgreSQL-safe identifiers
5. Replace every `ON DUPLICATE KEY UPDATE` with `ON CONFLICT DO UPDATE`
6. Replace `VALUES(col)` with `EXCLUDED.col`
7. Replace the MySQL `hasColumn()` logic with PostgreSQL `information_schema.columns`
8. Remove `getRepositoryDialect(): "mysql" | "sqlite"` and make it PostgreSQL-only

Conflict targets by table:
- `Creator`: `(site, service, "creatorId")`
- `Post`: `(site, service, "creatorId", "postId")`
- `MediaAsset`: `(site, "sourceFingerprint")`
- `MediaSource`: `(site, "sourceFingerprint")`
- `FavoriteChronology`: `(kind, site, service, "creatorId", "postId")`
- `FavoriteCache`: `(kind, site)`
- `DiscoveryCache`: `(site)`
- `DiscoveryBlock`: `(site, service, "creatorId")`
- `KimonoSession`: `(site)`

Special care:
- `FavoriteChronology.favedSeq` fallback logic must stay intact.
- `indexed` and `updated` columns are still numeric in the current schema and should remain so during the DB migration.
- `BOOLEAN` writes should become real booleans where possible.

### Phase C - Migrate startup/runtime scripts

These files still create or reason about MySQL directly:
- `lib/jobs/creator-sync.ts`
- `lib/server/creator-sync-runtime.cjs`
- `lib/server/startup-db-maintenance.cjs`
- `lib/server/startup.cjs`

Tasks:
- remove `mysql2/promise`
- stop creating MySQL connections directly
- either:
  - move startup DB logic to use `lib/db.ts`, or
  - introduce a tiny PostgreSQL CJS helper for startup scripts

Recommendation:
- keep the startup scripts in CJS for now, but replace direct MySQL connection code with `postgres` client logic.
- do not refactor startup architecture and DB dialect at the same time.

### Phase D - Convert bootstrap SQL and runtime docs/tests

Convert:
- `deploy/o2switch-init.sql` -> PostgreSQL
- create a new file: `deploy/o2switch-init-pg.sql`

Recommended SQL conversions:
- `VARCHAR(191)` -> `TEXT` unless strict sizing is required
- `LONGTEXT` -> `TEXT`
- `DATETIME(3)` -> `TIMESTAMPTZ`
- `BOOLEAN DEFAULT 0` -> `BOOLEAN DEFAULT FALSE`
- table/index definitions split into PostgreSQL-style `CREATE INDEX`
- remove `ENGINE=InnoDB`, `CHARSET`, `COLLATE`

Keep table names stable if possible to reduce code churn.

Then update:
- `DEPLOY.md`
- packaging tests
- startup tests
- server health tests
- any MySQL-specific runtime/package assertions

## Recommended execution order

1. Add `postgres`, remove `mysql2`
2. Rewrite `lib/db.ts`
3. Rewrite `lib/db/index.ts`
4. Migrate `lib/db/repository.ts`
5. Migrate `lib/jobs/creator-sync.ts`
6. Migrate `lib/server/*.cjs` startup scripts
7. Add `deploy/o2switch-init-pg.sql`
8. Update packaging/docs/tests
9. Run full validation

## Validation checklist

### Codebase checks

```powershell
rg -n "mysql2|mysql\.createPool|ON DUPLICATE KEY|DATABASE\(\)|INFORMATION_SCHEMA\.COLUMNS" C:\Users\lilsm\Workspace\Kimono\Kimono -g '!node_modules'
```

Expected after migration:
- no runtime usage of `mysql2`
- no `ON DUPLICATE KEY`
- no MySQL-only column detection

### Build/test checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run build:o2switch-package
```

### Runtime/package checks

- runtime package includes `postgres`
- runtime package no longer includes `mysql2`
- `node server.js` works from extracted artifact
- startup diagnostics report PostgreSQL DB readiness

## Biggest risks

### 1. Repository upserts
`lib/db/repository.ts` is the highest-risk file because almost every write path depends on MySQL upsert syntax.

### 2. Startup CJS scripts
The startup scripts are easy to forget, and they still directly create MySQL connections.

### 3. Environment model drift
Current code and tests still revolve around `DATABASE_URL`. If we switch fully to split env vars, we must also rewrite diagnostics and deployment docs. Keeping `DATABASE_URL` support during the first PostgreSQL pass is safer.

## Recommendation

Do the PostgreSQL migration as a dedicated implementation lot on top of the current cleaned branch.

The safest next implementation step is:
- migrate `lib/db.ts`
- migrate `lib/db/index.ts`
- then migrate `lib/db/repository.ts`

Only after that should we touch the startup CJS scripts.
