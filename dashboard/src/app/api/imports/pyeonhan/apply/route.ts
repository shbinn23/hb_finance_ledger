import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "legacy_bulk_apply_retired",
    message: "저장된 import row를 선택한 뒤 승인 콘솔에서 등록해 주세요.",
  }, { status: 410 });
}
