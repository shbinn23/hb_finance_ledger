import { query } from "@/lib/db/postgres";

export type EntryKind = "expense" | "income" | "transfer" | "card-payment" | "other";
export type AccountKind = "asset" | "liability";

export interface WorkspaceContext {
  monthLabel: string;
  monthShortLabel: string;
  asOf: string;
  entryCount: number;
}

export interface MonthlyTrendRow {
  ym: string;
  label: string;
  expenses: number;
  income: number;
  cardPayment: number;
}

export interface CategoryAnalyticsRow {
  name: string;
  categoryType: string;
  currentAmount: number;
  averageAmount: number;
  transactionCount: number;
}

export interface AccountAnalyticsRow {
  id: string;
  name: string;
  kind: AccountKind;
  category: string;
  amount: number;
  paymentDay: number | null;
  paymentAccountId: string | null;
}

export interface LedgerAnalyticsRow {
  id: string;
  date: string;
  kind: EntryKind;
  leftAccount: string;
  rightAccount: string;
  leftType: string;
  rightType: string;
  item: string;
  memo: string;
  amount: number;
}

export interface LedgerMonthOption {
  value: string;
  label: string;
}

export interface PaymentMixRow {
  name: string;
  category: string;
  amount: number;
  count: number;
}

export interface MerchantHabitRow {
  name: string;
  amount: number;
  count: number;
  lastDate: string;
}

export interface FixedExpenseSummary {
  currentAmount: number;
  averageAmount: number;
  transactionCount: number;
  topAccounts: Array<{
    name: string;
    amount: number;
  }>;
}

interface ContextDbRow {
  entry_count: string;
  synced_at: Date | null;
  latest_month: string | null;
}

interface MonthlyDbRow {
  ym: string;
  expenses: string;
  income: string;
  card_payment: string;
}

interface CategoryDbRow {
  name: string;
  category_type: string;
  current_amount: string;
  average_amount: string | null;
  transaction_count: string;
}

interface AccountDbRow {
  id: string;
  name: string;
  kind: AccountKind;
  category: string;
  amount: string;
  payment_day: number | null;
  payment_account_id: string | null;
}

interface LedgerDbRow {
  id: string;
  date_label: string;
  kind: EntryKind;
  left_account: string;
  right_account: string;
  left_type: string;
  right_type: string;
  item: string | null;
  memo: string | null;
  amount: string;
}

interface LedgerMonthDbRow {
  ym: string;
}

interface PaymentMixDbRow {
  name: string;
  category: string;
  amount: string;
  count: string;
}

interface MerchantDbRow {
  name: string;
  amount: string;
  count: string;
  last_date: string;
}

interface FixedExpenseDbRow {
  current_amount: string;
  average_amount: string | null;
  transaction_count: string;
}

interface FixedExpenseAccountDbRow {
  name: string;
  amount: string;
}

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

function money(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0));
}

function formatMonth(yyyymm: string | null) {
  if (!yyyymm || yyyymm.length !== 6) {
    return { monthLabel: "최근 월", monthShortLabel: "이번 달" };
  }
  const year = yyyymm.slice(0, 4);
  const month = Number(yyyymm.slice(4, 6));
  return { monthLabel: `${year}년 ${month}월`, monthShortLabel: `${month}월` };
}

function formatShortMonth(yyyymm: string) {
  if (yyyymm.length !== 6) return yyyymm;
  return `${Number(yyyymm.slice(4, 6))}월`;
}

function formatLedgerMonthLabel(yyyymm: string) {
  if (yyyymm.length !== 6) return yyyymm;
  return `${yyyymm.slice(0, 4)}년 ${Number(yyyymm.slice(4, 6))}월`;
}

