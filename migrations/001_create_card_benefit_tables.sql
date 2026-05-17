create schema if not exists app;

create table if not exists app.card_benefit_rules (
  rule_id text primary key,
  card_account_type text not null check (card_account_type in ('liabilities')),
  card_account_id text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  priority integer not null default 100,
  payment_channel text check (payment_channel in ('general', 'simple_pay')),
  min_approval_amount numeric(14, 2) check (
    min_approval_amount is null or min_approval_amount >= 0
  ),
  discount_type text not null check (discount_type in ('rate')),
  discount_rate_bps integer check (
    discount_rate_bps is null or (discount_rate_bps >= 0 and discount_rate_bps <= 10000)
  ),
  monthly_cap_tiers jsonb not null default '[]'::jsonb,
  performance_policy jsonb not null default '{}'::jsonb,
  posting_policy text not null default 'reduce_expense' check (
    posting_policy in ('reduce_expense', 'memo_only', 'separate_income')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.card_benefit_events (
  event_id uuid primary key,
  section_id text,
  whooing_entry_id bigint,
  entry_date integer not null,
  rule_id text references app.card_benefit_rules(rule_id),
  card_account_type text not null,
  card_account_id text not null,
  expense_account_id text,
  merchant text,
  payment_channel text not null,
  approval_amount numeric(14, 2) not null check (approval_amount > 0),
  performance_amount numeric(14, 2) not null check (performance_amount >= 0),
  eligible_discount_amount numeric(14, 2) not null default 0 check (
    eligible_discount_amount >= 0
  ),
  applied_discount_amount numeric(14, 2) not null default 0 check (
    applied_discount_amount >= 0
  ),
  posting_amount numeric(14, 2) not null check (posting_amount > 0),
  cap_used_before numeric(14, 2) check (cap_used_before is null or cap_used_before >= 0),
  cap_used_after numeric(14, 2) check (cap_used_after is null or cap_used_after >= 0),
  evaluation_status text not null,
  evaluation_reason text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (applied_discount_amount <= eligible_discount_amount),
  check (posting_amount = approval_amount - applied_discount_amount)
);

create unique index if not exists card_benefit_events_idempotency_key_idx
  on app.card_benefit_events(idempotency_key)
  where idempotency_key is not null;

create unique index if not exists card_benefit_events_whooing_entry_idx
  on app.card_benefit_events(section_id, whooing_entry_id)
  where whooing_entry_id is not null;

create index if not exists card_benefit_events_entry_date_idx
  on app.card_benefit_events(entry_date);

create index if not exists card_benefit_events_rule_entry_date_idx
  on app.card_benefit_events(rule_id, entry_date);

create table if not exists app.card_benefit_monthly_status (
  benefit_month text not null,
  rule_id text not null references app.card_benefit_rules(rule_id),
  card_account_type text not null,
  card_account_id text not null,
  performance_amount numeric(14, 2) check (
    performance_amount is null or performance_amount >= 0
  ),
  monthly_cap_amount numeric(14, 2) not null check (monthly_cap_amount >= 0),
  cap_used_external numeric(14, 2) not null default 0 check (cap_used_external >= 0),
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (benefit_month, rule_id),
  check (benefit_month ~ '^\d{4}-\d{2}$')
);

create index if not exists card_benefit_monthly_status_card_idx
  on app.card_benefit_monthly_status(card_account_type, card_account_id, benefit_month);

insert into app.card_benefit_rules (
  rule_id,
  card_account_type,
  card_account_id,
  name,
  status,
  priority,
  payment_channel,
  min_approval_amount,
  discount_type,
  discount_rate_bps,
  monthly_cap_tiers,
  performance_policy,
  posting_policy
) values (
  'hana_mgs_simple_pay_10p',
  'liabilities',
  'x45',
  '하나 MG+S 간편결제 10%',
  'active',
  10,
  'simple_pay',
  10000,
  'rate',
  1000,
  '[
    {"performanceThreshold": 300000, "monthlyCapAmount": 15000},
    {"performanceThreshold": 600000, "monthlyCapAmount": 30000},
    {"performanceThreshold": 1000000, "monthlyCapAmount": 60000}
  ]'::jsonb,
  '{"performanceAmountPolicy": "approval_amount"}'::jsonb,
  'reduce_expense'
) on conflict (rule_id) do update set
  card_account_type = excluded.card_account_type,
  card_account_id = excluded.card_account_id,
  name = excluded.name,
  status = excluded.status,
  priority = excluded.priority,
  payment_channel = excluded.payment_channel,
  min_approval_amount = excluded.min_approval_amount,
  discount_type = excluded.discount_type,
  discount_rate_bps = excluded.discount_rate_bps,
  monthly_cap_tiers = excluded.monthly_cap_tiers,
  performance_policy = excluded.performance_policy,
  posting_policy = excluded.posting_policy,
  updated_at = now();
