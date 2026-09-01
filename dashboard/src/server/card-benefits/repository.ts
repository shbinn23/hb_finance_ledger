import { randomUUID } from "node:crypto";
import { query } from "@/lib/db/postgres";
import { getAccountDisplayName } from "@/lib/account-display-name";
import { formatDisplayDate } from "@/lib/format";
import { currentKstMonthValue } from "@/lib/kst-date";
import {
  buildCardBillPaymentRows,
  type CardBillPaymentRow,
  type CardBillRecommendedAccount,
  type CardBillRepaymentMatch,
  type CardBillRow,
} from "@/lib/card-benefits/card-bill-payment";
import {
  calculateBenefitCapStatus,
  calculateCardPerformanceEstimate,
  calculateCardStatementEstimate,
  savingRate,
  type BenefitCapAutoStatus,
  type CardStatementEstimate,
} from "@/lib/card-benefits/assets-summary";
import { getWhooingCreditCardBillRows } from "@/server/whooing/bill-repository";
import type {
  CardBenefitRule,
  PaymentChannel,
} from "@/lib/card-benefits/types";
import {
  entryDateRangeForBenefitMonth,
  monthlyContextFromAutomaticPerformance,
} from "./repository-helpers";
import { resolveMonthlyCap } from "@/lib/card-benefits/evaluator";

type RuleStatus = CardBenefitRule["status"];
type DiscountType = CardBenefitRule["discountType"];
type PostingPolicy = CardBenefitRule["postingPolicy"];
const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

interface CardBenefitRuleDbRow {
  rule_id: string;
  card_account_type: "liabilities";
  card_account_id: string;
  name: string;
  status: RuleStatus;
  priority: number;
  payment_channel: PaymentChannel | null;
  min_approval_amount: string | number | null;
  discount_type: DiscountType;
  discount_rate_bps: number;
  monthly_cap_tiers: unknown;
  performance_policy: unknown;
  posting_policy: PostingPolicy;
}

interface CapUsageDbRow {
  rule_id: string;
  amount: string | number | null;
}

interface PerformanceAmountDbRow {
  amount: string | number | null;
}

interface CardBenefitMonthlySummaryDbRow {
  event_count: string | number;
  approval_total: string | number | null;
  discount_total: string | number | null;
  posting_total: string | number | null;
  unlinked_event_count: string | number;
}

interface CardBenefitRuleSummaryDbRow {
  rule_id: string;
  rule_name: string;
  discount_amount: string | number | null;
  event_count: string | number;
}

interface CardBenefitCardSummaryDbRow {
  card_account_type: "liabilities";
  card_account_id: string;
  card_title: string;
  discount_amount: string | number | null;
  event_count: string | number;
}

interface CardBenefitRecentEventDbRow {
  event_id: string;
  entry_date: number;
  card_account_type: "liabilities";
  card_account_id: string;
  card_title: string;
  rule_name: string | null;
  merchant: string | null;
  approval_amount: string | number;
  applied_discount_amount: string | number;
  posting_amount: string | number;
}

interface CardBenefitCapStatusDbRow {
  rule_id: string;
  rule_name: string;
  card_account_type: "liabilities";
  card_account_id: string;
  card_title: string;
  monthly_cap_tiers: unknown;
  previous_performance_amount: string | number | null;
  event_discount_amount: string | number | null;
  backfilled_discount_amount: string | number | null;
}

interface CardStatementEstimateDbRow {
  card_account_type: "liabilities";
  card_account_id: string;
  card_title: string;
  structured_approval_total: string | number | null;
  structured_performance_total: string | number | null;
  structured_posting_total: string | number | null;
  structured_discount_total: string | number | null;
  legacy_posting_total: string | number | null;
  structured_count: string | number;
  legacy_count: string | number;
}

interface CreditCardTitleDbRow {
  account_id: string;
  title: string;
}

interface RecommendedRepaymentAccountDbRow {
  card_account_id: string;
  asset_account_id: string;
  asset_title: string;
}

interface RepaymentMatchDbRow {
  card_account_id: string;
  bill_amount: string | number;
  match_count: string | number;
}

interface AccountExistsDbRow {
  exists: boolean;
}

interface DuplicateRepaymentDbRow {
  match_count: string | number;
}

export interface CardBenefitRuleSummary {
  ruleId: string;
  ruleName: string;
  discountAmount: number;
  eventCount: number;
}

export interface CardBenefitCardSummary {
  cardAccountType: "liabilities";
  cardAccountId: string;
  cardName: string;
  discountAmount: number;
  eventCount: number;
}

export interface CardBenefitRecentEvent {
  eventId: string;
  date: string;
  cardName: string;
  ruleName: string;
  merchant: string;
  approvalAmount: number;
  discountAmount: number;
  postingAmount: number;
}

