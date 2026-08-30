import { NextRequest, NextResponse } from "next/server";
import {
  importActionOriginIsAllowed,
  parseImportReviewRequest,
} from "@/server/import/import-actions";
import { executeRuntimeImportReviewAction } from "@/server/import/import-action-runtime";
import { getImportSchemaStatus } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = parseImportReviewRequest(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  if (!importActionOriginIsAllowed({
    origin: request.headers.get("origin"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  })) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  if (!(await getImportSchemaStatus()).actionExecutionSupported) {
    return NextResponse.json({ ok: false, error: "import_action_schema_unavailable" }, { status: 503 });
  }
  return NextResponse.json(await executeRuntimeImportReviewAction({
    rowIds: parsed.value.importRowIds,
    action: parsed.value.action,
  }));
}
