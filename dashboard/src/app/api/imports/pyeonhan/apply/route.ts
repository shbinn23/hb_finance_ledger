import { NextRequest, NextResponse } from "next/server";
import { createRuntimeDashboardLedgerEntry } from "@/server/ledger/ledger-entry-runtime";
import {
  createImportBatch,
  finishImportBatch,
  finishImportRow,
} from "@/server/import/import-repository";
import { applyAutoCreatableRows } from "@/server/import/pyeonhan-import-service";
import {
  buildPyeonhanDryRun,
  validatePyeonhanUpload,
} from "@/server/import/pyeonhan-dry-run";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    const file = candidate instanceof File ? candidate : null;
    const confirmed = formData.get("confirmed") === "true";
    const validationError = validatePyeonhanUpload(file);
    if (validationError || !file || !confirmed) {
      return NextResponse.json({
        ok: false,
        message: validationError ?? "자동 등록 확인이 필요합니다.",
      }, { status: 400 });
    }

    const dryRun = await buildPyeonhanDryRun(file);
    if (!dryRun.schema.autoApplySupported) {
      return NextResponse.json({
        ok: false,
        message: "import 및 ledger operation migration 적용 전에는 dry-run만 사용할 수 있습니다.",
      }, { status: 503 });
    }
    const batch = await createImportBatch({
      filename: file.name,
      startDate: dryRun.startDate,
      endDate: dryRun.endDate,
      rows: dryRun.rows,
      possibleDeletes: dryRun.possibleDeletes,
    });
    const result = await applyAutoCreatableRows({
      rows: dryRun.rows,
      createEntry: createRuntimeDashboardLedgerEntry,
      onResult: async (row, writeResult) => {
        const rowId = batch.rowIds.get(row.transaction.sourceIdentityKey);
        if (!rowId) return;
        await finishImportRow({
          batchId: batch.batchId,
          rowId,
          operationKey: writeResult.operationKey,
          status: writeResult.created ? "created" : "failed",
          whooingEntryId: writeResult.entryId,
          errorMessage: writeResult.created ? undefined : writeResult.message,
        });
      },
    });
    await finishImportBatch(batch.batchId, result.created);
    return NextResponse.json({
      ok: result.failed === 0,
      batchId: batch.batchId,
      ...result,
      message: result.failed === 0
        ? `${result.created}건을 후잉 원장에 등록했습니다.`
        : `${result.created}건 등록, ${result.failed}건 실패했습니다. 실패 행은 검토가 필요합니다.`,
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "import_schema_unavailable"
      ? "import migration 적용 전에는 자동 등록할 수 없습니다."
      : "자동 등록 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