function formatLedgerMonthValue(yyyymm: string) {
  if (yyyymm.length !== 6) return yyyymm;
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

function toMonthNumber(month: string | null | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  return Number(month.replace("-", ""));
}

export async function getWorkspaceContext(month?: string | null): Promise<WorkspaceContext> {
  const monthNumber = toMonthNumber(month);
  const result = await query<ContextDbRow>(
    `
    select count(*)::text as entry_count,
           max(synced_at) as synced_at,
           (floor(max(entry_date))::int / 100)::text as latest_month
    from whooing.entries
    where section_id = $1
    `,
    [sectionId],
  );
  const row = result.rows[0];
  return {
    ...formatMonth(monthNumber?.toString() ?? row?.latest_month ?? null),
    entryCount: Number(row?.entry_count ?? 0),
    asOf: row?.synced_at
      ? new Intl.DateTimeFormat("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(row.synced_at)
      : "동기화 전",
  };
}

export async function getMonthlyTrend(month?: string | null): Promise<MonthlyTrendRow[]> {
  const monthNumber = toMonthNumber(month);
  const result = await query<MonthlyDbRow>(
    `
    with target_month as (
      select coalesce(
        $2::int,
        (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
      ) as ym
    ),
    monthly as (
      select (floor(entry_date)::int / 100)::text as ym,
             sum(case when l_account = 'expenses' then money else 0 end) as expenses,
             sum(case when r_account = 'income' then money else 0 end) as income,
             sum(case when l_account = 'liabilities' and r_account = 'assets' then money else 0 end) as card_payment
      from whooing.entries
      where section_id = $1
      group by 1
    )
    select ym, expenses::text, income::text, card_payment::text
    from (
      select monthly.*
      from monthly
      join target_month t on monthly.ym::int <= t.ym
      order by ym desc
      limit 12
    ) recent
    order by ym
    `,
    [sectionId, monthNumber],
  );
  return result.rows.map((row) => ({
    ym: row.ym,
    label: formatShortMonth(row.ym),
    expenses: money(row.expenses),
    income: money(row.income),
    cardPayment: money(row.card_payment),
  }));
}

export async function getCategoryAnalytics(month?: string | null): Promise<CategoryAnalyticsRow[]> {
  const monthNumber = toMonthNumber(month);
  const result = await query<CategoryDbRow>(
    `
    with target_month as (
      select coalesce(
        $2::int,
        (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
      ) as ym
    ),
    category_monthly as (
      select (floor(e.entry_date)::int / 100) as ym,
             a.title as name,
             coalesce(a.category, 'normal') as category_type,
             sum(e.money) as amount,
             count(*) as tx_count
      from whooing.entries e
      join whooing.accounts a
        on a.section_id = e.section_id
       and a.account_id = e.l_account_id
      where e.section_id = $1
        and e.l_account = 'expenses'
      group by 1, 2, 3
    )
    select c.name,
           c.category_type,
           sum(case when c.ym = m.ym then c.amount else 0 end)::text as current_amount,
           avg(case when c.ym < m.ym then c.amount end)::text as average_amount,
           sum(case when c.ym = m.ym then c.tx_count else 0 end)::text as transaction_count
    from category_monthly c
    join target_month m on true
    group by c.name, c.category_type
    having sum(case when c.ym = m.ym then c.amount else 0 end) > 0
    order by sum(case when c.ym = m.ym then c.amount else 0 end) desc
    limit 12
    `,
    [sectionId, monthNumber],
  );
  return result.rows.map((row) => ({
    name: row.name,
    categoryType: row.category_type,
    currentAmount: money(row.current_amount),
    averageAmount: money(row.average_amount),
    transactionCount: Number(row.transaction_count),
  }));
}

export async function getAccountAnalytics(): Promise<AccountAnalyticsRow[]> {
  const result = await query<AccountDbRow>(
    `
    with account_balances as (
      select
        a.account_id as id,
        a.title as name,
        case when a.account_type = 'assets' then 'asset' else 'liability' end as kind,
        coalesce(a.category, 'normal') as category,
        a.opt_pay_date as payment_day,
        a.opt_pay_account_id as payment_account_id,
        sum(
          case
            when a.account_type = 'assets' and e.l_account = 'assets' and e.l_account_id = a.account_id then e.money
            when a.account_type = 'assets' and e.r_account = 'assets' and e.r_account_id = a.account_id then -e.money
            when a.account_type = 'liabilities' and e.l_account = 'liabilities' and e.l_account_id = a.account_id then -e.money
            when a.account_type = 'liabilities' and e.r_account = 'liabilities' and e.r_account_id = a.account_id then e.money
            else 0
          end
        ) as amount
      from whooing.accounts a
      left join whooing.entries e
        on e.section_id = a.section_id
       and (
          (e.l_account_id = a.account_id and e.l_account = a.account_type)
          or (e.r_account_id = a.account_id and e.r_account = a.account_type)
       )
      where a.section_id = $1
        and a.item_type = 'account'
        and a.account_type in ('assets', 'liabilities')
      group by a.account_id, a.title, a.account_type, a.category, a.opt_pay_date, a.opt_pay_account_id
    )
    select id, name, kind, category, amount::text, payment_day, payment_account_id
    from account_balances
    where amount <> 0
    order by kind, abs(amount) desc
    `,
    [sectionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    category: row.category,
    amount: money(row.amount),
    paymentDay: row.payment_day,
    paymentAccountId: row.payment_account_id,
  }));
}

export async function getAvailableLedgerMonths(): Promise<LedgerMonthOption[]> {
  const result = await query<LedgerMonthDbRow>(
    `
    select (floor(entry_date)::int / 100)::text as ym
    from whooing.entries
    where section_id = $1
    group by 1
    order by 1 desc
    `,
    [sectionId],
  );

  return result.rows.map((row) => ({
    value: formatLedgerMonthValue(row.ym),
    label: formatLedgerMonthLabel(row.ym),
  }));
}

export async function getLedgerRows({
  limit = 80,
  month,
}: {
  limit?: number | null;
  month?: string | null;
} = {}): Promise<LedgerAnalyticsRow[]> {
  const monthNumber = toMonthNumber(month);
  const result = await query<LedgerDbRow>(
    `
    select e.entry_id::text as id,
           to_char(to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'), 'YYYY.MM.DD') as date_label,
           case
             when e.l_account = 'expenses' then 'expense'
             when e.r_account = 'income' then 'income'
             when e.l_account = 'liabilities' and e.r_account = 'assets' then 'card-payment'
             when e.l_account = 'assets' and e.r_account = 'assets' then 'transfer'
             else 'other'
           end as kind,
           coalesce(l.title, e.l_account_id) as left_account,
           coalesce(r.title, e.r_account_id) as right_account,
           e.l_account as left_type,
           e.r_account as right_type,
           e.item,
           e.memo,
           e.money::text as amount
    from whooing.entries e
    left join whooing.accounts l
      on l.section_id = e.section_id
     and l.account_id = e.l_account_id
    left join whooing.accounts r
      on r.section_id = e.section_id
     and r.account_id = e.r_account_id
    where e.section_id = $1
      and ($2::int is null or (floor(e.entry_date)::int / 100) = $2::int)
    order by e.entry_date desc
    limit coalesce($3::int, 100000)
    `,
    [sectionId, monthNumber, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    date: row.date_label,
    kind: row.kind,
    leftAccount: row.left_account,
    rightAccount: row.right_account,
    leftType: row.left_type,
    rightType: row.right_type,
    item: row.item?.trim() || "후잉 거래",
    memo: row.memo?.trim() || "",
    amount: money(row.amount),
  }));
}

