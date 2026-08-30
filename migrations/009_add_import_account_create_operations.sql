begin;

alter table app.import_write_operations
  add column if not exists whooing_account_id text;

alter table app.import_write_operations
  drop constraint if exists import_write_operations_operation_type_check,
  drop constraint if exists import_write_operations_action_subject_check;

alter table app.import_write_operations
  add constraint import_write_operations_operation_type_check check (
    operation_type in ('create', 'update', 'benefit', 'skip', 'review', 'mapping', 'account_create')
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

commit;
