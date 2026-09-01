begin;

alter table app.import_rows
  drop constraint if exists import_rows_benefit_status_check;

alter table app.import_rows
  add constraint import_rows_benefit_status_check check (
    benefit_status in (
      'not_applicable', 'rule_matched', 'rule_uncertain', 'rule_selection_required',
      'rule_unknown', 'event_exists', 'needs_review', 'approved', 'skipped',
      'created', 'failed'
    )
  );

commit;