export async function getPaymentMix(month?: string | null): Promise<PaymentMixRow[]> {
  const monthNumber = toMonthNumber(month);
  const result = await query<PaymentMixDbRow>(
    `
    with target_month as (
      select coalesce(
        $2::int,
        (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
      ) as ym
    )
    select coalesce(a.title, e.r_account_id) as name,
           coalesce(a.category, e.r_account) as category,
           sum(e.money)::text as amount,
           count(*)::text as count
    from whooing.entries e
    left join whooing.accounts a
      on a.section_id = e.section_id
     and a.account_id = e.r_account_id
    join target_month m on true
    where e.section_id = $1
      and e.l_account = 'expenses'
      and (floor(e.entry_date)::int / 100) = m.ym
    group by 1, 2
    order by sum(e.money) desc
    limit 10
    `,
    [sectionId, monthNumber],
  );
  return result.rows.map((row) => ({
    name: row.name,
    category: row.category,
    amount: money(row.amount),
    count: Number(row.count),
  }));
}

export async function getMerchantHabits(month?: string | null): Promise<MerchantHabitRow[]> {
  const monthNumber = toMonthNumber(month);
  const result = await query<MerchantDbRow>(
    `
    with target_month as (
      select coalesce(
        $2::int,
        (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
      ) as ym
    )
    select nullif(trim(e.item), '') as name,
           sum(e.money)::text as amount,
           count(*)::text as count,
           to_char(to_date(max(floor(e.entry_date)::int)::text, 'YYYYMMDD'), 'YYYY.MM.DD') as last_date
    from whooing.entries e
    join target_month m on true
    where e.section_id = $1
      and e.l_account = 'expenses'
      and nullif(trim(e.item), '') is not null
      and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') >= to_date((m.ym * 100 + 1)::text, 'YYYYMMDD') - interval '5 months'
      and (floor(e.entry_date)::int / 100) <= m.ym
    group by nullif(trim(e.item), '')
    having count(*) >= 2
    order by count(*) desc, sum(e.money) desc
    limit 12
    `,
    [sectionId, monthNumber],
  );
  return result.rows.map((row) => ({
    name: row.name,
    amount: money(row.amount),
    count: Number(row.count),
    lastDate: row.last_date,
  }));
}

