import { NextRequest, NextResponse } from "next/server";
import { approveRuntimePyeonhanBenefitCandidate } from "@/server/import/pyeonhan-benefit-runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "JSON 요청이 필요합니다." }, { status: 400 });
  }
  const input = body as { importRowId?: unknown; ruleId?: unknown };
  if (!Number.isSafeInteger(input.importRowId) || Number(input.importRowId) <= 0 || typeof input.ruleId !== "string" || !input.ruleId) {
    return NextResponse.json({ ok: false, status: "rejected", message: "유효한 importRowId와 ruleId가 필요합니다." }, { status: 400 });
  }
  const result = await approveRuntimePyeonhanBenefitCandidate({
    importRowId: Number(input.importRowId),
    ruleId: input.ruleId,
  });
  return NextResponse.json(result, { status: result.status === "rejected" ? 400 : result.status === "failed" ? 500 : 200 });
}
