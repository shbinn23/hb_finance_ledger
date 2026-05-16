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

## Slack Expense Flow Runtime

Slack `/expense` entry submission uses the Dashboard plus the ETL HTTP service. The ETL service exposes `POST /sync/whooing` for best-effort local DB sync after a Whooing entry is created.

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

Required env names for the Slack expense flow:

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
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

Slack should send slash command and interactivity requests to the Dashboard endpoint:

```text
POST /api/slack/ledger-entry
```

Slack App settings:

- Slash Command: `/expense`
- Slash Command Request URL: `{public_url}/api/slack/ledger-entry`
- Interactivity: enabled
- Interactivity Request URL: `{public_url}/api/slack/ledger-entry`
- If the ngrok or public URL changes, update both Slack URLs.

Manual test input:

- 승인금액: `7700`
- 거래일: test date
- 내용/가맹점: `SlackTest스타벅스`
- 카드 혜택: `점심시간 5% 할인`
- 메모: `테스트`

Expected result:

- 할인액: `385`
- Whooing `money`: `7315`
- `memo` includes `승인금액 7,700원`, `카드혜택 점심시간 5% 할인`, and `할인액 385원`

Test cleanup:

- The manual test creates a real Whooing entry.
- Delete the test entry from Whooing after testing.
- After deleting it, sync the same date so the local Dashboard DB no longer shows the test row.

Before merging `feature/slack-ledger-entry`:

- `/expense` Modal opens from Slack.
- Slack submit creates a Whooing entry.
- Whooing `money` is the discount-adjusted `postingAmount`.
- `memo` includes approval amount, card benefit, and discount amount.
- ETL service sync reflects the entry in the local DB.
- Test entry deletion is reflected in the local DB after sync.
- Expense category options display `{groupTitle} / {accountTitle}`.
- Sync timeout wording does not read like registration failure.
- Slash Command and Interactivity setup are documented.
- `docker compose --profile etl config --quiet` passes.
- `npm run lint` passes.
- `npm run build` passes.
