import { NextRequest, NextResponse } from "next/server";
import {
  importActionOriginIsAllowed,
  importWritesAreDryRunOnly,
  parseImportUpdateRequest,
} from "@/server/import/import-actions";
import { executeRuntimeApprovedImportUpdate } from "@/server/import/import-action-runtime";
import { getImportSchemaStatus } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = parseImportUpdateRequest(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
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
      message: "dry-run-only에서는 Whooing 거래 수정이 차단됩니다.",
    }, { status: 409 });
  }
  if (!(await getImportSchemaStatus()).actionExecutionSupported) {
    return NextResponse.json({ ok: false, error: "import_action_schema_unavailable" }, { status: 503 });
  }
  const result = await executeRuntimeApprovedImportUpdate(parsed.value.importRowId);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status === "rejected" ? 400 : 500 });
}
