export type EtlStatus = "online" | "offline" | "unknown";
export type MirrorFreshness = "fresh" | "stale" | "empty";

export interface MirrorActivity {
  entryCount: number;
  lastActivityAt: Date | null;
  pendingSyncCount: number | null;
}

export interface ImportOperationsStatus {
  supported: boolean;
  latestBatchId: number | null;
  latestBatchStatus: string | null;
  latestFilename: string | null;
  sourceFileHash: string | null;
  normalizedCount: number;
  reviewRequiredCount: number;
  benefitApprovalCandidateCount: number;
  benefitEventExistsCount: number;
}

export interface SystemStatusDependencies {
  checkEtlHealth: () => Promise<EtlStatus>;
  getMirrorActivity: () => Promise<MirrorActivity>;
  getImportOperationsStatus?: () => Promise<ImportOperationsStatus>;
  now?: () => Date;
  getGmailImportStatus?: () => Promise<{
    enabled: boolean;
    state: "disabled" | "needs_credentials" | "ready";
    credentialsConfigured: boolean;
    dryRunOnly: boolean;
    label: string | null;
    autoExecuteEnabled: boolean;
    safeOnly: boolean;
    accountCreateEnabled: boolean;
    accountCreateRequiresApproval: boolean;
  }> | {
    enabled: boolean;
    state: "disabled" | "needs_credentials" | "ready";
    credentialsConfigured: boolean;
    dryRunOnly: boolean;
    label: string | null;
    autoExecuteEnabled: boolean;
    safeOnly: boolean;
    accountCreateEnabled: boolean;
    accountCreateRequiresApproval: boolean;
  };
}

export interface SystemStatus {
  etlStatus: EtlStatus;
  mirror: {
    entryCount: number;
    lastActivityAt: string | null;
    freshness: MirrorFreshness;
    freshnessThresholdHours: number;
    timestampMeaning: "last_row_update_estimate";
  };
  pendingSyncCount: number | null;
  pendingSyncSupported: boolean;
  gmailImport: {
    enabled: boolean;
    state: "disabled" | "needs_credentials" | "ready";
    credentialsConfigured: boolean;
    dryRunOnly: boolean;
    label: string | null;
  };
  importOperations: ImportOperationsStatus;
}

type HealthResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export const DEFAULT_MIRROR_FRESHNESS_THRESHOLD_HOURS = 24;

export function getMirrorFreshnessThresholdHours() {
  const value = Number(process.env.MIRROR_FRESHNESS_THRESHOLD_HOURS);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_MIRROR_FRESHNESS_THRESHOLD_HOURS;
}

export function classifyMirrorFreshness(
  lastActivityAt: Date | null,
  now: Date,
  thresholdHours = getMirrorFreshnessThresholdHours(),
): MirrorFreshness {
  if (!lastActivityAt) return "empty";
  const ageMs = now.getTime() - lastActivityAt.getTime();
  return ageMs <= thresholdHours * 60 * 60 * 1000 ? "fresh" : "stale";
}

export async function probeEtlHealth(request: () => Promise<HealthResponse>): Promise<EtlStatus> {
  try {
    const response = await request();
    if (!response.ok) return "unknown";
    const body = await response.json();
    return typeof body === "object" && body !== null && "ok" in body && body.ok === true
      ? "online"
      : "unknown";
  } catch (error) {
    return error instanceof TypeError ? "offline" : "unknown";
  }
}

export async function getSystemStatus(
  dependencies: SystemStatusDependencies,
): Promise<SystemStatus> {
  const now = dependencies.now?.() ?? new Date();
  const thresholdHours = getMirrorFreshnessThresholdHours();
  const [etlStatus, mirror, importOperations, gmailImport] = await Promise.all([
    dependencies.checkEtlHealth(),
    dependencies.getMirrorActivity(),
    dependencies.getImportOperationsStatus?.() ?? Promise.resolve({
      supported: false,
      latestBatchId: null,
      latestBatchStatus: null,
      latestFilename: null,
      sourceFileHash: null,
      normalizedCount: 0,
      reviewRequiredCount: 0,
      benefitApprovalCandidateCount: 0,
      benefitEventExistsCount: 0,
    }),
    dependencies.getGmailImportStatus?.() ?? Promise.resolve({
      enabled: false,
      state: "disabled" as const,
      credentialsConfigured: false,
      dryRunOnly: true,
      label: null,
      autoExecuteEnabled: false,
      safeOnly: false,
      accountCreateEnabled: false,
      accountCreateRequiresApproval: true,
    }),
  ]);

  return {
    etlStatus,
    mirror: {
      entryCount: mirror.entryCount,
      lastActivityAt: mirror.lastActivityAt?.toISOString() ?? null,
      freshness: classifyMirrorFreshness(mirror.lastActivityAt, now, thresholdHours),
      freshnessThresholdHours: thresholdHours,
      timestampMeaning: "last_row_update_estimate",
    },
    pendingSyncCount: mirror.pendingSyncCount,
    pendingSyncSupported: mirror.pendingSyncCount !== null,
    gmailImport,
    importOperations,
  };
}
