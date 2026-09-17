begin;

alter table app.import_rows
  drop constraint if exists import_rows_entry_type_check;

alter table app.import_rows
  add constraint import_rows_entry_type_check check (entry_type in (
    'expense', 'income', 'transfer', 'difference_income', 'difference_expense'
  ));

commit;
