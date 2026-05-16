import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildFixedExpenseSchedule, referenceDayForMonth } from "../../lib/fixed-expense-schedule.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("buildFixedExpenseSchedule marks processed scheduled and overdue rows", () => {
  const rows = buildFixedExpenseSchedule([
    {
      id: "x64:월세",
      accountName: "주거",
      itemName: "월세",
      paymentAccountName: "국민은행",
      expectedAmount: 544000,
      currentAmount: 544000,
      dueDay: 21,
      processedDay: 21,
    },
    {
      id: "x64:관리비",
      accountName: "주거",
      itemName: "관리비",
      paymentAccountName: "신한카드",
      expectedAmount: 158000,
      currentAmount: 0,
      dueDay: 25,
      processedDay: null,
    },
    {
      id: "x68:쿠팡와우",
      accountName: "구독",
      itemName: "쿠팡와우",
      paymentAccountName: "현대카드",
      expectedAmount: 7890,
      currentAmount: 0,
      dueDay: 10,
      processedDay: null,
    },
  ], 16);

  assert.deepEqual(rows.map((row) => [row.itemName, row.status, row.daysRemaining]), [
    ["쿠팡와우", "overdue", -6],
    ["관리비", "scheduled", 9],
    ["월세", "processed", 0],
  ]);
  assert.equal(rows[0].statusLabel, "지연");
  assert.equal(rows[1].statusLabel, "예정");
  assert.equal(rows[2].statusLabel, "처리완료");
});

test("referenceDayForMonth uses today for current month and month end for past months", () => {
  const now = new Date("2026-05-16T09:00:00+09:00");

  assert.equal(referenceDayForMonth("202605", now), 16);
  assert.equal(referenceDayForMonth("202604", now), 30);
});

test("fixed expense schedule query uses median due day and latest historical month amount", () => {
  const repositorySource = readFileSync(
    resolve(__dirname, "../../server/whooing/analytics-repository.ts"),
    "utf8",
  );

  assert.match(
    repositorySource,
    /percentile_cont\(0\.5\)\s+within group\s+\(order by fe\.day\).*as due_day/s,
  );
  assert.match(
    repositorySource,
    /latest_historical_amount as \(/,
  );
  assert.match(
    repositorySource,
    /sum\(fe\.money\) as month_amount/,
  );
  assert.match(
    repositorySource,
    /lha\.expected_amount/,
  );
  assert.doesNotMatch(
    repositorySource,
    /round\(avg\(fe\.money\) filter \(where fe\.ym < m\.ym\)\) as expected_amount/,
  );
  assert.doesNotMatch(
    repositorySource,
    /round\(avg\(fe\.day\) filter \(where fe\.ym < m\.ym\)\) as due_day/,
  );
});

test("fixed expense schedule exposes payment account for the table", () => {
  const repositorySource = readFileSync(
    resolve(__dirname, "../../server/whooing/analytics-repository.ts"),
    "utf8",
  );
  const sectionPageSource = readFileSync(
    resolve(__dirname, "components/section-page.tsx"),
    "utf8",
  );

  assert.match(repositorySource, /payment_account_name/);
  assert.match(repositorySource, /coalesce\(current_payment_account_name, historical_payment_account_name/);
  assert.match(sectionPageSource, /<th>결제수단<\/th>/);
  assert.match(sectionPageSource, /row\.paymentAccountName/);
});
