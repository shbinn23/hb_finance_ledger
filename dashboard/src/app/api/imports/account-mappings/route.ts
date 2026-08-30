import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  importActionOriginIsAllowed,
  parseImportMappingRequest,
} from "@/server/import/import-actions";
import {
  finishImportOperationRecord,
  getImportActionOperation,
  getImportSchemaStatus,
  reserveImportMappingOperation,
  saveImportMapping,
} from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!importActionOriginIsAllowed({
    origin: request.headers.get("origin"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  })) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const parsed = parseImportMappingRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  if (!(await getImportSchemaStatus()).actionExecutionSupported) {
    return NextResponse.json({ ok: false, error: "import_action_schema_unavailable" }, { status: 503 });
  }
  const operationKey = `pyeonhan-mapping:${createHash("sha256")
    .update(JSON.stringify(parsed.value))
    .digest("hex")}`;
  try {
    const existing = await getImportActionOperation(operationKey);
    if (existing?.status === "created") {
      return NextResponse.json({ ok: true, reused: true, operationKey, message: "이미 저장된 동일 매핑입니다." });
    }
    const reserved = await reserveImportMappingOperation({
      mappingType: parsed.value.mappingType,
      sourceKey: parsed.value.sourceKey,
      operationKey,
    });
    if (!reserved) {
      return NextResponse.json({ ok: false, error: "mapping_operation_pending" }, { status: 409 });
    }
    const mapping = await saveImportMapping(parsed.value);
    await finishImportOperationRecord({ operationKey, status: "created" });
    return NextResponse.json({
      ok: true,
      mapping,
      operationKey,
      message: "매핑을 저장했습니다. 같은 Excel을 다시 dry-run해 결과를 확인해 주세요.",
    });
  } catch (error) {
    await finishImportOperationRecord({
      operationKey,
      status: "failed",
      errorMessage: "mapping_save_failed",
    }).catch(() => undefined);
    const invalid = error instanceof Error && error.message === "invalid_mapping_target";
    return NextResponse.json({
      ok: false,
      error: invalid ? "invalid_mapping_target" : "mapping_save_failed",
    }, { status: invalid ? 400 : 500 });
  }
}
