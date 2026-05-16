import { query } from "@/lib/db/postgres";
import type { ResolvedPeriod } from "@/lib/period-filter";

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

interface ProfitLossDbRow {
  ym: string;
  income: string;
  expenses: string;
  profit_loss: string;
}

interface AccountingMonthDbRow {
  ym: string;
}

interface CashFlowDbRow {
  key: string;
  tx_count: string;
  amount: string;
  net_cash_flow: string;
}

interface AssetDeltaDbRow {
  account_id: string;
  title: string;
  inflow: string;
  outflow: string;
  net_delta: string;
  tx_count: string;
  last_date: string | null;
}

interface LiabilityDeltaDbRow {
  account_id: string;
  title: string;
  liability_increase: string;
  liability_decrease: string;
  net_delta: string;
  tx_count: string;
  last_date: string | null;
}

interface KindDistributionDbRow {
  l_account: string;
  r_account: string;
  tx_count: string;
  amount: string;
}

interface DrillDownEntryDbRow {
  entry_id: string;
  entry_date: string;
  item: string | null;
  money: string;
  memo: string | null;
  flow_key: string;
  l_account: string;
  l_account_id: string;
  l_account_title: string | null;
  r_account: string;
  r_account_id: string;
  r_account_title: string | null;
}

function money(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0));
}

