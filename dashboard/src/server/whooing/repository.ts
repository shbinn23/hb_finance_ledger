import { query } from "@/lib/db/postgres";
import { getAccountDisplayName } from "@/lib/account-display-name";
import { formatDisplayDateTime } from "@/lib/format";
import { currentKstMonthValue } from "@/lib/kst-date";
import type { AccountBalance, TransactionRow } from "@/features/overview/types";
import type { OverviewSource } from "@/features/overview/model";

interface BalanceRow {
  account_type: "assets" | "liabilities";
  total: string;
}

interface SyncRow {
  entry_count: string;
  synced_at: Date;
  latest_month: string | null;
}

interface DailyRow {
  day: number;
  amount: string;
}

interface CategoryRow {
  name: string;
  amount: string;
}

interface ExpenseCategoryRow {
  category: string;
  amount: string;
}

interface AccountRow {
  account_id: string;
  account_type: "assets" | "liabilities";
  name: string;
  type: "asset" | "liability";
  amount: string;
  detail: string;
}

interface TransactionDbRow {
  id: string;
  date_label: string;
  account: string;
  account_id: string;
  account_type: string;
  category: string;
  merchant: string;
  amount: string;
}

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

function numberValue(value: string | number) {
  return Number(value);
}

function formatMonth(yyyymm: string | null) {
  if (!yyyymm || yyyymm.length !== 6) {
    return {
      monthLabel: "최근 월",
      monthShortLabel: "이번 달",
    };
  }
  const year = yyyymm.slice(0, 4);
  const month = Number(yyyymm.slice(4, 6));
  return {
    monthLabel: `${year}년 ${month}월`,
    monthShortLabel: `${month}월`,
  };
}

