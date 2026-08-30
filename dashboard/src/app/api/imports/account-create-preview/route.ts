import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sourceAssetName = typeof body?.sourceAssetName === "string" ? body.sourceAssetName.trim() : "";
  if (!sourceAssetName) {
    return NextResponse.json({ ok: false, error: "invalid_source_asset" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    preview: { sourceAssetName, accountType: "assets" },
    liveCreationAllowed: false,
    message: "새 Whooing 계정 생성은 자동 실행하지 않습니다. 수동 생성 후 매핑해 주세요.",
  });
}
