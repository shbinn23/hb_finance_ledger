import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../../../migrations/006_seed_pyeonhan_import_mappings.sql"),
  "utf8",
);

test("mapping seed covers verified August assets and categories only", () => {
  assert.match(migration, /'국민 하나투어'.*'x98'.*'liabilities'/s);
  assert.match(migration, /'선택 \/ 식비'.*'x74'.*'expenses'/s);
  assert.match(migration, /'준필수 \/ 생필품'.*'x71'.*'expenses'/s);
  assert.match(migration, /'준필수 \/ 차량'.*'x69'.*'expenses'/s);
  assert.match(migration, /'💰 월급'.*'x85'.*'income'/s);
  assert.doesNotMatch(migration, /'환급 \/ 캐시백'/);
  assert.match(migration, /on conflict \(source, mapping_type, source_key\) do nothing/);
  assert.match(migration, /create unique index import_batches_source_file_hash_unique_idx/);
  assert.match(migration, /status in \('pending', 'applying', 'completed'\)/);
});
