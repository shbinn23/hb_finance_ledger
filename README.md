# Whooing Finance Dashboard

## Canonical Project

This repository is the canonical version of the personal finance ledger project.

- Local path: `/Users/shbinn/dev/hb_finance_ledger`
- GitHub: `https://github.com/shbinn23/hb_finance_ledger`
- Default branch: `main`
- Runtime stack: Docker Compose project `hb_finance_ledger`
- Services:
  - Dashboard: `http://127.0.0.1:3000`
  - ML Engine: `http://127.0.0.1:8000`
  - PostgreSQL: `127.0.0.1:5432`
- Database: `ledger`
- Schema: `whooing`

Legacy finance repositories and old fortress/whooing migration resources were removed after this repository was promoted. Actual database data is stored in the local Docker volume `hb_finance_ledger_postgres_data` and is not committed to Git.

## Product Direction

- Whooing is the source of truth for ledger entries. `whooing.*` is a local read mirror, while `app.*` stores structured application metadata such as card benefit evidence.
- The Dashboard provides reporting, five ledger entry types, card benefit tracking, card bill repayment, and ML insights.
- Entry creation always uses the Whooing API. The ETL service refreshes the local mirror after writes on a best-effort basis.
- The unused Slack entry flow has been removed. The next import path is 편한가계부 Excel/Gmail import, Dashboard reconciliation, then confirmed Whooing submission.

## Database Targets

The project uses `ledger` as the PostgreSQL database name and `whooing` as the schema that mirrors the Whooing API structure.

Runtime database targets are split by execution mode:

| Mode | Host | Port | Database | Schema |
|---|---:|---:|---|---|
| Local dev | `localhost` | `5432` | `ledger` | `whooing` |
| Docker compose runtime | `db` | `5432` | `ledger` | `whooing` |

`fortress-db` is the legacy PostgreSQL container from the previous stack. It is not a Dashboard, API, ETL, or ML runtime dependency. It may be used only as a historical seed source when copying existing `whooing` schema data into the new compose database.

To seed the new compose database from the legacy source:

```bash
scripts/seed-compose-whooing-from-container.sh
```

The seed script reads from `fortress-db` with `pg_dump` and truncates/reloads only the target compose database's `whooing` schema tables.

## Dependency Boundaries

Runtime dependencies are intentionally split by service.

| Service | Dependency file | Notes |
|---|---|---|
| Dashboard | `dashboard/package-lock.json` | Next.js, React, Recharts, Tailwind, `pg`, and UI helpers only. No Python dependencies are installed in the dashboard image. |
| ETL | `requirements-etl.txt` | Whooing API sync/migration runtime and the long-running ETL HTTP service. |
| ML Engine | `ml-engine/requirements.txt` | FastAPI service, Chronos/Torch forecast runtime, pandas/numpy, scikit-learn, and database access. |
| PostgreSQL | `postgres:16-alpine` | Uses the compose volume and `init_whooing_db.sql`; no application dependencies. |
| Local Python checks | `requirements.txt` | Thin local helper file for ETL imports and unit tests. It is not used by Docker runtime services. |

`requirements-dashboard.txt` is not part of the canonical runtime. The dashboard is a Node/Next.js app and is built from `dashboard/package-lock.json`.

## ML Runtime URLs

When the Dashboard runs inside Docker Compose, it must call the ML Engine through the Compose service name:

```text
ML_ENGINE_URL=http://ml-engine:8000
```

This value is set directly in `docker-compose.yml` for the dashboard service. Do not let a host-only `.env` value such as `http://127.0.0.1:8000` or `http://localhost:8000` override the Dashboard container, because inside the container that points back to the Dashboard container and the `/ml` page will fall back to local linear projection.

When running the Dashboard directly on the host, start `ml-engine` with compose and set:

```bash
ML_ENGINE_URL=http://127.0.0.1:8000
```

