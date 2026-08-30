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
      gmailImport: {
        enabled: false,
        state: "disabled",
        credentialsConfigured: false,
        dryRunOnly: true,
        label: null,
        autoExecuteEnabled: false,
        safeOnly: false,
        accountCreateEnabled: false,
        accountCreateRequiresApproval: true,
      },
      importOperations: {
        supported: false,
        latestBatchId: null,
        latestBatchStatus: null,
        sourceFileHash: null,
        reviewRequiredCount: 0,
        benefitApprovalCandidateCount: 0,
        benefitEventExistsCount: 0,
      },
    });
  }
}
