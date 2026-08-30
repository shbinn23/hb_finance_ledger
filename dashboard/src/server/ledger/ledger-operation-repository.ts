import { query } from "../../lib/db/postgres.ts";
import type { SyncFailureReason } from "../whooing/sync-client.ts";

export type LedgerOperationStatus = "pending" | "created" | "failed";
export type LedgerOperationSyncStatus = "synced" | "pending" | "skipped";
export type LedgerOperationBenefitStatus = "created" | "skipped" | "pending" | "failed";

export interface LedgerOperationInput {
  operationKey: string;
  source: string;
  entryType: string;
  occurredDate: string;
  amount: number;
  item: string;
}

export interface LedgerOperationRecord {
  operationKey: string;
  status: LedgerOperationStatus;
  whooingEntryId: number | null;
  syncStatus: LedgerOperationSyncStatus;
  syncReason: SyncFailureReason | null;
  benefitStatus: LedgerOperationBenefitStatus;
}

export type LedgerOperationReservation =
  | { supported: false; outcome: "unavailable" }
  | { supported: true; outcome: "reserved" }
  | { supported: true; outcome: "existing"; record: LedgerOperationRecord };

export interface LedgerOperationStore {
  reserve: (input: LedgerOperationInput) => Promise<LedgerOperationReservation>;
  markCreated: (input: {
    operationKey: string;
    whooingEntryId: number | null;
    syncStatus: LedgerOperationSyncStatus;
    syncReason: SyncFailureReason | null;
    benefitStatus: LedgerOperationBenefitStatus;
  }) => Promise<void>;
  markFailed: (operationKey: string, errorMessage: string) => Promise<void>;
}

type QueryResult = { rows: Array<Record<string, unknown>> };
type QueryExecutor = (sql: string, params?: unknown[]) => Promise<QueryResult>;

function toRecord(row: Record<string, unknown>): LedgerOperationRecord {
  return {
    operationKey: String(row.operation_key),
    status: row.status as LedgerOperationStatus,
    whooingEntryId: row.whooing_entry_id === null || row.whooing_entry_id === undefined
      ? null
      : Number(row.whooing_entry_id),
    syncStatus: row.sync_status as LedgerOperationSyncStatus,
    syncReason: (row.sync_reason ?? null) as SyncFailureReason | null,
    benefitStatus: row.benefit_status as LedgerOperationBenefitStatus,
  };
}

export function createLedgerOperationStore(execute: QueryExecutor): LedgerOperationStore {
  async function tableExists() {
    const result = await execute("select to_regclass('app.ledger_write_operations')::text as table_name");
    return Boolean(result.rows[0]?.table_name);
  }

  return {
    async reserve(input) {
      if (!await tableExists()) {
        return { supported: false, outcome: "unavailable" };
      }

      const params = [
        input.operationKey,
        input.source,
        input.entryType,
        input.occurredDate,
        input.amount,
        input.item,
      ];
      const inserted = await execute(
        `
        insert into app.ledger_write_operations (
          operation_key, source, entry_type, occurred_date, amount, item, status
        ) values ($1, $2, $3, $4::date, $5, $6, 'pending')
        on conflict (operation_key) do nothing
        returning operation_key
        `,
        params,
      );
      if (inserted.rows.length > 0) {
        return { supported: true, outcome: "reserved" };
      }

      const retried = await execute(
        `
        update app.ledger_write_operations
        set status = 'pending', error_message = null, updated_at = now()
        where operation_key = $1 and status = 'failed'
        returning operation_key
        `,
        [input.operationKey],
      );
      if (retried.rows.length > 0) {
        return { supported: true, outcome: "reserved" };
      }

      const existing = await execute(
        `
        select operation_key, status, whooing_entry_id, sync_status, sync_reason, benefit_status
        from app.ledger_write_operations
        where operation_key = $1
        `,
        [input.operationKey],
      );
      return {
        supported: true,
        outcome: "existing",
        record: toRecord(existing.rows[0] ?? {}),
      };
    },

    async markCreated(input) {
      await execute(
        `
        update app.ledger_write_operations
        set status = 'created',
            whooing_entry_id = $2,
            sync_status = $3,
            sync_reason = $4,
            benefit_status = $5,
            error_message = null,
            updated_at = now()
        where operation_key = $1
        `,
        [
          input.operationKey,
          input.whooingEntryId,
          input.syncStatus,
          input.syncReason,
          input.benefitStatus,
        ],
      );
    },

    async markFailed(operationKey, errorMessage) {
      await execute(
        `
        update app.ledger_write_operations
        set status = 'failed', error_message = $2, updated_at = now()
        where operation_key = $1 and whooing_entry_id is null
        `,
        [operationKey, errorMessage.slice(0, 500)],
      );
    },
  };
}

export const ledgerOperationStore = createLedgerOperationStore(
  (sql, params) => query(sql, params) as Promise<QueryResult>,
);
