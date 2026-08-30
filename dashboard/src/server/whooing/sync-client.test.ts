import assert from "node:assert/strict";
import test from "node:test";
import {
  getEtlSyncTimeoutMs,
  getSyncFailureReason,
  WhooingLocalSyncError,
} from "./sync-client.ts";

test("getEtlSyncTimeoutMs defaults to at least 15 seconds", () => {
  const previous = process.env.ETL_SYNC_TIMEOUT_MS;
  delete process.env.ETL_SYNC_TIMEOUT_MS;

  try {
    assert.equal(getEtlSyncTimeoutMs(), 15_000);
  } finally {
    if (previous === undefined) {
      delete process.env.ETL_SYNC_TIMEOUT_MS;
    } else {
      process.env.ETL_SYNC_TIMEOUT_MS = previous;
    }
  }
});

test("getEtlSyncTimeoutMs accepts safe env override", () => {
  const previous = process.env.ETL_SYNC_TIMEOUT_MS;
  process.env.ETL_SYNC_TIMEOUT_MS = "20000";

  try {
    assert.equal(getEtlSyncTimeoutMs(), 20_000);
  } finally {
    if (previous === undefined) {
      delete process.env.ETL_SYNC_TIMEOUT_MS;
    } else {
      process.env.ETL_SYNC_TIMEOUT_MS = previous;
    }
  }
});

test("getEtlSyncTimeoutMs falls back for invalid or too short env values", () => {
  const previous = process.env.ETL_SYNC_TIMEOUT_MS;

  try {
    process.env.ETL_SYNC_TIMEOUT_MS = "not-a-number";
    assert.equal(getEtlSyncTimeoutMs(), 15_000);

    process.env.ETL_SYNC_TIMEOUT_MS = "4999";
    assert.equal(getEtlSyncTimeoutMs(), 15_000);
  } finally {
    if (previous === undefined) {
      delete process.env.ETL_SYNC_TIMEOUT_MS;
    } else {
      process.env.ETL_SYNC_TIMEOUT_MS = previous;
    }
  }
});

test("getSyncFailureReason preserves ETL unavailable, timeout, and ETL error reasons", () => {
  assert.equal(
    getSyncFailureReason(new WhooingLocalSyncError("etl_unavailable", "service unavailable")),
    "etl_unavailable",
  );
  assert.equal(
    getSyncFailureReason(new WhooingLocalSyncError("timeout", "timed out")),
    "timeout",
  );
  assert.equal(
    getSyncFailureReason(new WhooingLocalSyncError("etl_error", "status 500")),
    "etl_error",
  );
  assert.equal(getSyncFailureReason(new Error("unexpected")), "unknown");
});
