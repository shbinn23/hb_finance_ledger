import { NextRequest, NextResponse } from "next/server";
import { approveRuntimePyeonhanBenefitCandidate } from "@/server/import/pyeonhan-benefit-runtime";
import {
  importActionOriginIsAllowed,
  importWritesAreDryRunOnly,
  parseImportBenefitRequest,
} from "@/server/import/import-actions";
import {
  finishImportOperationRecord,
  getImportActionOperation,
  getImportSchemaStatus,
  reserveImportActionOperation,
} from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = parseImportBenefitRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, status: "rejected", error: parsed.error }, { status: 400 });
  }
  if (!importActionOriginIsAllowed({
    origin: request.headers.get("origin"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  })) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  if (importWritesAreDryRunOnly()) {
    return NextResponse.json({
      ok: false,
      error: "import_dry_run_only",
      message: "dry-run-only에서는 카드혜택 event 생성이 차단됩니다.",
    }, { status: 409 });
  }
  if (!(await getImportSchemaStatus()).actionExecutionSupported) {
    return NextResponse.json({ ok: false, error: "import_action_schema_unavailable" }, { status: 503 });
  }
  const operationKey = `pyeonhan-benefit:${parsed.value.importRowId}:${parsed.value.ruleId}`;
  const existing = await getImportActionOperation(operationKey);
  if (existing?.status === "created") {
    return NextResponse.json({ ok: true, status: "event_exists", operationKey, message: "이미 처리된 카드혜택 승인입니다." });
  }
  const reserved = await reserveImportActionOperation({
    rowId: parsed.value.importRowId,
    operationType: "benefit",
    operationKey,
  });
  if (!reserved) {
    return NextResponse.json({ ok: false, error: "benefit_operation_pending" }, { status: 409 });
  }
  const result = await approveRuntimePyeonhanBenefitCandidate(parsed.value);
  await finishImportOperationRecord({
    operationKey,
    status: result.ok ? "created" : "failed",
    errorMessage: result.ok ? null : result.message,
  });
  return NextResponse.json({ ...result, operationKey }, { status: result.status === "rejected" ? 400 : result.status === "failed" ? 500 : 200 });
}
