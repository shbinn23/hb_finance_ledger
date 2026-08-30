import { NextResponse } from "next/server";
import { getCurrentSystemStatus } from "@/server/system/system-status-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getCurrentSystemStatus());
  } catch {
    return NextResponse.json({
      etlStatus: "unknown",
      mirror: {
        entryCount: 0,
        lastActivityAt: null,
        freshness: "empty",
        freshnessThresholdHours: 24,
        timestampMeaning: "last_row_update_estimate",
      },
      pendingSyncCount: null,
      pendingSyncSupported: false,
    });
  }
}
