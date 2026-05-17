import { query } from "@/lib/db/postgres";
import { getAccountDisplayName } from "@/lib/account-display-name";
import { formatDisplayDateTime } from "@/lib/format";
import {
  displayFixedSchedulePolicy,
  type FixedExpenseScheduleSourceRow,
} from "@/lib/financial-analysis/fixed-expense-schedule";
import type { ResolvedPeriod } from "@/lib/period-filter";

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

export interface PeriodAggregateRow {
  expenses: number;
  income: number;
  cardPayment: number;
  transactionCount: number;
  expenseTransactionCount: number;
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

export interface FixedExpenseScheduleSource {
  targetMonth: string;
  rows: FixedExpenseScheduleSourceRow[];
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

interface PeriodAggregateDbRow {
  expenses: string;
  income: string;
  card_payment: string;
  transaction_count: string;
  expense_transaction_count: string;
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
  account_type: "assets" | "liabilities";
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
  left_account_id: string;
  right_account_id: string;
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
  account_id: string;
  account_type: string;
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

interface FixedExpenseScheduleDbRow {
  target_month: string;
  id: string;
  account_name: string;
  item_name: string;
  payment_account_name: string | null;
  payment_account_key: string | null;
  expected_amount: string | null;
  current_amount: string;
  due_day: string | null;
  processed_day: number | null;
}

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";
const fixedSchedulePolicy = displayFixedSchedulePolicy;

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
  return `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;
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

function displayAccountName(accountType: string, accountId: string, sourceTitle: string) {
  return getAccountDisplayName(accountType, accountId, sourceTitle);
}

function displayEncodedAccountNames(value: string | null | undefined) {
  if (!value) return null;
  return value
    .split(", ")
    .map((chunk) => {
      const [accountType, accountId, ...titleParts] = chunk.split(":");
      const sourceTitle = titleParts.join(":");
      if (!accountType || !accountId || !sourceTitle) return chunk;
      return displayAccountName(accountType, accountId, sourceTitle);
    })
    .join(", ");
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
      ? formatDisplayDateTime(row.synced_at)
      : "동기화 전",
  };
}

export async function getMonthlyTrend(month?: string | null, period?: ResolvedPeriod | null): Promise<MonthlyTrendRow[]> {
  if (period && period.mode !== "month") {
    const result = await query<MonthlyDbRow>(
      `
      select (floor(entry_date)::int / 100)::text as ym,
             sum(case when l_account = 'expenses' then money else 0 end)::text as expenses,
             sum(case when r_account = 'income' then money else 0 end)::text as income,
             sum(case when l_account = 'liabilities' and r_account = 'assets' then money else 0 end)::text as card_payment
      from whooing.entries
      where section_id = $1
        and ($2::int is null or entry_date >= $2)
        and ($3::int is null or entry_date < $3)
      group by 1
      order by ym
      `,
      [sectionId, period.startDate, period.endDate],
    );
    return result.rows.map((row) => ({
      ym: row.ym,
      label: formatShortMonth(row.ym),
      expenses: money(row.expenses),
      income: money(row.income),
      cardPayment: money(row.card_payment),
    }));
  }

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

export async function getPeriodAggregate(
  month?: string | null,
  period?: ResolvedPeriod | null,
): Promise<PeriodAggregateRow> {
  if (period) {
    const result = await query<PeriodAggregateDbRow>(
      `
      select coalesce(sum(case when l_account = 'expenses' then money else 0 end), 0)::text as expenses,
             coalesce(sum(case when r_account = 'income' then money else 0 end), 0)::text as income,
             coalesce(sum(case when l_account = 'liabilities' and r_account = 'assets' then money else 0 end), 0)::text as card_payment,
             count(*)::text as transaction_count,
             count(*) filter (where l_account = 'expenses')::text as expense_transaction_count
      from whooing.entries
      where section_id = $1
        and ($2::int is null or entry_date >= $2)
        and ($3::int is null or entry_date < $3)
      `,
      [sectionId, period.startDate, period.endDate],
    );
    const row = result.rows[0];
    return {
      expenses: money(row?.expenses),
      income: money(row?.income),
      cardPayment: money(row?.card_payment),
      transactionCount: Number(row?.transaction_count ?? 0),
      expenseTransactionCount: Number(row?.expense_transaction_count ?? 0),
    };
  }

  const monthNumber = toMonthNumber(month);
  const result = await query<PeriodAggregateDbRow>(
    `
    with target_month as (
      select coalesce(
        $2::int,
        (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
      ) as ym
    )
    select coalesce(sum(case when e.l_account = 'expenses' then e.money else 0 end), 0)::text as expenses,
           coalesce(sum(case when e.r_account = 'income' then e.money else 0 end), 0)::text as income,
           coalesce(sum(case when e.l_account = 'liabilities' and e.r_account = 'assets' then e.money else 0 end), 0)::text as card_payment,
           count(*)::text as transaction_count,
           count(*) filter (where e.l_account = 'expenses')::text as expense_transaction_count
    from whooing.entries e
    join target_month m on true
    where e.section_id = $1
      and (floor(e.entry_date)::int / 100) = m.ym
    `,
    [sectionId, monthNumber],
  );
  const row = result.rows[0];
  return {
    expenses: money(row?.expenses),
    income: money(row?.income),
    cardPayment: money(row?.card_payment),
    transactionCount: Number(row?.transaction_count ?? 0),
    expenseTransactionCount: Number(row?.expense_transaction_count ?? 0),
  };
}

export async function getCategoryAnalytics(
  month?: string | null,
  period?: ResolvedPeriod | null,
): Promise<CategoryAnalyticsRow[]> {
  if (period && period.mode !== "month") {
    const result = await query<CategoryDbRow>(
      `
      with scoped_monthly as (
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
          and ($2::int is null or e.entry_date >= $2)
          and ($3::int is null or e.entry_date < $3)
        group by 1, 2, 3
      )
      select name,
             category_type,
             sum(amount)::text as current_amount,
             avg(amount)::text as average_amount,
             sum(tx_count)::text as transaction_count
      from scoped_monthly
      group by name, category_type
      order by sum(amount) desc
      limit 12
      `,
      [sectionId, period.startDate, period.endDate],
    );
    return result.rows.map((row) => ({
      name: row.name,
      categoryType: row.category_type,
      currentAmount: money(row.current_amount),
      averageAmount: money(row.average_amount),
      transactionCount: Number(row.transaction_count),
    }));
  }

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
        a.account_type,
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
    select id, account_type, name, kind, category, amount::text, payment_day, payment_account_id
    from account_balances
    where amount <> 0
    order by kind, abs(amount) desc
    `,
    [sectionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: displayAccountName(row.account_type, row.id, row.name),
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
  period,
}: {
  limit?: number | null;
  period?: ResolvedPeriod | null;
} = {}): Promise<LedgerAnalyticsRow[]> {
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
           e.l_account_id as left_account_id,
           e.r_account_id as right_account_id,
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
      and ($2::int is null or e.entry_date >= $2)
      and ($3::int is null or e.entry_date < $3)
    order by e.entry_date desc
    limit coalesce($4::int, 100000)
    `,
    [sectionId, period?.startDate ?? null, period?.endDate ?? null, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    date: row.date_label,
    kind: row.kind,
    leftAccount: displayAccountName(row.left_type, row.left_account_id, row.left_account),
    rightAccount: displayAccountName(row.right_type, row.right_account_id, row.right_account),
    leftType: row.left_type,
    rightType: row.right_type,
    item: row.item?.trim() || "후잉 거래",
    memo: row.memo?.trim() || "",
    amount: money(row.amount),
  }));
}

export async function getPaymentMix(month?: string | null, period?: ResolvedPeriod | null): Promise<PaymentMixRow[]> {
  if (period && period.mode !== "month") {
    const result = await query<PaymentMixDbRow>(
      `
      select e.r_account_id as account_id,
             e.r_account as account_type,
             coalesce(a.title, e.r_account_id) as name,
             coalesce(a.category, e.r_account) as category,
             sum(e.money)::text as amount,
             count(*)::text as count
      from whooing.entries e
      left join whooing.accounts a
        on a.section_id = e.section_id
       and a.account_id = e.r_account_id
      where e.section_id = $1
        and e.l_account = 'expenses'
        and ($2::int is null or e.entry_date >= $2)
        and ($3::int is null or e.entry_date < $3)
      group by 1, 2, 3, 4
      order by sum(e.money) desc
      limit 10
      `,
      [sectionId, period.startDate, period.endDate],
    );
    return result.rows.map((row) => ({
      name: displayAccountName(row.account_type, row.account_id, row.name),
      category: row.category,
      amount: money(row.amount),
      count: Number(row.count),
    }));
  }

  const monthNumber = toMonthNumber(month);
  const result = await query<PaymentMixDbRow>(
    `
    with target_month as (
      select coalesce(
        $2::int,
        (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
      ) as ym
    )
    select e.r_account_id as account_id,
           e.r_account as account_type,
           coalesce(a.title, e.r_account_id) as name,
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
    group by 1, 2, 3, 4
    order by sum(e.money) desc
    limit 10
    `,
    [sectionId, monthNumber],
  );
  return result.rows.map((row) => ({
    name: displayAccountName(row.account_type, row.account_id, row.name),
    category: row.category,
    amount: money(row.amount),
    count: Number(row.count),
  }));
}

export async function getMerchantHabits(
  month?: string | null,
  period?: ResolvedPeriod | null,
): Promise<MerchantHabitRow[]> {
  if (period) {
    const result = await query<MerchantDbRow>(
      `
      select nullif(trim(e.item), '') as name,
             sum(e.money)::text as amount,
             count(*)::text as count,
             to_char(to_date(max(floor(e.entry_date)::int)::text, 'YYYYMMDD'), 'YYYY.MM.DD') as last_date
      from whooing.entries e
      where e.section_id = $1
        and e.l_account = 'expenses'
        and nullif(trim(e.item), '') is not null
        and ($2::int is null or e.entry_date >= $2)
        and ($3::int is null or e.entry_date < $3)
      group by nullif(trim(e.item), '')
      having count(*) >= 2
      order by count(*) desc, sum(e.money) desc
      limit 12
      `,
      [sectionId, period.startDate, period.endDate],
    );
    return result.rows.map((row) => ({
      name: row.name,
      amount: money(row.amount),
      count: Number(row.count),
      lastDate: row.last_date,
    }));
  }

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

export async function getFixedExpenseSummary(
  month?: string | null,
  period?: ResolvedPeriod | null,
): Promise<FixedExpenseSummary> {
  if (period && period.mode !== "month") {
    const [summary, topAccounts] = await Promise.all([
      query<FixedExpenseDbRow>(
        `
        with fixed_monthly as (
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
            and ($2::int is null or e.entry_date >= $2)
            and ($3::int is null or e.entry_date < $3)
          group by 1
        )
        select coalesce(sum(amount), 0)::text as current_amount,
               avg(amount)::text as average_amount,
               coalesce(sum(tx_count), 0)::text as transaction_count
        from fixed_monthly
        `,
        [sectionId, period.startDate, period.endDate],
      ),
      query<FixedExpenseAccountDbRow>(
        `
        select a.title as name,
               sum(e.money)::text as amount
        from whooing.entries e
        join whooing.accounts a
          on a.section_id = e.section_id
         and a.account_id = e.l_account_id
        where e.section_id = $1
          and e.l_account = 'expenses'
          and a.category = 'steady'
          and a.item_type = 'account'
          and ($2::int is null or e.entry_date >= $2)
          and ($3::int is null or e.entry_date < $3)
        group by a.title
        order by sum(e.money) desc
        limit 5
        `,
        [sectionId, period.startDate, period.endDate],
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

export async function getFixedExpenseSchedule(month?: string | null): Promise<FixedExpenseScheduleSource> {
  const monthNumber = toMonthNumber(month);
  const result = await query<FixedExpenseScheduleDbRow>(
    `
    with target_month as (
      select coalesce(
        $2::int,
        (select (floor(max(entry_date))::int / 100) from whooing.entries where section_id = $1)
      ) as ym
    ),
    fixed_entries as (
      select
        a.account_id,
        a.title as account_name,
        coalesce(nullif(trim(e.item), ''), a.title) as item_name,
        coalesce(p.title, e.r_account_id, '미확인') as payment_account_name,
        concat_ws(':', e.r_account, e.r_account_id, coalesce(p.title, e.r_account_id, '미확인')) as payment_account_key,
        (floor(e.entry_date)::int / 100) as ym,
        (floor(e.entry_date)::int % 100) as day,
        e.money
      from whooing.entries e
      join whooing.accounts a
        on a.section_id = e.section_id
       and a.account_id = e.l_account_id
      left join whooing.accounts p
        on p.section_id = e.section_id
       and p.account_type = e.r_account
       and p.account_id = e.r_account_id
      join target_month m on true
      where e.section_id = $1
        and e.l_account = 'expenses'
        and a.category = 'steady'
        and a.item_type = 'account'
        and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD')
          >= to_date((m.ym * 100 + 1)::text, 'YYYYMMDD') - ($3::int * interval '1 month')
        and (floor(e.entry_date)::int / 100) <= m.ym
    ),
    fixed_monthly as (
      select
        fe.account_id,
        fe.item_name,
        fe.ym,
        sum(fe.money) as month_amount,
        string_agg(distinct fe.payment_account_name, ', ' order by fe.payment_account_name) as payment_account_name,
        string_agg(distinct fe.payment_account_key, ', ' order by fe.payment_account_key) as payment_account_key
      from fixed_entries fe
      group by fe.account_id, fe.item_name, fe.ym
    ),
    latest_historical_amount as (
      select distinct on (fm.account_id, fm.item_name)
        fm.account_id,
        fm.item_name,
        fm.month_amount as expected_amount,
        fm.payment_account_name as historical_payment_account_name,
        fm.payment_account_key as historical_payment_account_key
      from fixed_monthly fm
      join target_month m on true
      where fm.ym < m.ym
      order by fm.account_id, fm.item_name, fm.ym desc
    ),
    fixed_rollup as (
      select
        concat(fe.account_id, ':', fe.item_name) as id,
        fe.account_name,
        fe.item_name,
        coalesce(sum(fe.money) filter (where fe.ym = m.ym), 0) as current_amount,
        max(fe.day) filter (where fe.ym = m.ym) as processed_day,
        lha.expected_amount,
        string_agg(distinct fe.payment_account_name, ', ' order by fe.payment_account_name) filter (where fe.ym = m.ym) as current_payment_account_name,
        string_agg(distinct fe.payment_account_key, ', ' order by fe.payment_account_key) filter (where fe.ym = m.ym) as current_payment_account_key,
        lha.historical_payment_account_name,
        lha.historical_payment_account_key,
        (percentile_cont(0.5) within group (order by fe.day) filter (where fe.ym < m.ym))::int as due_day,
        count(distinct fe.ym) filter (where fe.ym < m.ym) as historical_months,
        m.ym::text as target_month
      from fixed_entries fe
      join target_month m on true
      left join latest_historical_amount lha
        on lha.account_id = fe.account_id
       and lha.item_name = fe.item_name
      group by fe.account_id, fe.account_name, fe.item_name, lha.expected_amount, lha.historical_payment_account_name, lha.historical_payment_account_key, m.ym
    )
    select
      target_month,
      id,
      account_name,
      item_name,
      coalesce(current_payment_account_name, historical_payment_account_name, '미확인') as payment_account_name,
      coalesce(current_payment_account_key, historical_payment_account_key) as payment_account_key,
      expected_amount::text,
      current_amount::text,
      due_day::text,
      processed_day
    from fixed_rollup
    where current_amount > 0
       or historical_months >= $4
    order by coalesce(due_day, processed_day, 31), item_name
    `,
    [
      sectionId,
      monthNumber,
      fixedSchedulePolicy.lookbackMonths,
      fixedSchedulePolicy.minHistoricalMonths,
    ],
  );

  const targetMonth = result.rows[0]?.target_month ?? monthNumber?.toString() ?? "";
  return {
    targetMonth,
    rows: result.rows.map((row) => ({
      id: row.id,
      accountName: row.account_name,
      itemName: row.item_name,
      paymentAccountName: displayEncodedAccountNames(row.payment_account_key) ?? row.payment_account_name ?? "미확인",
      expectedAmount: money(row.expected_amount),
      currentAmount: money(row.current_amount),
      dueDay: Number(row.due_day ?? row.processed_day ?? 1),
      processedDay: row.processed_day,
    })),
  };
}
