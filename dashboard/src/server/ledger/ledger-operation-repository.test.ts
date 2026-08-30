import assert from "node:assert/strict";
import test from "node:test";
import { createLedgerOperationStore } from "./ledger-operation-repository.ts";

const input = {
  operationKey: "d0eb5f3d-7629-4dfa-9c57-1b39aa88d201",
  source: "dashboard",
  entryType: "expense",
  occurredDate: "2026-08-30",
  amount: 12000,
  item: "점심",
};

test("ledger operation store degrades without writing when its table is absent", async () => {
  const sqlCalls: string[] = [];
  const store = createLedgerOperationStore(async (sql) => {
    sqlCalls.push(sql);
    return { rows: [{ table_name: null }] };
  });

  assert.deepEqual(await store.reserve(input), {
    supported: false,
    outcome: "unavailable",
  });
  assert.equal(sqlCalls.length, 1);
});

test("ledger operation store returns an existing created operation", async () => {
  const responses = [
    { rows: [{ table_name: "app.ledger_write_operations" }] },
    { rows: [] },
    { rows: [] },
    { rows: [{
      operation_key: input.operationKey,
      status: "created",
      whooing_entry_id: "1427000",
      sync_status: "pending",
      sync_reason: "etl_unavailable",
      benefit_status: "skipped",
    }] },
  ];
  const store = createLedgerOperationStore(async () => responses.shift() ?? { rows: [] });

  const result = await store.reserve(input);

  assert.equal(result.supported, true);
  assert.equal(result.outcome, "existing");
  if (result.outcome === "existing") {
    assert.equal(result.record.status, "created");
    assert.equal(result.record.whooingEntryId, 1427000);
    assert.equal(result.record.syncReason, "etl_unavailable");
  }
});

test("ledger operation store leaves an in-progress duplicate pending", async () => {
  const responses = [
    { rows: [{ table_name: "app.ledger_write_operations" }] },
    { rows: [] },
    { rows: [] },
    { rows: [{
      operation_key: input.operationKey,
      status: "pending",
      whooing_entry_id: null,
      sync_status: "skipped",
      sync_reason: null,
      benefit_status: "skipped",
    }] },
  ];
  const store = createLedgerOperationStore(async () => responses.shift() ?? { rows: [] });

  const result = await store.reserve(input);

  assert.equal(result.supported, true);
  assert.equal(result.outcome, "existing");
  if (result.outcome === "existing") {
    assert.equal(result.record.status, "pending");
  }
});