## Dashboard Ledger Entry Runtime

Dashboard ledger entry submission uses the Whooing write API plus the ETL HTTP service. The ETL service exposes `POST /sync/whooing` for best-effort local DB sync after a Whooing entry is created.

Run the required local services:

```bash
docker compose --profile etl up -d --build db dashboard etl-service
```

When the Dashboard runs inside Docker Compose, it calls the ETL service through:

```text
ETL_SERVICE_URL=http://etl-service:8080
```

When running the Dashboard directly on the host, start `etl-service` with compose and set:

```bash
ETL_SERVICE_URL=http://127.0.0.1:8080
```

Required env names for Dashboard ledger entry:

- `WHOOING_APP_ID`
- `WHOOING_TOKEN`
- `WHOOING_SIGNATURE`
- `WHOOING_SECTION_ID`
- `ETL_SERVICE_URL`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

Do not commit secret values.

The Dashboard writes entries through:

```text
POST /api/ledger/entries
```

Account and category options are read from:

```text
GET /api/ledger/entry-options
```

Supported entry types are expense, income, transfer, card payment, and balance adjustment. `whooing.entries` remains a local mirror: entry creation always goes through the Whooing API, then the selected date is synced on a best-effort basis. If entry creation succeeds but sync is delayed, do not submit the same transaction again.

## Pyeonhan Ledger Import

`/imports` accepts a Pyeonhan Ledger `.xlsx` snapshot and compares its normalized transactions with
the current `whooing.entries` mirror and prior import snapshots. Results are separated into automatic
create candidates, duplicates, mapping gaps, update candidates, delete candidates, conflicts, and
review-required rows. Updates and deletes are never applied automatically. Discounted rows whose card
benefit rule cannot be identified also remain review-only.

Automatic creation requires both `migrations/004_create_ledger_write_operations.sql` and
`migrations/005_create_pyeonhan_import_tables.sql`. Without those migrations, `/imports` provides
read-only dry-run comparison only. Eligible creates use deterministic operation keys through the shared
ledger write service; Whooing remains the source of truth and local sync remains best-effort.

### Gmail watcher skeleton

Gmail OAuth and network polling are not implemented yet. The current adapter boundary creates a stable
identity from Gmail message and attachment IDs, then hands downloaded attachment bytes to the import
pipeline. A future runtime adapter will use:

- `PYEONHAN_GMAIL_QUERY`: Gmail query selecting Pyeonhan Ledger export messages
- `PYEONHAN_GMAIL_POLL_INTERVAL_MS`: polling interval

Before enabling polling, configure Google OAuth with the minimum `gmail.readonly` scope, durable
processed-attachment identity storage, attachment size limits, and retry policy. Never commit Gmail
credentials or tokens.

### Import migration verification

Apply migrations `004` and `005` only after reviewing the target database. After applying them,
verify the created objects, columns, and constraints with read-only queries:

```sql
select to_regclass('app.ledger_write_operations'),
       to_regclass('app.import_batches'),
       to_regclass('app.import_rows'),
       to_regclass('app.import_mappings'),
       to_regclass('app.import_write_operations');

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'app'
  and table_name in (
    'ledger_write_operations',
    'import_batches',
    'import_rows',
    'import_mappings',
    'import_write_operations'
  )
order by table_name, ordinal_position;

select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint
where connamespace = 'app'::regnamespace
order by conrelid::regclass::text, conname;
```

Both migrations are transactional. If an apply fails, PostgreSQL rolls back that migration. Before
production data exists, a manual rollback can drop the import tables in dependency order and then
drop `app.ledger_write_operations`; after imports exist, back up the `app` schema and use a corrective
migration instead of dropping tables.

```sql
begin;
drop table if exists app.import_write_operations;
drop table if exists app.import_rows;
drop table if exists app.import_mappings;
drop table if exists app.import_batches;
drop table if exists app.ledger_write_operations;
commit;
```
