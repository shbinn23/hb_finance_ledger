export type EtlStatus = "online" | "offline" | "unknown";
export type MirrorFreshness = "fresh" | "stale" | "empty";

export interface MirrorActivity {
  entryCount: number;
  lastActivityAt: Date | null;
  pendingSyncCount: number | null;
}

export interface SystemStatusDependencies {
  checkEtlHealth: () => Promise<EtlStatus>;
  getMirrorActivity: () => Promise<MirrorActivity>;
  now?: () => Date;
  getGmailImportStatus?: () => {
    enabled: boolean;
    state: "disabled" | "needs_credentials" | "ready";
    credentialsConfigured: boolean;
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
  };
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
  const [etlStatus, mirror] = await Promise.all([
    dependencies.checkEtlHealth(),
    dependencies.getMirrorActivity(),
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
    gmailImport: dependencies.getGmailImportStatus?.() ?? {
      enabled: false,
      state: "disabled",
      credentialsConfigured: false,
    },
  };
}
