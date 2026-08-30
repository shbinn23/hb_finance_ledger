import { NextRequest, NextResponse } from "next/server";
import type { DashboardLedgerEntryRequest } from "@/server/ledger/ledger-entry-service";
import { createRuntimeDashboardLedgerEntry } from "@/server/ledger/ledger-entry-runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let payload: DashboardLedgerEntryRequest;
  try {
    payload = await request.json() as DashboardLedgerEntryRequest;
  } catch {
    return NextResponse.json({
      ok: false,
      reason: "invalid_request",
      message: "요청 본문이 올바르지 않습니다.",
      fieldErrors: {},
    }, { status: 400 });
  }

  const result = await createRuntimeDashboardLedgerEntry(payload);

  if (!result.ok) {
    const status = result.reason === "whooing_failed"
      ? 502
      : result.reason === "operation_pending"
        ? 409
        : result.reason === "operation_unavailable"
          ? 503
          : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
