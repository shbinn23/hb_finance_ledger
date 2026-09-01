import { NextRequest, NextResponse } from "next/server";
import {
  importActionOriginIsAllowed,
  importWritesAreDryRunOnly,
  parseImportBenefitSelectionRequest,
} from "@/server/import/import-actions";
import { executeRuntimeImportBenefitSelection } from "@/server/import/import-action-runtime";
import { getImportSchemaStatus } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = parseImportBenefitSelectionRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
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
      message: "dry-run-only에서는 원장 및 카드혜택 반영이 차단됩니다.",
    }, { status: 409 });
  }
  if (!(await getImportSchemaStatus()).actionExecutionSupported) {
    return NextResponse.json({ ok: false, error: "import_action_schema_unavailable" }, { status: 503 });
  }
  const result = await executeRuntimeImportBenefitSelection(parsed.value);
  return NextResponse.json(result, {
    status: result.status === "rejected" ? 400 : result.status === "failed" ? 500 : 200,
  });
}
