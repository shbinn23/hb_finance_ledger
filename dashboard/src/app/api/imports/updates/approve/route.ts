import { NextRequest, NextResponse } from "next/server";
import {
  importWritesAreDryRunOnly,
  parseImportRowActionRequest,
} from "@/server/import/import-actions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = parseImportRowActionRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  if (importWritesAreDryRunOnly()) {
    return NextResponse.json({
      ok: false,
      error: "import_dry_run_only",
      message: "수정 후보는 확인만 가능합니다. dry-run-only에서 Whooing 수정은 차단됩니다.",
    }, { status: 409 });
  }
  return NextResponse.json({
    ok: false,
    error: "import_update_not_enabled",
    message: "Whooing 거래 수정은 아직 활성화되지 않았습니다.",
  }, { status: 501 });
}
