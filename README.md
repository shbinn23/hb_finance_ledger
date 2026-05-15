# Whooing Finance Dashboard

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
| ETL | `requirements-etl.txt` | Whooing API sync/migration runtime: `requests`, `python-dotenv`, `psycopg2-binary`, and settings support. |
| ML Engine | `ml-engine/requirements.txt` | FastAPI service, Chronos/Torch forecast runtime, pandas/numpy, scikit-learn, and database access. |
| PostgreSQL | `postgres:16-alpine` | Uses the compose volume and `init_whooing_db.sql`; no application dependencies. |
| Local Python checks | `requirements.txt` | Thin local helper file for ETL imports and unit tests. It is not used by Docker runtime services. |

`requirements-dashboard.txt` is not part of the canonical runtime. The dashboard is a Node/Next.js app and is built from `dashboard/package-lock.json`.
