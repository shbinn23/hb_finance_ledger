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