export async function getFixedExpenseSummary(month?: string | null): Promise<FixedExpenseSummary> {
  const monthNumber = toMonthNumber(month);
  const [summary, topAccounts] = await Promise.all([
    query<FixedExpenseDbRow>(
      `
      with target_month as (
        select coalesce(
          $2::int,
          (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
        ) as ym
      ),
      fixed_monthly as (
        select (floor(e.entry_date)::int / 100) as ym,
               sum(e.money) as amount,
               count(*) as tx_count
        from whooing.entries e
        join whooing.accounts a
          on a.section_id = e.section_id
         and a.account_id = e.l_account_id
        where e.section_id = $1
          and e.l_account = 'expenses'
          and a.category = 'steady'
          and a.item_type = 'account'
        group by 1
      )
      select coalesce(sum(case when f.ym = m.ym then f.amount else 0 end), 0)::text as current_amount,
             avg(case when f.ym < m.ym then f.amount end)::text as average_amount,
             coalesce(sum(case when f.ym = m.ym then f.tx_count else 0 end), 0)::text as transaction_count
      from target_month m
      left join fixed_monthly f on true
      `,
      [sectionId, monthNumber],
    ),
    query<FixedExpenseAccountDbRow>(
      `
      with target_month as (
        select coalesce(
          $2::int,
          (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
        ) as ym
      )
      select a.title as name,
             sum(e.money)::text as amount
      from whooing.entries e
      join whooing.accounts a
        on a.section_id = e.section_id
       and a.account_id = e.l_account_id
      join target_month m on true
      where e.section_id = $1
        and e.l_account = 'expenses'
        and a.category = 'steady'
        and a.item_type = 'account'
        and (floor(e.entry_date)::int / 100) = m.ym
      group by a.title
      order by sum(e.money) desc
      limit 5
      `,
      [sectionId, monthNumber],
    ),
  ]);

  const row = summary.rows[0];
  return {
    currentAmount: money(row?.current_amount),
    averageAmount: money(row?.average_amount),
    transactionCount: Number(row?.transaction_count ?? 0),
    topAccounts: topAccounts.rows.map((account) => ({
      name: account.name,
      amount: money(account.amount),
    })),
  };
}
