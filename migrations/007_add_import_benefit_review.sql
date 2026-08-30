begin;

alter table app.import_rows
  add column if not exists benefit_status text not null default 'not_applicable' check (
    benefit_status in (
      'not_applicable', 'rule_matched', 'rule_uncertain', 'event_exists',
      'needs_review', 'approved', 'skipped', 'created', 'failed'
    )
  ),
  add column if not exists benefit_rule_id text references app.card_benefit_rules(rule_id),
  add column if not exists benefit_confidence numeric(4,3) check (
    benefit_confidence is null or (benefit_confidence >= 0 and benefit_confidence <= 1)
  ),
  add column if not exists benefit_reason text not null default '',
  add column if not exists benefit_event_id uuid references app.card_benefit_events(event_id),
  add column if not exists benefit_approved_at timestamptz;

create index if not exists import_rows_benefit_status_idx
  on app.import_rows(benefit_status, occurred_date)
  where benefit_status <> 'not_applicable';

create index if not exists import_rows_benefit_rule_idx
  on app.import_rows(benefit_rule_id, occurred_date)
  where benefit_rule_id is not null;

commit;