export interface CardBenefitCapStatus {
  ruleId: string;
  ruleName: string;
  cardName: string;
  previousMonthPerformanceAmount: number;
  autoStatus: BenefitCapAutoStatus;
  autoMonthlyCapAmount: number | null;
  eventDiscountAmount: number;
  backfilledDiscountAmount: number;
  totalUsed: number;
  remainingCap: number | null;
  usageRate: number | null;
}

export interface CardStatementEstimateRow extends CardStatementEstimate {
  cardAccountType: "liabilities";
  cardAccountId: string;
  cardName: string;
  structuredPerformanceTotal: number;
  performanceEstimate: number;
  structuredCount: number;
  legacyCount: number;
}

export interface CardBenefitAssetsSummary {
  month: string;
  monthLabel: string;
  eventCount: number;
  approvalTotal: number;
  discountTotal: number;
  postingTotal: number;
  effectiveSavingRate: number;
  unlinkedEventCount: number;
  ruleDiscounts: CardBenefitRuleSummary[];
  cardDiscounts: CardBenefitCardSummary[];
  capStatuses: CardBenefitCapStatus[];
  cardBillPayments: CardBillPaymentRow[];
  recentEvents: CardBenefitRecentEvent[];
  statementEstimates: CardStatementEstimateRow[];
}

export interface CardBenefitEventInsert {
  eventId?: string;
  sectionId?: string | null;
  whooingEntryId?: number | null;
  entryDate: number;
  ruleId: string | null;
  cardAccountType: "liabilities";
  cardAccountId: string;
  expenseAccountId?: string | null;
  merchant: string;
  paymentChannel: PaymentChannel;
  approvalAmount: number;
  performanceAmount: number;
  eligibleDiscountAmount: number;
  appliedDiscountAmount: number;
  postingAmount: number;
  capUsedBefore: number | null;
  capUsedAfter: number | null;
  evaluationStatus: string;
  evaluationReason: string;
  idempotencyKey?: string | null;
}

