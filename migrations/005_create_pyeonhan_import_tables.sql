begin;

create schema if not exists app;

create table if not exists app.import_batches (
  id bigserial primary key,
  source text not null,
  gmail_message_id text,
  gmail_attachment_id text,
  filename text not null,
  source_file_hash text check (
    source_file_hash is null or source_file_hash ~ '^[a-f0-9]{64}$'
  ),
  export_started_at date,
  export_ended_at date,
  status text not null check (status in ('pending', 'review', 'applying', 'completed', 'partial', 'failed')),
  total_count integer not null default 0 check (total_count >= 0),
  auto_created_count integer not null default 0 check (auto_created_count >= 0),
  write_failed_count integer not null default 0 check (write_failed_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  check (
    (gmail_message_id is null and gmail_attachment_id is null)
    or (gmail_message_id is not null and gmail_attachment_id is not null)
  ),
  unique (gmail_message_id, gmail_attachment_id)
);

create index if not exists import_batches_source_file_hash_idx
  on app.import_batches(source, source_file_hash, created_at desc)
  where source_file_hash is not null;

create table if not exists app.import_rows (
  id bigserial primary key,
  batch_id bigint not null references app.import_batches(id) on delete cascade,
  row_index integer not null check (row_index > 0),
  occurrence_index integer not null check (occurrence_index > 0),
  source_identity_key text not null check (source_identity_key ~ '^[a-f0-9]{64}$'),
  source_content_hash text not null check (source_content_hash ~ '^[a-f0-9]{64}$'),
  occurred_date date not null,
  entry_type text not null check (entry_type in ('expense', 'income', 'transfer', 'difference_income')),
  source_asset_name text not null,
  counterparty_asset_name text,
  source_category_name text,
  source_subcategory_name text,
  item text not null,
  memo text not null default '',
  posting_amount bigint not null check (posting_amount > 0),
  approval_amount bigint not null check (approval_amount > 0),
  discount_amount bigint not null check (discount_amount >= 0),
  currency text not null default 'KRW',
  status text not null check (status in (
    'auto_creatable', 'created', 'duplicate', 'mapping_required',
    'possible_update', 'possible_delete', 'conflict', 'review_required', 'write_failed'
  )),
  review_reason text not null default '',
  matched_whooing_entry_id bigint,
  created_whooing_entry_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approval_amount >= posting_amount),
  check (discount_amount = approval_amount - posting_amount),
  unique (batch_id, row_index, occurrence_index),
  unique (batch_id, source_identity_key, occurrence_index)
);

create index if not exists import_rows_identity_idx
  on app.import_rows(source_identity_key, created_at desc);
create index if not exists import_rows_occurred_date_idx
  on app.import_rows(occurred_date);

create table if not exists app.import_mappings (
  id bigserial primary key,
  source text not null,
  mapping_type text not null check (mapping_type in ('asset', 'expense_category', 'income_category')),
  source_key text not null,
  whooing_account_id text not null,
  whooing_account_type text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (mapping_type = 'asset' and whooing_account_type in ('assets', 'liabilities'))
    or (mapping_type = 'expense_category' and whooing_account_type = 'expenses')
    or (mapping_type = 'income_category' and whooing_account_type = 'income')
  ),
  unique (source, mapping_type, source_key)
);

create table if not exists app.import_write_operations (
  id bigserial primary key,
  row_id bigint not null references app.import_rows(id) on delete cascade,
  operation_type text not null check (operation_type in ('create')),
  operation_key text not null unique check (char_length(operation_key) between 8 and 128),
  status text not null check (status in ('pending', 'created', 'failed')),
  whooing_entry_id bigint,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (row_id, operation_type)
);

commit;
