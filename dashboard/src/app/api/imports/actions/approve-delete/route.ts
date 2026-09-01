import { NextRequest, NextResponse } from "next/server";
import {
  importActionOriginIsAllowed,
  importWritesAreDryRunOnly,
  parseImportDeleteRequest,
} from "@/server/import/import-actions";
import { executeRuntimeApprovedImportDelete } from "@/server/import/import-action-runtime";
import { getImportSchemaStatus } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = parseImportDeleteRequest(await request.json().catch(() => null));
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
      message: "dry-run-only에서는 Whooing 거래 삭제가 차단됩니다.",
    }, { status: 409 });
  }
  if (!(await getImportSchemaStatus()).deleteExecutionSupported) {
    return NextResponse.json({ ok: false, error: "import_delete_schema_unavailable" }, { status: 503 });
  }
  const result = await executeRuntimeApprovedImportDelete(parsed.value.importRowId);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status === "rejected" ? 400 : 500 });
}