async function getSyncState(targetMonth: number) {
  const result = await query<SyncRow>(
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
  const month = formatMonth(String(targetMonth));
  return {
    entryCount: Number(row?.entry_count ?? 0),
    ...month,
    asOf: row?.synced_at
      ? formatDisplayDateTime(row.synced_at)
      : "동기화 전",
  };
}

async function getBalanceSummary() {
  const result = await query<BalanceRow>(
    `
    with account_balances as (
      select
        a.account_type,
        a.account_id,
        sum(
          case
            when a.account_type = 'assets' and e.l_account = 'assets' and e.l_account_id = a.account_id then e.money
            when a.account_type = 'assets' and e.r_account = 'assets' and e.r_account_id = a.account_id then -e.money
            when a.account_type = 'liabilities' and e.l_account = 'liabilities' and e.l_account_id = a.account_id then -e.money
            when a.account_type = 'liabilities' and e.r_account = 'liabilities' and e.r_account_id = a.account_id then e.money
            else 0
          end
        ) as balance
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
      group by a.account_type, a.account_id
    )
    select account_type, coalesce(sum(balance), 0)::text as total
    from account_balances
    group by account_type
    `,
    [sectionId],
  );

  const assets = result.rows.find((row) => row.account_type === "assets");
  const liabilities = result.rows.find((row) => row.account_type === "liabilities");
  return {
    assetTotal: numberValue(assets?.total ?? 0),
    liabilityTotal: numberValue(liabilities?.total ?? 0),
  };
}

async function getDailyExpenses(targetMonth: number) {
  const result = await query<DailyRow>(
    `
    select (floor(e.entry_date)::int % 100) as day,
           sum(e.money)::text as amount
    from whooing.entries e
    where e.section_id = $1
      and e.l_account = 'expenses'
      and (floor(e.entry_date)::int / 100) = $2
    group by 1
    order by 1
    `,
    [sectionId, targetMonth],
  );
  return result.rows.map((row) => ({ day: row.day, amount: numberValue(row.amount) }));
}

async function getBaselineExpenses(targetMonth: number) {
  const result = await query<DailyRow>(
    `
    with monthly_day as (
      select (floor(e.entry_date)::int / 100) as ym,
             (floor(e.entry_date)::int % 100) as day,
             sum(e.money) as amount
      from whooing.entries e
      where e.section_id = $1
        and e.l_account = 'expenses'
        and (floor(e.entry_date)::int / 100) < $2
      group by 1, 2
    )
    select day, avg(amount)::text as amount
    from monthly_day
    group by day
    order by day
    `,
    [sectionId, targetMonth],
  );
  return result.rows.map((row) => ({ day: row.day, amount: Math.round(numberValue(row.amount)) }));
}

async function getCategories(targetMonth: number) {
  const result = await query<CategoryRow>(
    `
    select a.title as name, sum(e.money)::text as amount
    from whooing.entries e
    join whooing.accounts a
      on a.section_id = e.section_id
     and a.account_id = e.l_account_id
    where e.section_id = $1
      and e.l_account = 'expenses'
      and (floor(e.entry_date)::int / 100) = $2
    group by a.title
    order by sum(e.money) desc
    limit 5
    `,
    [sectionId, targetMonth],
  );
  return result.rows.map((row) => ({ name: row.name, amount: numberValue(row.amount) }));
}

async function getCurrentExpenseByCategory(targetMonth: number) {
  const result = await query<ExpenseCategoryRow>(
    `
    select coalesce(a.category, 'normal') as category,
           sum(e.money)::text as amount
    from whooing.entries e
    join whooing.accounts a
      on a.section_id = e.section_id
     and a.account_id = e.l_account_id
     and a.account_type = e.l_account
    where e.section_id = $1
      and e.l_account = 'expenses'
      and a.item_type = 'account'
      and (floor(e.entry_date)::int / 100) = $2
    group by coalesce(a.category, 'normal')
    `,
    [sectionId, targetMonth],
  );
  return result.rows.map((row) => ({ category: row.category, amount: numberValue(row.amount) }));
}

async function getKeyAccounts(): Promise<AccountBalance[]> {
  const result = await query<AccountRow>(
    `
    with account_balances as (
      select
        a.account_id,
        a.account_type,
        a.title as name,
        case when a.account_type = 'assets' then 'asset' else 'liability' end as type,
        a.category,
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
      group by a.account_id, a.account_type, a.title, a.category
    )
    select name,
           account_id,
           account_type,
           type,
           amount::text,
           coalesce(category, 'normal') as detail
    from account_balances
    where amount <> 0
    order by abs(amount) desc
    limit 5
    `,
    [sectionId],
  );
  return result.rows.map((row) => ({
    name: getAccountDisplayName(row.account_type, row.account_id, row.name),
    type: row.type,
    amount: Math.abs(numberValue(row.amount)),
    detail: row.detail,
  }));
}

async function getRecentTransactions(): Promise<TransactionRow[]> {
  const result = await query<TransactionDbRow>(
    `
    select e.entry_id::text as id,
           to_char(to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'), 'YYYY.MM.DD') as date_label,
           coalesce(pay.title, e.r_account_id) as account,
           e.r_account_id as account_id,
           e.r_account as account_type,
           coalesce(exp.title, e.l_account_id) as category,
           e.item as merchant,
           e.money::text as amount
    from whooing.entries e
    left join whooing.accounts exp
      on exp.section_id = e.section_id
     and exp.account_id = e.l_account_id
    left join whooing.accounts pay
      on pay.section_id = e.section_id
     and pay.account_id = e.r_account_id
    where e.section_id = $1
      and e.l_account = 'expenses'
    order by e.entry_date desc
    limit 5
    `,
    [sectionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    date: row.date_label,
    account: getAccountDisplayName(row.account_type, row.account_id, row.account),
    category: row.category,
    merchant: row.merchant || "후잉 거래",
    amount: numberValue(row.amount),
    status: "posted",
  }));
}

export async function getWhooingOverviewSource(): Promise<OverviewSource> {
  const targetMonth = Number(currentKstMonthValue().replace("-", ""));
  const [
    sync,
    balances,
    dailyExpenses,
    baseline,
    categories,
    currentExpenseByCategory,
    accounts,
    transactions,
  ] = await Promise.all([
    getSyncState(targetMonth),
    getBalanceSummary(),
    getDailyExpenses(targetMonth),
    getBaselineExpenses(targetMonth),
    getCategories(targetMonth),
    getCurrentExpenseByCategory(targetMonth),
    getKeyAccounts(),
    getRecentTransactions(),
  ]);

  return {
    asOf: sync.asOf,
    entryCount: sync.entryCount,
    assetTotal: balances.assetTotal,
    liabilityTotal: balances.liabilityTotal,
    monthLabel: sync.monthLabel,
    monthShortLabel: sync.monthShortLabel,
    dailyExpenses,
    baseline,
    categories,
    currentExpenseByCategory,
    accounts,
    transactions,
  };
}