function formatMonthLabel(yyyymm: string) {
  if (!/^\d{6}$/.test(yyyymm)) return yyyymm;
  return `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;
}

function formatMonthValue(yyyymm: string) {
  if (!/^\d{6}$/.test(yyyymm)) return yyyymm;
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

export async function getAvailableAccountingMonths() {
  const result = await query<AccountingMonthDbRow>(
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
    value: formatMonthValue(row.ym),
    label: formatMonthLabel(row.ym),
  }));
}

export async function getAccountingProfitLossRows(period: ResolvedPeriod) {
  const result = await query<ProfitLossDbRow>(
    `
    with monthly as (
      select (floor(entry_date)::int / 100)::text as ym,
             sum(case when r_account = 'income' then money else 0 end) as income,
             sum(case when l_account = 'expenses' then money else 0 end) as expenses
      from whooing.entries
      where section_id = $1
        and ($2::int is null or entry_date >= $2)
        and ($3::int is null or entry_date < $3)
      group by 1
    )
    select ym,
           income::text,
           expenses::text,
           (income - expenses)::text as profit_loss
    from monthly
    order by ym desc
    `,
    [sectionId, period.startDate, period.endDate],
  );

  return result.rows.map((row) => ({
    ym: row.ym,
    income: money(row.income),
    expenses: money(row.expenses),
    profitLoss: money(row.profit_loss),
  }));
}

export async function getAccountingCashFlowRows(period: ResolvedPeriod) {
  const result = await query<CashFlowDbRow>(
    `
    with classified as (
      select
        case
          when l_account = 'assets' and r_account = 'income' then 'income_inflow'
          when l_account = 'expenses' and r_account = 'assets' then 'direct_expense_outflow'
          when l_account = 'liabilities' and r_account = 'assets' then 'liability_payment_outflow'
          when l_account = 'assets' and r_account = 'liabilities' then 'debt_financing_inflow'
          when l_account = 'assets' and r_account = 'assets' then 'internal_transfer'
          when l_account = 'capital' or r_account = 'capital' then 'capital_adjustment'
          else 'other'
        end as flow_key,
        money,
        l_account,
        r_account
      from whooing.entries
      where section_id = $1
        and ($2::int is null or entry_date >= $2)
        and ($3::int is null or entry_date < $3)
    ),
    rollup as (
      select
        flow_key as key,
        count(*)::text as tx_count,
        sum(money)::text as amount,
        sum(
          case
            when l_account = 'assets' and r_account = 'income' then money
            when l_account = 'assets' and r_account = 'liabilities' then money
            when l_account = 'expenses' and r_account = 'assets' then -money
            when l_account = 'liabilities' and r_account = 'assets' then -money
            else 0
          end
        )::text as net_cash_flow
      from classified
      group by flow_key
    )
    select key, tx_count, amount, net_cash_flow
    from rollup
    order by
      case key
        when 'income_inflow' then 1
        when 'direct_expense_outflow' then 2
        when 'liability_payment_outflow' then 3
        when 'debt_financing_inflow' then 4
        when 'internal_transfer' then 5
        when 'capital_adjustment' then 6
        else 7
      end
    `,
    [sectionId, period.startDate, period.endDate],
  );

  return result.rows.map((row) => ({
    key: row.key,
    txCount: Number(row.tx_count),
    amount: money(row.amount),
    netCashFlow: money(row.net_cash_flow),
  }));
}

export async function getAccountingAssetDeltaRows(period: ResolvedPeriod) {
  const result = await query<AssetDeltaDbRow>(
    `
    select
      a.account_id,
      a.title,
      sum(case when e.l_account = 'assets' and e.l_account_id = a.account_id then e.money else 0 end)::text as inflow,
      sum(case when e.r_account = 'assets' and e.r_account_id = a.account_id then e.money else 0 end)::text as outflow,
      (
        sum(case when e.l_account = 'assets' and e.l_account_id = a.account_id then e.money else 0 end)
        - sum(case when e.r_account = 'assets' and e.r_account_id = a.account_id then e.money else 0 end)
      )::text as net_delta,
      count(e.entry_id) filter (
        where (e.l_account = 'assets' and e.l_account_id = a.account_id)
           or (e.r_account = 'assets' and e.r_account_id = a.account_id)
      )::text as tx_count,
      max(floor(e.entry_date)) filter (
        where (e.l_account = 'assets' and e.l_account_id = a.account_id)
           or (e.r_account = 'assets' and e.r_account_id = a.account_id)
      )::text as last_date
    from whooing.accounts a
    left join whooing.entries e
      on e.section_id = a.section_id
     and ($2::int is null or e.entry_date >= $2)
     and ($3::int is null or e.entry_date < $3)
     and (
        (e.l_account = 'assets' and e.l_account_id = a.account_id)
        or (e.r_account = 'assets' and e.r_account_id = a.account_id)
     )
    where a.section_id = $1
      and a.account_type = 'assets'
      and a.item_type = 'account'
    group by a.account_id, a.title
    having
      sum(case when e.l_account = 'assets' and e.l_account_id = a.account_id then e.money else 0 end) <> 0
      or sum(case when e.r_account = 'assets' and e.r_account_id = a.account_id then e.money else 0 end) <> 0
    order by abs(
      sum(case when e.l_account = 'assets' and e.l_account_id = a.account_id then e.money else 0 end)
      - sum(case when e.r_account = 'assets' and e.r_account_id = a.account_id then e.money else 0 end)
    ) desc
    limit 20
    `,
    [sectionId, period.startDate, period.endDate],
  );

  return result.rows.map((row) => ({
    accountId: row.account_id,
    title: row.title,
    inflow: money(row.inflow),
    outflow: money(row.outflow),
    netDelta: money(row.net_delta),
    txCount: Number(row.tx_count),
    lastDate: row.last_date ?? "-",
  }));
}

export async function getAccountingLiabilityDeltaRows(period: ResolvedPeriod) {
  const result = await query<LiabilityDeltaDbRow>(
    `
    select
      a.account_id,
      a.title,
      sum(case when e.r_account = 'liabilities' and e.r_account_id = a.account_id then e.money else 0 end)::text as liability_increase,
      sum(case when e.l_account = 'liabilities' and e.l_account_id = a.account_id then e.money else 0 end)::text as liability_decrease,
      (
        sum(case when e.r_account = 'liabilities' and e.r_account_id = a.account_id then e.money else 0 end)
        - sum(case when e.l_account = 'liabilities' and e.l_account_id = a.account_id then e.money else 0 end)
      )::text as net_delta,
      count(e.entry_id) filter (
        where (e.l_account = 'liabilities' and e.l_account_id = a.account_id)
           or (e.r_account = 'liabilities' and e.r_account_id = a.account_id)
      )::text as tx_count,
      max(floor(e.entry_date)) filter (
        where (e.l_account = 'liabilities' and e.l_account_id = a.account_id)
           or (e.r_account = 'liabilities' and e.r_account_id = a.account_id)
      )::text as last_date
    from whooing.accounts a
    left join whooing.entries e
      on e.section_id = a.section_id
     and ($2::int is null or e.entry_date >= $2)
     and ($3::int is null or e.entry_date < $3)
     and (
        (e.l_account = 'liabilities' and e.l_account_id = a.account_id)
        or (e.r_account = 'liabilities' and e.r_account_id = a.account_id)
     )
    where a.section_id = $1
      and a.account_type = 'liabilities'
      and a.item_type = 'account'
    group by a.account_id, a.title
    having
      sum(case when e.r_account = 'liabilities' and e.r_account_id = a.account_id then e.money else 0 end) <> 0
      or sum(case when e.l_account = 'liabilities' and e.l_account_id = a.account_id then e.money else 0 end) <> 0
    order by abs(
      sum(case when e.r_account = 'liabilities' and e.r_account_id = a.account_id then e.money else 0 end)
      - sum(case when e.l_account = 'liabilities' and e.l_account_id = a.account_id then e.money else 0 end)
    ) desc
    limit 20
    `,
    [sectionId, period.startDate, period.endDate],
  );

  return result.rows.map((row) => ({
    accountId: row.account_id,
    title: row.title,
    liabilityIncrease: money(row.liability_increase),
    liabilityDecrease: money(row.liability_decrease),
    netDelta: money(row.net_delta),
    txCount: Number(row.tx_count),
    lastDate: row.last_date ?? "-",
  }));
}

export async function getAccountingKindDistributionRows(period: ResolvedPeriod) {
  const result = await query<KindDistributionDbRow>(
    `
    select l_account,
           r_account,
           count(*)::text as tx_count,
           sum(money)::text as amount
    from whooing.entries
    where section_id = $1
      and ($2::int is null or entry_date >= $2)
      and ($3::int is null or entry_date < $3)
    group by l_account, r_account
    order by count(*) desc, l_account, r_account
    `,
    [sectionId, period.startDate, period.endDate],
  );

  return result.rows.map((row) => ({
    lAccount: row.l_account,
    rAccount: row.r_account,
    txCount: Number(row.tx_count),
    amount: money(row.amount),
  }));
}

export async function getAccountingDrillDownEntries(period: ResolvedPeriod) {
  const result = await query<DrillDownEntryDbRow>(
    `
    select
      e.entry_id,
      floor(e.entry_date)::text as entry_date,
      e.item,
      e.money::text,
      e.memo,
      case
        when e.l_account = 'assets' and e.r_account = 'income' then 'income_inflow'
        when e.l_account = 'expenses' and e.r_account = 'assets' then 'direct_expense_outflow'
        when e.l_account = 'liabilities' and e.r_account = 'assets' then 'liability_payment_outflow'
        when e.l_account = 'assets' and e.r_account = 'liabilities' then 'debt_financing_inflow'
        when e.l_account = 'assets' and e.r_account = 'assets' then 'internal_transfer'
        when e.l_account = 'capital' or e.r_account = 'capital' then 'capital_adjustment'
        else 'other'
      end as flow_key,
      e.l_account,
      e.l_account_id,
      la.title as l_account_title,
      e.r_account,
      e.r_account_id,
      ra.title as r_account_title
    from whooing.entries e
    left join whooing.accounts la
      on la.section_id = e.section_id
     and la.account_type = e.l_account
     and la.account_id = e.l_account_id
    left join whooing.accounts ra
      on ra.section_id = e.section_id
     and ra.account_type = e.r_account
     and ra.account_id = e.r_account_id
    where e.section_id = $1
      and ($2::int is null or e.entry_date >= $2)
      and ($3::int is null or e.entry_date < $3)
    order by e.entry_date desc, e.entry_id desc
    limit 500
    `,
    [sectionId, period.startDate, period.endDate],
  );

  return result.rows.map((row) => ({
    entryId: row.entry_id,
    entryDate: row.entry_date,
    item: row.item ?? "-",
    money: money(row.money),
    memo: row.memo ?? "",
    flowKey: row.flow_key,
    lAccount: row.l_account,
    lAccountId: row.l_account_id,
    lAccountTitle: row.l_account_title ?? row.l_account_id,
    rAccount: row.r_account,
    rAccountId: row.r_account_id,
    rAccountTitle: row.r_account_title ?? row.r_account_id,
  }));
}