function numberFromDb(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function monthNumberFromValue(month: string | null | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  return Number(month.replace("-", ""));
}

function monthLabel(month: string) {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

function previousBenefitMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  const previousYear = monthIndex === 1 ? year - 1 : year;
  const previousMonth = monthIndex === 1 ? 12 : monthIndex - 1;
  return `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
}

async function resolveBenefitMonth(month?: string | null) {
  const requested = monthNumberFromValue(month);
  if (requested) return `${String(requested).slice(0, 4)}-${String(requested).slice(4, 6)}`;

  const result = await query<{ ym: string | null }>(
    `
    select coalesce(
      (select (floor(max(entry_date))::int / 100)::text from app.card_benefit_events),
      (select (floor(max(entry_date))::int / 100)::text from whooing.entries where section_id = $1)
    ) as ym
    `,
    [sectionId],
  );
  const ym = result.rows[0]?.ym;
  if (!ym || ym.length !== 6) return "";
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
}

function displayCardName(accountType: string, accountId: string, sourceTitle: string) {
  return getAccountDisplayName(accountType, accountId, sourceTitle);
}

async function getCardBillPayments(): Promise<CardBillPaymentRow[]> {
  const billMonth = currentKstMonthValue();
  const { startDate, endDate } = entryDateRangeForBenefitMonth(billMonth);
  const [
    billRows,
    cardTitles,
    recommendedAccounts,
    repaymentMatches,
  ] = await Promise.all([
    getWhooingCreditCardBillRows(billMonth),
    query<CreditCardTitleDbRow>(
      `
      select account_id, title
      from whooing.accounts
      where section_id = $1
        and account_type = 'liabilities'
        and item_type = 'account'
        and category = 'creditcard'
      `,
      [sectionId],
    ),
    query<RecommendedRepaymentAccountDbRow>(
      `
      with ranked as (
        select
          e.l_account_id as card_account_id,
          e.r_account_id as asset_account_id,
          coalesce(a.title, e.r_account_id) as asset_title,
          row_number() over (
            partition by e.l_account_id
            order by floor(e.entry_date) desc, e.entry_id desc
          ) as rn
        from whooing.entries e
        join whooing.accounts c
          on c.section_id = e.section_id
         and c.account_type = 'liabilities'
         and c.account_id = e.l_account_id
         and c.category = 'creditcard'
        left join whooing.accounts a
          on a.section_id = e.section_id
         and a.account_type = 'assets'
         and a.account_id = e.r_account_id
        where e.section_id = $1
          and e.l_account = 'liabilities'
          and e.r_account = 'assets'
      )
      select card_account_id, asset_account_id, asset_title
      from ranked
      where rn = 1
      `,
      [sectionId],
    ),
    query<RepaymentMatchDbRow>(
      `
      select
        e.l_account_id as card_account_id,
        e.money::text as bill_amount,
        count(*)::text as match_count
      from whooing.entries e
      join whooing.accounts c
        on c.section_id = e.section_id
       and c.account_type = 'liabilities'
       and c.account_id = e.l_account_id
       and c.category = 'creditcard'
      where e.section_id = $1
        and e.l_account = 'liabilities'
        and e.r_account = 'assets'
        and e.entry_date >= $2
        and e.entry_date < $3
        and (
          e.item in ('카드대금 상환', '카드정산 결제')
          or e.item like '%상환%'
          or e.item like '%정산%'
        )
      group by e.l_account_id, e.money
      `,
      [sectionId, startDate, endDate],
    ),
  ]);

  const titleByCard = new Map(cardTitles.rows.map((row) => [row.account_id, row.title]));
  const mappedBillRows: CardBillRow[] = billRows.map((bill) => {
    const sourceTitle = titleByCard.get(bill.accountId) ?? bill.accountId;
    return {
      cardAccountId: bill.accountId,
      cardName: displayCardName("liabilities", bill.accountId, sourceTitle),
      billAmount: bill.amount,
      useStartDate: bill.startUseDate,
      useEndDate: bill.endUseDate,
      payDate: bill.payDate,
    };
  });
  const mappedRecommendations: CardBillRecommendedAccount[] = recommendedAccounts.rows.map((row) => ({
    cardAccountId: row.card_account_id,
    assetAccountId: row.asset_account_id,
    assetName: displayCardName("assets", row.asset_account_id, row.asset_title),
  }));
  const mappedMatches: CardBillRepaymentMatch[] = repaymentMatches.rows.map((row) => ({
    cardAccountId: row.card_account_id,
    billAmount: numberFromDb(row.bill_amount),
    matchCount: Number(row.match_count),
  }));

  return buildCardBillPaymentRows({
    billMonth,
    billRows: mappedBillRows,
    recommendedAccounts: mappedRecommendations,
    repaymentMatches: mappedMatches,
  });
}

export async function assetAccountExists(assetAccountId: string) {
  const result = await query<AccountExistsDbRow>(
    `
    select exists (
      select 1
      from whooing.accounts
      where section_id = $1
        and account_type = 'assets'
        and item_type = 'account'
        and account_id = $2
    ) as exists
    `,
    [sectionId, assetAccountId],
  );

  return Boolean(result.rows[0]?.exists);
}

export async function creditCardAccountExists(cardAccountId: string) {
  const result = await query<AccountExistsDbRow>(
    `
    select exists (
      select 1
      from whooing.accounts
      where section_id = $1
        and account_type = 'liabilities'
        and item_type = 'account'
        and category = 'creditcard'
        and account_id = $2
    ) as exists
    `,
    [sectionId, cardAccountId],
  );

  return Boolean(result.rows[0]?.exists);
}

export async function countCardBillRepaymentMatches({
  billMonth,
  cardAccountId,
  amount,
}: {
  billMonth: string;
  cardAccountId: string;
  amount: number;
}) {
  const { startDate, endDate } = entryDateRangeForBenefitMonth(billMonth);
  const result = await query<DuplicateRepaymentDbRow>(
    `
    select count(*)::text as match_count
    from whooing.entries
    where section_id = $1
      and l_account = 'liabilities'
      and l_account_id = $2
      and r_account = 'assets'
      and entry_date >= $3
      and entry_date < $4
      and money = $5
      and (
        item in ('카드대금 상환', '카드정산 결제')
        or item like '%상환%'
        or item like '%정산%'
        or memo like '%[CARD_BILL]%'
      )
    `,
    [sectionId, cardAccountId, startDate, endDate, amount],
  );

  return Number(result.rows[0]?.match_count ?? 0);
}

function monthlyCapTiersFromDb(value: unknown): CardBenefitRule["monthlyCapTiers"] {
  if (Array.isArray(value)) {
    return value.map((item) => ({
      performanceThreshold: numberFromDb((item as { performanceThreshold?: unknown }).performanceThreshold as number),
      monthlyCapAmount: numberFromDb((item as { monthlyCapAmount?: unknown }).monthlyCapAmount as number),
    }));
  }
  if (typeof value === "string") {
    return monthlyCapTiersFromDb(JSON.parse(value) as unknown);
  }

  return [];
}

function toRule(row: CardBenefitRuleDbRow): CardBenefitRule {
  const performancePolicy = typeof row.performance_policy === "string"
    ? JSON.parse(row.performance_policy) as { capUsageRuleId?: unknown }
    : row.performance_policy as { capUsageRuleId?: unknown } | null;
  return {
    ruleId: row.rule_id,
    cardAccountType: row.card_account_type,
    cardAccountId: row.card_account_id,
    name: row.name,
    status: row.status,
    priority: row.priority,
    paymentChannel: row.payment_channel,
    minApprovalAmount: row.min_approval_amount === null ? null : numberFromDb(row.min_approval_amount),
    discountType: row.discount_type,
    discountRateBps: row.discount_rate_bps,
    monthlyCapTiers: monthlyCapTiersFromDb(row.monthly_cap_tiers),
    capUsageRuleId: typeof performancePolicy?.capUsageRuleId === "string"
      ? performancePolicy.capUsageRuleId
      : null,
    postingPolicy: row.posting_policy,
  };
}

export async function getActiveCardBenefitRules(): Promise<CardBenefitRule[]> {
  const result = await query<CardBenefitRuleDbRow>(`
    select
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
    from app.card_benefit_rules
    where status = 'active'
    order by priority, rule_id
  `);

  return result.rows.map(toRule);
}

export async function getCapUsedByRule(benefitMonth: string) {
  const { startDate, endDate } = entryDateRangeForBenefitMonth(benefitMonth);
  const result = await query<CapUsageDbRow>(
    `
    select
      coalesce(nullif(r.performance_policy ->> 'capUsageRuleId', ''), e.rule_id) as rule_id,
      coalesce(sum(e.applied_discount_amount), 0) as amount
    from app.card_benefit_events e
    left join app.card_benefit_rules r on r.rule_id = e.rule_id
    where e.entry_date >= $1
      and e.entry_date < $2
      and e.rule_id is not null
    group by coalesce(nullif(r.performance_policy ->> 'capUsageRuleId', ''), e.rule_id)
    `,
    [startDate, endDate],
  );

  return Object.fromEntries(result.rows.map((row) => [row.rule_id, numberFromDb(row.amount)]));
}

async function getPreviousPerformanceEstimateAmount(benefitMonth: string, ruleId: string) {
  const previousMonth = previousBenefitMonth(benefitMonth);
  const { startDate, endDate } = entryDateRangeForBenefitMonth(previousMonth);
  const result = await query<PerformanceAmountDbRow>(
    `
    with selected_rule as (
      select card_account_type, card_account_id
      from app.card_benefit_rules
      where rule_id = $3
    ),
    structured as (
      select coalesce(sum(e.performance_amount), 0) as amount
      from app.card_benefit_events e
      join selected_rule r
        on r.card_account_type = e.card_account_type
       and r.card_account_id = e.card_account_id
      where e.entry_date >= $1
        and e.entry_date < $2
        and (e.section_id = $4 or e.section_id is null)
    ),
    legacy as (
      select coalesce(sum(e.money), 0) as amount
      from whooing.entries e
      join selected_rule r
        on r.card_account_type = e.r_account
       and r.card_account_id = e.r_account_id
      where e.section_id = $4
        and e.entry_date >= $1
        and e.entry_date < $2
        and e.l_account = 'expenses'
        and e.r_account = 'liabilities'
        and not exists (
          select 1
          from app.card_benefit_events be
          where be.whooing_entry_id = e.entry_id
            and (be.section_id = $4 or be.section_id is null)
        )
    )
    select structured.amount + legacy.amount as amount
    from structured cross join legacy
    `,
    [startDate, endDate, ruleId, sectionId],
  );

  return numberFromDb(result.rows[0]?.amount);
}

export async function getPreviousStructuredPerformanceAmount(benefitMonth: string, ruleId: string) {
  const previousMonth = previousBenefitMonth(benefitMonth);
  const { startDate, endDate } = entryDateRangeForBenefitMonth(previousMonth);
  const result = await query<PerformanceAmountDbRow>(
    `
    select coalesce(sum(e.performance_amount), 0) as amount
    from app.card_benefit_events e
    join app.card_benefit_rules r
      on r.rule_id = $3
     and r.card_account_type = e.card_account_type
     and r.card_account_id = e.card_account_id
    where e.entry_date >= $1
      and e.entry_date < $2
      and (e.section_id = $4 or e.section_id is null)
    `,
    [startDate, endDate, ruleId, sectionId],
  );
  return numberFromDb(result.rows[0]?.amount);
}

export async function validateCapLimitedImportDiscount(input: {
  occurredDate: string;
  ruleId: string;
  approvalAmount: number;
  discountAmount: number;
}) {
  const rules = await getActiveCardBenefitRules();
  const rule = rules.find((candidate) => candidate.ruleId === input.ruleId);
  if (!rule || rule.monthlyCapTiers.length === 0) return false;
  const benefitMonth = input.occurredDate.slice(0, 7);
  const performanceAmount = await getPreviousStructuredPerformanceAmount(benefitMonth, rule.ruleId);
  const monthlyCap = resolveMonthlyCap(rule.monthlyCapTiers, performanceAmount);
  if (monthlyCap === null) return false;
  const usageRuleId = rule.capUsageRuleId || rule.ruleId;
  const groupedRuleIds = rules
    .filter((candidate) => (candidate.capUsageRuleId || candidate.ruleId) === usageRuleId)
    .map((candidate) => candidate.ruleId);
  const occurredDate = Number(input.occurredDate.replaceAll("-", ""));
  const { startDate, endDate } = entryDateRangeForBenefitMonth(benefitMonth);
  const usage = await query<{ used_before: string; same_date_count: string }>(
    `
    select
      coalesce(sum(applied_discount_amount) filter (where entry_date < $2), 0)::text as used_before,
      count(*) filter (where entry_date = $2)::text as same_date_count
    from app.card_benefit_events
    where rule_id = any($1::text[])
      and entry_date >= $3
      and entry_date < $4
      and (section_id = $5 or section_id is null)
    `,
    [
      groupedRuleIds,
      occurredDate,
      startDate,
      endDate,
      sectionId,
    ],
  );
  if (Number(usage.rows[0]?.same_date_count ?? 0) > 0) return false;
  const remainingCap = Math.max(0, monthlyCap - numberFromDb(usage.rows[0]?.used_before));
  const theoreticalDiscount = Math.floor(input.approvalAmount * rule.discountRateBps / 10_000);
  return input.discountAmount === Math.min(theoreticalDiscount, remainingCap)
    && input.discountAmount === remainingCap;
}

export async function buildCardBenefitMonthlyContext(benefitMonth: string, ruleId: string) {
  const [performanceAmount, capUsedByRule] = await Promise.all([
    getPreviousPerformanceEstimateAmount(benefitMonth, ruleId),
    getCapUsedByRule(benefitMonth),
  ]);

  return monthlyContextFromAutomaticPerformance({ benefitMonth, performanceAmount, capUsedByRule });
}

export async function insertCardBenefitEvent(event: CardBenefitEventInsert) {
  const result = await query<{ event_id: string }>(
    `
    insert into app.card_benefit_events (
      event_id,
      section_id,
      whooing_entry_id,
      entry_date,
      rule_id,
      card_account_type,
      card_account_id,
      expense_account_id,
      merchant,
      payment_channel,
      approval_amount,
      performance_amount,
      eligible_discount_amount,
      applied_discount_amount,
      posting_amount,
      cap_used_before,
      cap_used_after,
      evaluation_status,
      evaluation_reason,
      idempotency_key
    ) values (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20
    )
    on conflict do nothing
    returning event_id::text
    `,
    [
      event.eventId ?? randomUUID(),
      event.sectionId ?? null,
      event.whooingEntryId ?? null,
      event.entryDate,
      event.ruleId,
      event.cardAccountType,
      event.cardAccountId,
      event.expenseAccountId ?? null,
      event.merchant,
      event.paymentChannel,
      event.approvalAmount,
      event.performanceAmount,
      event.eligibleDiscountAmount,
      event.appliedDiscountAmount,
      event.postingAmount,
      event.capUsedBefore,
      event.capUsedAfter,
      event.evaluationStatus,
      event.evaluationReason,
      event.idempotencyKey ?? null,
    ],
  );
  return result.rows[0]?.event_id ?? null;
}

export async function updateCardBenefitEvent(
  eventId: string,
  event: CardBenefitEventInsert,
  expected: {
    updatedAt: string;
  },
) {
  const result = await query<{ event_id: string }>(
    `
    update app.card_benefit_events
    set entry_date = $3,
        rule_id = $4,
        card_account_type = $5,
        card_account_id = $6,
        expense_account_id = $7,
        merchant = $8,
        payment_channel = $9,
        approval_amount = $10,
        performance_amount = $11,
        eligible_discount_amount = $12,
        applied_discount_amount = $13,
        posting_amount = $14,
        cap_used_before = $15,
        cap_used_after = $16,
        evaluation_status = $17,
        evaluation_reason = $18,
        idempotency_key = $19,
        updated_at = now()
    where event_id = $1::uuid
      and whooing_entry_id = $2
      and rule_id = $4
      and updated_at = $20::timestamptz
    returning event_id::text
    `,
    [
      eventId,
      event.whooingEntryId,
      event.entryDate,
      event.ruleId,
      event.cardAccountType,
      event.cardAccountId,
      event.expenseAccountId ?? null,
      event.merchant,
      event.paymentChannel,
      event.approvalAmount,
      event.performanceAmount,
      event.eligibleDiscountAmount,
      event.appliedDiscountAmount,
      event.postingAmount,
      event.capUsedBefore,
      event.capUsedAfter,
      event.evaluationStatus,
      event.evaluationReason,
      event.idempotencyKey ?? null,
      expected.updatedAt,
    ],
  );
  return Boolean(result.rows[0]?.event_id);
}

export async function getCardBenefitMonthlyAssetsSummary(month?: string | null): Promise<CardBenefitAssetsSummary> {
  const benefitMonth = await resolveBenefitMonth(month);
  if (!benefitMonth) {
    return emptyCardBenefitAssetsSummary("");
  }

  const { startDate, endDate } = entryDateRangeForBenefitMonth(benefitMonth);
  const previousMonth = previousBenefitMonth(benefitMonth);
  const { startDate: previousStartDate, endDate: previousEndDate } = entryDateRangeForBenefitMonth(previousMonth);
  const [
    totals,
    ruleDiscounts,
    cardDiscounts,
    capStatuses,
    cardBillPayments,
    recentEvents,
    statementEstimates,
  ] = await Promise.all([
    query<CardBenefitMonthlySummaryDbRow>(
      `
      select
        count(*)::text as event_count,
        coalesce(sum(approval_amount), 0)::text as approval_total,
        coalesce(sum(applied_discount_amount), 0)::text as discount_total,
        coalesce(sum(posting_amount), 0)::text as posting_total,
        count(*) filter (where whooing_entry_id is null)::text as unlinked_event_count
      from app.card_benefit_events
      where entry_date >= $1
        and entry_date < $2
        and (section_id = $3 or section_id is null)
      `,
      [startDate, endDate, sectionId],
    ),
    query<CardBenefitRuleSummaryDbRow>(
      `
      select
        e.rule_id,
        coalesce(r.name, e.rule_id, '혜택 없음') as rule_name,
        coalesce(sum(e.applied_discount_amount), 0)::text as discount_amount,
        count(*)::text as event_count
      from app.card_benefit_events e
      left join app.card_benefit_rules r
        on r.rule_id = e.rule_id
      where e.entry_date >= $1
        and e.entry_date < $2
        and (e.section_id = $3 or e.section_id is null)
      group by e.rule_id, r.name
      order by sum(e.applied_discount_amount) desc
      limit 8
      `,
      [startDate, endDate, sectionId],
    ),
    query<CardBenefitCardSummaryDbRow>(
      `
      select
        e.card_account_type,
        e.card_account_id,
        coalesce(a.title, e.card_account_id) as card_title,
        coalesce(sum(e.applied_discount_amount), 0)::text as discount_amount,
        count(*)::text as event_count
      from app.card_benefit_events e
      left join whooing.accounts a
        on a.account_type = e.card_account_type
       and a.account_id = e.card_account_id
       and a.section_id = $3
      where e.entry_date >= $1
        and e.entry_date < $2
        and (e.section_id = $3 or e.section_id is null)
      group by e.card_account_type, e.card_account_id, a.title
      order by sum(e.applied_discount_amount) desc
      limit 8
      `,
      [startDate, endDate, sectionId],
    ),
    query<CardBenefitCapStatusDbRow>(
      `
      with event_usage as (
        select
          rule_id,
          coalesce(sum(applied_discount_amount), 0) as event_discount_amount,
          coalesce(sum(applied_discount_amount) filter (
            where evaluation_reason like '%backfill%'
               or evaluation_status = 'manual_backfill'
          ), 0) as backfilled_discount_amount
        from app.card_benefit_events
        where entry_date >= $1
          and entry_date < $2
          and rule_id is not null
          and (section_id = $5 or section_id is null)
        group by rule_id
      ),
      previous_performance as (
        with structured as (
          select
            card_account_type,
            card_account_id,
            coalesce(sum(performance_amount), 0) as amount
          from app.card_benefit_events
          where entry_date >= $3
            and entry_date < $4
            and (section_id = $5 or section_id is null)
          group by card_account_type, card_account_id
        ),
        legacy as (
          select
            e.r_account as card_account_type,
            e.r_account_id as card_account_id,
            coalesce(sum(e.money), 0) as amount
          from whooing.entries e
          where e.section_id = $5
            and e.entry_date >= $3
            and e.entry_date < $4
            and e.l_account = 'expenses'
            and e.r_account = 'liabilities'
            and not exists (
              select 1
              from app.card_benefit_events be
              where be.whooing_entry_id = e.entry_id
                and (be.section_id = $5 or be.section_id is null)
            )
          group by e.r_account, e.r_account_id
        ),
        merged as (
          select card_account_type, card_account_id, amount from structured
          union all
          select card_account_type, card_account_id, amount from legacy
        )
        select
          card_account_type,
          card_account_id,
          coalesce(sum(amount), 0) as previous_performance_amount
        from merged
        group by card_account_type, card_account_id
      )
      select
        r.rule_id,
        r.name as rule_name,
        r.card_account_type,
        r.card_account_id,
        coalesce(a.title, r.card_account_id) as card_title,
        r.monthly_cap_tiers,
        coalesce(p.previous_performance_amount, 0)::text as previous_performance_amount,
        coalesce(u.event_discount_amount, 0)::text as event_discount_amount,
        coalesce(u.backfilled_discount_amount, 0)::text as backfilled_discount_amount
      from app.card_benefit_rules r
      left join event_usage u
        on u.rule_id = r.rule_id
      left join previous_performance p
        on p.card_account_type = r.card_account_type
       and p.card_account_id = r.card_account_id
      left join whooing.accounts a
        on a.account_type = r.card_account_type
       and a.account_id = r.card_account_id
       and a.section_id = $5
      where r.status = 'active'
      order by r.priority nulls last, r.rule_id
      `,
      [startDate, endDate, previousStartDate, previousEndDate, sectionId],
    ),
    getCardBillPayments(),
    query<CardBenefitRecentEventDbRow>(
      `
      select
        e.event_id::text,
        e.entry_date,
        e.card_account_type,
        e.card_account_id,
        coalesce(a.title, e.card_account_id) as card_title,
        r.name as rule_name,
        e.merchant,
        e.approval_amount::text,
        e.applied_discount_amount::text,
        e.posting_amount::text
      from app.card_benefit_events e
      left join app.card_benefit_rules r
        on r.rule_id = e.rule_id
      left join whooing.accounts a
        on a.account_type = e.card_account_type
       and a.account_id = e.card_account_id
       and a.section_id = $3
      where e.entry_date >= $1
        and e.entry_date < $2
        and (e.section_id = $3 or e.section_id is null)
      order by e.created_at desc
      limit 8
      `,
      [startDate, endDate, sectionId],
    ),
    query<CardStatementEstimateDbRow>(
      `
      with structured as (
        select
          card_account_type,
          card_account_id,
          sum(approval_amount) as structured_approval_total,
          sum(performance_amount) as structured_performance_total,
          sum(posting_amount) as structured_posting_total,
          sum(applied_discount_amount) as structured_discount_total,
          count(*) as structured_count
        from app.card_benefit_events
        where entry_date >= $1
          and entry_date < $2
          and (section_id = $3 or section_id is null)
        group by card_account_type, card_account_id
      ),
      legacy as (
        select
          e.r_account as card_account_type,
          e.r_account_id as card_account_id,
          sum(e.money) as legacy_posting_total,
          count(*) as legacy_count
        from whooing.entries e
        where e.section_id = $3
          and e.entry_date >= $1
          and e.entry_date < $2
          and e.l_account = 'expenses'
          and e.r_account = 'liabilities'
          and not exists (
            select 1
            from app.card_benefit_events be
            where be.whooing_entry_id = e.entry_id
              and (be.section_id = $3 or be.section_id is null)
          )
        group by e.r_account, e.r_account_id
      ),
      merged as (
        select
          coalesce(s.card_account_type, l.card_account_type) as card_account_type,
          coalesce(s.card_account_id, l.card_account_id) as card_account_id,
          s.structured_approval_total,
          s.structured_performance_total,
          s.structured_posting_total,
          s.structured_discount_total,
          coalesce(s.structured_count, 0) as structured_count,
          l.legacy_posting_total,
          coalesce(l.legacy_count, 0) as legacy_count
        from structured s
        full outer join legacy l
          on l.card_account_type = s.card_account_type
         and l.card_account_id = s.card_account_id
      )
      select
        m.card_account_type,
        m.card_account_id,
        coalesce(a.title, m.card_account_id) as card_title,
        coalesce(m.structured_approval_total, 0)::text as structured_approval_total,
        coalesce(m.structured_performance_total, 0)::text as structured_performance_total,
        coalesce(m.structured_posting_total, 0)::text as structured_posting_total,
        coalesce(m.structured_discount_total, 0)::text as structured_discount_total,
        coalesce(m.legacy_posting_total, 0)::text as legacy_posting_total,
        m.structured_count::text,
        m.legacy_count::text
      from merged m
      left join whooing.accounts a
        on a.account_type = m.card_account_type
       and a.account_id = m.card_account_id
       and a.section_id = $3
      where coalesce(m.structured_approval_total, 0) <> 0
         or coalesce(m.legacy_posting_total, 0) <> 0
      order by coalesce(m.structured_approval_total, 0) + coalesce(m.legacy_posting_total, 0) desc
      limit 12
      `,
      [startDate, endDate, sectionId],
    ),
  ]);

  const total = totals.rows[0];
  const approvalTotal = numberFromDb(total?.approval_total);
  const discountTotal = numberFromDb(total?.discount_total);

  return {
    month: benefitMonth,
    monthLabel: monthLabel(benefitMonth),
    eventCount: Number(total?.event_count ?? 0),
    approvalTotal,
    discountTotal,
    postingTotal: numberFromDb(total?.posting_total),
    effectiveSavingRate: savingRate(discountTotal, approvalTotal),
    unlinkedEventCount: Number(total?.unlinked_event_count ?? 0),
    ruleDiscounts: ruleDiscounts.rows.map((row) => ({
      ruleId: row.rule_id,
      ruleName: row.rule_name,
      discountAmount: numberFromDb(row.discount_amount),
      eventCount: Number(row.event_count),
    })),
    cardDiscounts: cardDiscounts.rows.map((row) => ({
      cardAccountType: row.card_account_type,
      cardAccountId: row.card_account_id,
      cardName: displayCardName(row.card_account_type, row.card_account_id, row.card_title),
      discountAmount: numberFromDb(row.discount_amount),
      eventCount: Number(row.event_count),
    })),
    capStatuses: capStatuses.rows.map((row) => {
      const previousMonthPerformanceAmount = numberFromDb(row.previous_performance_amount);
      const eventDiscountAmount = numberFromDb(row.event_discount_amount);
      const backfilledDiscountAmount = numberFromDb(row.backfilled_discount_amount);
      const totalUsed = eventDiscountAmount;
      const calculatedCap = calculateBenefitCapStatus({
        monthlyCapTiers: monthlyCapTiersFromDb(row.monthly_cap_tiers),
        previousMonthPerformanceEstimate: previousMonthPerformanceAmount,
        currentDiscountUsed: totalUsed,
      });
      return {
        ruleId: row.rule_id,
        ruleName: row.rule_name,
        cardName: displayCardName(row.card_account_type, row.card_account_id, row.card_title),
        previousMonthPerformanceAmount,
        autoStatus: calculatedCap.autoStatus,
        autoMonthlyCapAmount: calculatedCap.autoMonthlyCapAmount,
        eventDiscountAmount,
        backfilledDiscountAmount,
        totalUsed,
        remainingCap: calculatedCap.remainingCap,
        usageRate: calculatedCap.usageRate,
      };
    }),
    cardBillPayments,
    recentEvents: recentEvents.rows.map((row) => ({
      eventId: row.event_id,
      date: formatDisplayDate(String(Math.floor(row.entry_date))),
      cardName: displayCardName(row.card_account_type, row.card_account_id, row.card_title),
      ruleName: row.rule_name ?? "혜택 없음",
      merchant: row.merchant?.trim() || "카드혜택 거래",
      approvalAmount: numberFromDb(row.approval_amount),
      discountAmount: numberFromDb(row.applied_discount_amount),
      postingAmount: numberFromDb(row.posting_amount),
    })),
    statementEstimates: statementEstimates.rows.map((row) => {
      const structuredPerformanceTotal = numberFromDb(row.structured_performance_total);
      const statementEstimate = calculateCardStatementEstimate({
        structuredApprovalTotal: numberFromDb(row.structured_approval_total),
        structuredPostingTotal: numberFromDb(row.structured_posting_total),
        structuredDiscountTotal: numberFromDb(row.structured_discount_total),
        legacyPostingTotal: numberFromDb(row.legacy_posting_total),
      });
      const performanceEstimate = calculateCardPerformanceEstimate({
        ...statementEstimate,
        structuredPerformanceTotal,
      });

      return {
        cardAccountType: row.card_account_type,
        cardAccountId: row.card_account_id,
        cardName: displayCardName(row.card_account_type, row.card_account_id, row.card_title),
        structuredCount: Number(row.structured_count),
        legacyCount: Number(row.legacy_count),
        structuredPerformanceTotal,
        performanceEstimate: performanceEstimate.performanceEstimate,
        ...statementEstimate,
      };
    }),
  };
}

function emptyCardBenefitAssetsSummary(month: string): CardBenefitAssetsSummary {
  return {
    month,
    monthLabel: month ? monthLabel(month) : "최근 월",
    eventCount: 0,
    approvalTotal: 0,
    discountTotal: 0,
    postingTotal: 0,
    effectiveSavingRate: 0,
    unlinkedEventCount: 0,
    ruleDiscounts: [],
    cardDiscounts: [],
    capStatuses: [],
    cardBillPayments: [],
    recentEvents: [],
    statementEstimates: [],
  };
}
