import { query } from "@/lib/db/postgres";
import { strictFixedCandidatePolicy } from "@/lib/financial-analysis/fixed-expense-schedule";
import type { ResolvedPeriod } from "@/lib/period-filter";

export interface MlSeriesPoint {
  ds: string;
  y: number;
}

export interface MlFixedProfilePoint {
  due_day: number;
  avg_amount: number;
}

export interface WhooingForecastTaskSource {
  today: string;
  predictionLength: number;
  series: MlSeriesPoint[];
  actual: MlSeriesPoint[];
  fixedProfile: MlFixedProfilePoint[];
}

export interface MlAnomalyFeatureRow {
  transaction_date: string;
  day_of_month: number;
  day_of_week: number;
  is_weekend: number;
  is_holiday: number;
  parent_category: string;
  description: string;
  amount: number;
}

interface SeriesRow {
  ds: string;
  y: string;
}

interface FixedProfileRow {
  due_day: number;
  avg_amount: string;
}

interface AnomalyFeatureDbRow {
  transaction_date: string;
  day_of_month: string;
  day_of_week: string;
  is_weekend: string;
  parent_category: string;
  description: string | null;
  amount: string;
}

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";
const fixedProfilePolicy = strictFixedCandidatePolicy;

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysInMonth(today: string) {
  const [year, month] = today.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export async function getWhooingForecastTaskSource(today = todayKst()): Promise<WhooingForecastTaskSource> {
  const [series, actual, fixedProfile] = await Promise.all([
    query<SeriesRow>(
      `
      select to_char(to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'), 'YYYY-MM-DD') as ds,
             sum(e.money)::text as y
      from whooing.entries e
      join whooing.accounts a
        on a.section_id = e.section_id
       and a.account_id = e.l_account_id
      where e.section_id = $1
        and e.l_account = 'expenses'
        and a.item_type = 'account'
        and coalesce(a.category, 'normal') <> 'steady'
        and e.money < 1000000
        and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') >= (to_date($2, 'YYYY-MM-DD') - interval '12 months')
        and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') <= to_date($2, 'YYYY-MM-DD')
      group by 1
      order by 1
      `,
      [sectionId, today],
    ),
    query<SeriesRow>(
      `
      select to_char(to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'), 'YYYY-MM-DD') as ds,
             sum(e.money)::text as y
      from whooing.entries e
      where e.section_id = $1
        and e.l_account = 'expenses'
        and (floor(e.entry_date)::int / 100) = (replace($2, '-', '')::int / 100)
        and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') <= to_date($2, 'YYYY-MM-DD')
      group by 1
      order by 1
      `,
      [sectionId, today],
    ),
    query<FixedProfileRow>(
      `
      with fixed_base as (
        select floor(e.entry_date)::int % 100 as day_of_month,
               floor(e.entry_date)::int / 100 as ym,
               e.money,
               a.account_id,
               coalesce(nullif(trim(e.item), ''), a.title) as item_key,
               round(e.money / 10000.0) * 10000 as amount_bucket
        from whooing.entries e
        join whooing.accounts a
          on a.section_id = e.section_id
         and a.account_id = e.l_account_id
        where e.section_id = $1
          and e.l_account = 'expenses'
          and a.item_type = 'account'
          and a.category = 'steady'
          and e.money between $3 and $4
          and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') >= (to_date($2, 'YYYY-MM-DD') - ($5::int * interval '1 month'))
          and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') <= to_date($2, 'YYYY-MM-DD')
      ),
      learned_fixed as (
        select percentile_cont(0.5) within group (order by day_of_month)::int as due_day,
               round(avg(money))::text as avg_amount,
               count(*) as tx_count,
               count(distinct ym) as months_seen,
               min(day_of_month) as min_day,
               max(day_of_month) as max_day
        from fixed_base
        group by account_id, lower(item_key), amount_bucket
      )
      select due_day, avg_amount
      from learned_fixed
      where tx_count >= $6
        and months_seen >= $7
        and max_day - min_day <= $8
      order by due_day
      `,
      [
        sectionId,
        today,
        fixedProfilePolicy.minAmount,
        fixedProfilePolicy.maxAmount,
        fixedProfilePolicy.lookbackMonths,
        fixedProfilePolicy.minTransactionCount,
        fixedProfilePolicy.minMonthsSeen,
        fixedProfilePolicy.maxDaySpread,
      ],
    ),
  ]);

  return {
    today,
    predictionLength: daysInMonth(today),
    series: series.rows.map((row) => ({ ds: row.ds, y: numberValue(row.y) })),
    actual: actual.rows.map((row) => ({ ds: row.ds, y: numberValue(row.y) })),
    fixedProfile: fixedProfile.rows.map((row) => ({
      due_day: row.due_day,
      avg_amount: Math.round(numberValue(row.avg_amount)),
    })),
  };
}

export async function getWhooingAnomalyTaskRows(today = todayKst(), period?: ResolvedPeriod | null): Promise<MlAnomalyFeatureRow[]> {
  if (period) {
    const result = await query<AnomalyFeatureDbRow>(
      `
      select to_char(to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'), 'YYYY-MM-DD') as transaction_date,
             extract(day from to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'))::text as day_of_month,
             extract(isodow from to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'))::text as day_of_week,
             case when extract(isodow from to_date(floor(e.entry_date)::int::text, 'YYYYMMDD')) in (6, 7) then '1' else '0' end as is_weekend,
             coalesce(a.title, '미분류') as parent_category,
             coalesce(nullif(e.item, ''), '후잉 거래') as description,
             sum(e.money)::text as amount
      from whooing.entries e
      join whooing.accounts a
        on a.section_id = e.section_id
       and a.account_id = e.l_account_id
      where e.section_id = $1
        and e.l_account = 'expenses'
        and a.item_type = 'account'
        and coalesce(a.category, 'normal') <> 'steady'
        and ($2::int is null or e.entry_date >= $2)
        and ($3::int is null or e.entry_date < $3)
      group by 1, 2, 3, 4, 5, 6
      order by 1
      `,
      [sectionId, period.startDate, period.endDate],
    );

    return result.rows.map((row) => ({
      transaction_date: row.transaction_date,
      day_of_month: numberValue(row.day_of_month),
      day_of_week: numberValue(row.day_of_week),
      is_weekend: numberValue(row.is_weekend),
      is_holiday: 0,
      parent_category: row.parent_category,
      description: row.description || "후잉 거래",
      amount: numberValue(row.amount),
    }));
  }

  const result = await query<AnomalyFeatureDbRow>(
    `
    select to_char(to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'), 'YYYY-MM-DD') as transaction_date,
           extract(day from to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'))::text as day_of_month,
           extract(isodow from to_date(floor(e.entry_date)::int::text, 'YYYYMMDD'))::text as day_of_week,
           case when extract(isodow from to_date(floor(e.entry_date)::int::text, 'YYYYMMDD')) in (6, 7) then '1' else '0' end as is_weekend,
           coalesce(a.title, '미분류') as parent_category,
           coalesce(nullif(e.item, ''), '후잉 거래') as description,
           sum(e.money)::text as amount
    from whooing.entries e
    join whooing.accounts a
      on a.section_id = e.section_id
     and a.account_id = e.l_account_id
    where e.section_id = $1
      and e.l_account = 'expenses'
      and a.item_type = 'account'
      and coalesce(a.category, 'normal') <> 'steady'
      and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') >= (to_date($2, 'YYYY-MM-DD') - interval '180 days')
      and to_date(floor(e.entry_date)::int::text, 'YYYYMMDD') <= to_date($2, 'YYYY-MM-DD')
    group by 1, 2, 3, 4, 5, 6
    order by 1
    `,
    [sectionId, today],
  );

  return result.rows.map((row) => ({
    transaction_date: row.transaction_date,
    day_of_month: numberValue(row.day_of_month),
    day_of_week: numberValue(row.day_of_week),
    is_weekend: numberValue(row.is_weekend),
    is_holiday: 0,
    parent_category: row.parent_category,
    description: row.description || "후잉 거래",
    amount: numberValue(row.amount),
  }));
}
