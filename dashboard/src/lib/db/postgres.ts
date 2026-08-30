import fs from "node:fs";
import path from "node:path";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

type PgGlobal = typeof globalThis & {
  __piggyLedgerPool?: Pool;
};

function loadRootEnv() {
  const envPath = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ].find((candidate) => fs.existsSync(candidate));

  if (!envPath) return;

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

loadRootEnv();

function dbConfig() {
  return {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? "ledger",
    user: process.env.DB_USER ?? "admin",
    password: String(process.env.DB_PASSWORD ?? process.env.DB_PASS ?? "admin"),
  };
}

function getPool() {
  const store = globalThis as PgGlobal;
  if (!store.__piggyLedgerPool) {
    store.__piggyLedgerPool = new Pool({
      ...dbConfig(),
      max: 4,
      idleTimeoutMillis: 30_000,
    });
  }
  return store.__piggyLedgerPool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  return getPool().query<T>(sql, params);
}

export type DatabaseQuery = <T extends QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;

export async function withTransaction<T>(work: (transactionQuery: DatabaseQuery) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const transactionQuery: DatabaseQuery = (sql, params = []) => client.query(sql, params);
    const result = await work(transactionQuery);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
