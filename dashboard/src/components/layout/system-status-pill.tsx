"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

type SystemStatus = {
  etlStatus: "online" | "offline" | "unknown";
  mirror: {
    lastActivityAt: string | null;
    freshness: "fresh" | "stale" | "empty";
  };
  pendingSyncCount: number | null;
};

function statusLabel(status: SystemStatus | null) {
  if (!status) return "상태 확인 중";
  if (status.etlStatus === "offline") return "ETL 오프라인";
  if (status.mirror.freshness === "stale") return "Mirror 지연";
  if (status.etlStatus === "online") return "ETL 온라인";
  return "상태 미확인";
}

export function SystemStatusPill() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/system/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: SystemStatus) => {
        if (active) setStatus(body);
      })
      .catch(() => {
        if (active) {
          setStatus({
            etlStatus: "unknown",
            mirror: { lastActivityAt: null, freshness: "empty" },
            pendingSyncCount: null,
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const delayed = status?.etlStatus === "offline" || status?.mirror.freshness === "stale";
  const title = status?.mirror.lastActivityAt
    ? `마지막 mirror row 갱신 추정: ${new Date(status.mirror.lastActivityAt).toLocaleString("ko-KR")}`
    : "Mirror row 갱신 시각을 확인할 수 없습니다.";

  return (
    <span className={`system-status-pill${delayed ? " delayed" : ""}`} title={title}>
      <Activity size={13} />
      {statusLabel(status)}
      {status?.pendingSyncCount ? ` · 대기 ${status.pendingSyncCount}` : ""}
    </span>
  );
}
