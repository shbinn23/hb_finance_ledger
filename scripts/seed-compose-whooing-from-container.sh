#!/usr/bin/env bash
set -euo pipefail

SOURCE_CONTAINER="${SOURCE_CONTAINER:-fortress-db}"
TARGET_CONTAINER="${TARGET_CONTAINER:-whooing-migration-mvp-db-1}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-ledger}"

# The legacy fortress-db container is allowed here only as a read-only seed source.
# Runtime services must use the compose db service, or localhost:5432 from local dev.
echo "Seeding whooing schema data from ${SOURCE_CONTAINER} to ${TARGET_CONTAINER}..."

docker exec "${TARGET_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  truncate_sql text;
begin
  select 'truncate table ' ||
         string_agg(format('%I.%I', schemaname, tablename), ', ') ||
         ' restart identity cascade'
    into truncate_sql
  from pg_tables
  where schemaname = 'whooing';

  if truncate_sql is not null then
    execute truncate_sql;
  end if;
end $$;
SQL

docker exec "${SOURCE_CONTAINER}" pg_dump \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --schema=whooing \
  --data-only \
  --no-owner \
  --no-privileges \
| docker exec -i "${TARGET_CONTAINER}" psql \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1

docker exec "${TARGET_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -c \
  "select count(*) as entries, min(entry_date), max(entry_date) from whooing.entries;"
