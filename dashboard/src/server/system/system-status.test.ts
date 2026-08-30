import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMirrorFreshness,
  getSystemStatus,
  probeEtlHealth,
  type SystemStatusDependencies,
} from "./system-status.ts";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function dependencies(
  overrides: Partial<SystemStatusDependencies> = {},
): SystemStatusDependencies {
  return {
    checkEtlHealth: async () => "online",
    getMirrorActivity: async () => ({
      entryCount: 2381,
      lastActivityAt: new Date("2026-08-30T11:30:00.000Z"),
      pendingSyncCount: 2,
    }),
    now: () => NOW,
    ...overrides,
  };
}

test("classifyMirrorFreshness treats activity within 24 hours as fresh", () => {
  assert.equal(
    classifyMirrorFreshness(new Date("2026-08-29T12:00:01.000Z"), NOW),
    "fresh",
  );
});

test("classifyMirrorFreshness treats activity older than 24 hours as stale", () => {
  assert.equal(
    classifyMirrorFreshness(new Date("2026-08-29T11:59:59.000Z"), NOW),
    "stale",
  );
});

test("classifyMirrorFreshness reports empty when no mirror row has synced", () => {
  assert.equal(classifyMirrorFreshness(null, NOW), "empty");
});

test("probeEtlHealth distinguishes online, offline, and unknown responses", async () => {
  assert.equal(await probeEtlHealth(async () => ({ ok: true, json: async () => ({ ok: true }) })), "online");
  assert.equal(await probeEtlHealth(async () => { throw new TypeError("fetch failed"); }), "offline");
  assert.equal(await probeEtlHealth(async () => ({ ok: false, json: async () => ({ ok: false }) })), "unknown");
  assert.equal(await probeEtlHealth(async () => ({ ok: true, json: async () => ({ unexpected: true }) })), "unknown");
});

test("getSystemStatus keeps ETL and mirror state independent", async () => {
  const result = await getSystemStatus(dependencies({
    checkEtlHealth: async () => "offline",
  }));

  assert.deepEqual(result, {
    etlStatus: "offline",
    mirror: {
      entryCount: 2381,
      lastActivityAt: "2026-08-30T11:30:00.000Z",
      freshness: "fresh",
      freshnessThresholdHours: 24,
      timestampMeaning: "last_row_update_estimate",
    },
    pendingSyncCount: 2,
    pendingSyncSupported: true,
  });
});

test("getSystemStatus degrades honestly when the operation table is absent", async () => {
  const result = await getSystemStatus(dependencies({
    checkEtlHealth: async () => "unknown",
    getMirrorActivity: async () => ({
      entryCount: 0,
      lastActivityAt: null,
      pendingSyncCount: null,
    }),
  }));

  assert.equal(result.etlStatus, "unknown");
  assert.equal(result.mirror.freshness, "empty");
  assert.equal(result.pendingSyncCount, null);
  assert.equal(result.pendingSyncSupported, false);
});
