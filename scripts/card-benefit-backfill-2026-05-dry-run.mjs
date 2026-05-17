import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBackfillDryRun,
  formatBackfillDryRunReport,
} from "../dashboard/src/server/card-benefits/backfill-2026-05-dry-run.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(path.join(rootDir, "dashboard", "package.json"));
const { Pool } = require("pg");

loadRootEnv();

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "ledger",
  user: process.env.DB_USER ?? "admin",
  password: String(process.env.DB_PASSWORD ?? process.env.DB_PASS ?? "admin"),
  max: 1,
});

try {
  const entries = await loadMay2026CardExpenseEntries();
  const report = buildBackfillDryRun(entries);
  console.log(formatBackfillDryRunReport(report));
  if (process.argv.includes("--apply")) {
    await applyBackfill(report.proposedRows);
  }
} finally {
  await pool.end();
}

function loadRootEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
    }
  });
}

async function loadMay2026CardExpenseEntries() {
  const result = await pool.query(
    `
    select
      e.entry_id,
      floor(e.entry_date)::int as entry_day,
      e.entry_date::text as entry_date,
      coalesce(e.item, '') as item,
      coalesce(e.memo, '') as memo,
      e.money::int as posting_amount,
      e.l_account_id as expense_account_id,
      e.r_account_id as card_account_id,
      coalesce(a.title, e.r_account_id) as card_title,
      exists (
        select 1
        from app.card_benefit_events be
        where be.whooing_entry_id = e.entry_id
      ) as has_existing_benefit_event
    from whooing.entries e
    left join whooing.accounts a
      on a.account_type = e.r_account
     and a.account_id = e.r_account_id
    where e.entry_date >= $1
      and e.entry_date < $2
      and e.l_account = 'expenses'
      and e.r_account = 'liabilities'
    order by e.r_account_id, e.entry_date, e.entry_id
    `,
    [20260501, 20260601],
  );

  return result.rows.map((row) => ({
    entryId: Number(row.entry_id),
    entryDay: Number(row.entry_day),
    entryDate: String(row.entry_date),
    item: row.item ?? "",
    memo: row.memo ?? "",
    postingAmount: Number(row.posting_amount),
    expenseAccountId: row.expense_account_id,
    cardAccountId: row.card_account_id,
    cardTitle: row.card_title ?? row.card_account_id,
    hasExistingBenefitEvent: row.has_existing_benefit_event,
  }));
}

async function applyBackfill(rows) {
  if (rows.length === 0) {
    console.log("\n## apply\n- insert 대상이 없습니다.");
    return;
  }

  await pool.query("begin");
  try {
    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const result = await pool.query(
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
        `,
        [
          randomUUID(),
          process.env.WHOOING_SECTION_ID ?? "s152045",
          row.whooingEntryId,
          row.entryDay,
          row.ruleId,
          "liabilities",
          row.cardAccountId,
          row.expenseAccountId,
          row.item,
          row.paymentChannel,
          row.approvalAmount,
          row.performanceAmount,
          row.eligibleDiscountAmount,
          row.appliedDiscountAmount,
          row.postingAmount,
          null,
          null,
          row.evaluationStatus,
          row.evaluationReason,
          `card-benefit-backfill:2026-05:${row.whooingEntryId}`,
        ],
      );
      if (result.rowCount === 1) inserted += 1;
      else skipped += 1;
    }
    await pool.query("commit");
    console.log("\n## apply");
    console.log(`- inserted: ${inserted}건`);
    console.log(`- skipped conflict: ${skipped}건`);
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}
