import { NextRequest, NextResponse } from "next/server";
import { executeRuntimePyeonhanBenefitCandidate } from "@/server/import/pyeonhan-benefit-runtime";
import {
  importActionOriginIsAllowed,
  importWritesAreDryRunOnly,
  parseImportBenefitRequest,
} from "@/server/import/import-actions";
import { getImportSchemaStatus } from "@/server/import/import-repository";

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
  const result = await executeRuntimePyeonhanBenefitCandidate(parsed.value);
  return NextResponse.json(result, { status: result.status === "rejected" ? 400 : result.status === "failed" ? 500 : 200 });
}
