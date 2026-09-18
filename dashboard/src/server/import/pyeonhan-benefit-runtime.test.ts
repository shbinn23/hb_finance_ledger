import assert from "node:assert/strict";
import test from "node:test";
import { executePyeonhanBenefitOperation } from "./pyeonhan-benefit-operation.ts";

test("benefit runtime marks a partially failed approval operation as failed", async () => {
  const finished: string[] = [];
  const result = await executePyeonhanBenefitOperation(
    { importRowId: 11, ruleId: "shinhan_lady_lunch_5p" },
    {
      getOperation: async () => null,
      reserveOperation: async () => true,
      approve: async () => { throw new Error("status write failed"); },
      finishOperation: async ({ status }) => { finished.push(status); },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.deepEqual(finished, ["failed"]);
});

test("benefit runtime reconciles the import row when the operation already succeeded", async () => {
  let approvals = 0;
  const result = await executePyeonhanBenefitOperation(
    { importRowId: 12, ruleId: "hana_mgs_simple_pay_10p" },
    {
      getOperation: async () => ({ status: "created" }),
      reserveOperation: async () => { throw new Error("must not reserve an existing operation"); },
      approve: async () => {
        approvals += 1;
        return { ok: true, status: "event_exists", message: "existing event reconciled" };
      },
      finishOperation: async () => { throw new Error("must not rewrite an existing operation"); },
    },
  );

  assert.equal(approvals, 1);
  assert.equal(result.ok, true);
  assert.equal(result.status, "event_exists");
  assert.equal(result.operationKey, "pyeonhan-benefit:12:hana_mgs_simple_pay_10p");
});
