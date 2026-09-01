begin;

alter table app.import_rows
  add column if not exists review_mirror_section_id text,
  add column if not exists review_mirror_entry_id bigint,
  add column if not exists review_mirror_occurred_date date,
  add column if not exists review_mirror_l_account text,
  add column if not exists review_mirror_l_account_id text,
  add column if not exists review_mirror_r_account text,
  add column if not exists review_mirror_r_account_id text,
  add column if not exists review_mirror_item text,
  add column if not exists review_mirror_memo text,
  add column if not exists review_mirror_amount bigint;

alter table app.import_rows
  drop constraint if exists import_rows_review_mirror_snapshot_check;

alter table app.import_rows
  add constraint import_rows_review_mirror_snapshot_check check (
    (
      review_mirror_section_id is null
      and review_mirror_entry_id is null
      and review_mirror_occurred_date is null
      and review_mirror_l_account is null
      and review_mirror_l_account_id is null
      and review_mirror_r_account is null
      and review_mirror_r_account_id is null
      and review_mirror_item is null
      and review_mirror_memo is null
      and review_mirror_amount is null
    )
    or (
      nullif(btrim(review_mirror_section_id), '') is not null
      and review_mirror_entry_id > 0
      and review_mirror_occurred_date is not null
      and nullif(btrim(review_mirror_l_account), '') is not null
      and nullif(btrim(review_mirror_l_account_id), '') is not null
      and nullif(btrim(review_mirror_r_account), '') is not null
      and nullif(btrim(review_mirror_r_account_id), '') is not null
      and review_mirror_item is not null
      and review_mirror_memo is not null
      and review_mirror_amount > 0
    )
  );

alter table app.import_write_operations
  drop constraint if exists import_write_operations_operation_type_check,
  drop constraint if exists import_write_operations_action_subject_check;

alter table app.import_write_operations
  add constraint import_write_operations_operation_type_check check (
    operation_type in (
      'create', 'update', 'delete', 'benefit', 'skip', 'review',
      'mapping', 'account_create'
    )
  ),
  add constraint import_write_operations_action_subject_check check (
    (
      operation_type in ('mapping', 'account_create')
      and row_id is null
      and mapping_type is not null
      and nullif(btrim(source_key), '') is not null
    )
    or (
      operation_type not in ('mapping', 'account_create')
      and row_id is not null
      and mapping_type is null
      and source_key is null
    )
  );

drop index if exists app.import_write_operations_terminal_row_action_idx;

create unique index import_write_operations_terminal_row_action_idx
  on app.import_write_operations(row_id, operation_type)
  where operation_type in ('create', 'benefit', 'delete');

alter table app.import_rows
  drop constraint if exists import_rows_status_check;

alter table app.import_rows
  add constraint import_rows_status_check check (status in (
    'auto_creatable', 'created', 'updated', 'deleted', 'skipped', 'reviewed',
    'duplicate', 'mapping_required', 'possible_update', 'possible_delete',
    'conflict', 'review_required', 'write_failed'
  ));

commit;
