begin;

alter table app.import_write_operations
  add column if not exists mapping_type text,
  add column if not exists source_key text;

alter table app.import_write_operations
  alter column row_id drop not null;

alter table app.import_write_operations
  drop constraint if exists import_write_operations_operation_type_check,
  drop constraint if exists import_write_operations_row_id_operation_type_key,
  drop constraint if exists import_write_operations_action_subject_check;

alter table app.import_write_operations
  add constraint import_write_operations_operation_type_check check (
    operation_type in ('create', 'update', 'benefit', 'skip', 'review', 'mapping')
  ),
  add constraint import_write_operations_action_subject_check check (
    (
      operation_type = 'mapping'
      and row_id is null
      and mapping_type is not null
      and nullif(btrim(source_key), '') is not null
    )
    or (
      operation_type <> 'mapping'
      and row_id is not null
      and mapping_type is null
      and source_key is null
    )
  );

create unique index if not exists import_write_operations_terminal_row_action_idx
  on app.import_write_operations(row_id, operation_type)
  where operation_type in ('create', 'benefit');

alter table app.import_rows
  drop constraint if exists import_rows_status_check;

alter table app.import_rows
  add constraint import_rows_status_check check (status in (
    'auto_creatable', 'created', 'updated', 'skipped', 'reviewed',
    'duplicate', 'mapping_required', 'possible_update', 'possible_delete',
    'conflict', 'review_required', 'write_failed'
  ));

commit;
