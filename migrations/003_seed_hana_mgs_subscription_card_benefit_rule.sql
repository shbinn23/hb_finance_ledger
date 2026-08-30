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
  'hana_mgs_subscription_50p',
  'liabilities',
  'x45',
  '하나 MG+S 구독 50%',
  'active',
  11,
  'simple_pay',
  null,
  'rate',
  5000,
  '[
    {"performanceThreshold": 300000, "monthlyCapAmount": 15000},
    {"performanceThreshold": 600000, "monthlyCapAmount": 30000},
    {"performanceThreshold": 1000000, "monthlyCapAmount": 60000}
  ]'::jsonb,
  '{
    "performanceAmountPolicy": "approval_amount",
    "manualSelection": true,
    "capUsageRuleId": "hana_mgs_simple_pay_10p"
  }'::jsonb,
  'reduce_expense'
)
on conflict (rule_id) do update set
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
