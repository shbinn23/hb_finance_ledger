begin;

create schema if not exists app;

create table if not exists app.ledger_write_operations (
  id bigserial primary key,
  operation_key text not null unique
    check (char_length(operation_key) between 8 and 128),
  source text not null,
  entry_type text not null,
  occurred_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  item text not null,
  status text not null check (status in ('pending', 'created', 'failed')),
  whooing_entry_id bigint,
  sync_status text not null default 'skipped' check (sync_status in ('synced', 'pending', 'skipped')),
  sync_reason text check (sync_reason in ('etl_unavailable', 'timeout', 'etl_error', 'unknown')),
  benefit_status text not null default 'skipped' check (benefit_status in ('created', 'skipped', 'pending', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ledger_write_operations_status_idx
  on app.ledger_write_operations(status, sync_status, created_at);

commit;
