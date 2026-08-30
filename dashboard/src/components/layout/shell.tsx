"use client";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { RefreshCw, RotateCw } from "lucide-react";
import { DashboardLedgerEntryDialog } from "./dashboard-ledger-entry-dialog";
import { SystemStatusPill } from "./system-status-pill";

type SyncStatus = "idle" | "ok" | "error";
const syncRequestDescription = "GitHub Actions 동기화 workflow를 요청합니다. 반영까지 시간이 걸릴 수 있습니다.";
const syncRequestConfirmMessage = "후잉 데이터를 다시 동기화 요청합니다. 이 작업은 후잉 원장을 수정하지 않지만, 동기화 workflow가 실행되어 로컬 DB의 whooing 데이터를 갱신할 수 있습니다. 진행할까요?";

export function Shell({ children }: { children: React.ReactNode }) {
  const [syncing, setSyncing]     = useState(false);
  const [status, setStatus]       = useState<SyncStatus>("idle");

  const handleSync = async () => {
    if (!window.confirm(syncRequestConfirmMessage)) return;

    setSyncing(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSyncing(false);
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const syncLabel =
    syncing          ? "요청 중" :
    status === "ok"  ? "요청 완료" :
    status === "error" ? "요청 실패" :
    "동기화 요청";

  const syncColor =
    status === "ok"    ? "var(--accent-green)" :
    status === "error" ? "var(--accent-red)"   :
    "var(--text-secondary)";

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-shell">
        <header className="topbar">
          <div>
            <p>Private finance dashboard</p>
            <strong>후잉 데이터 기반 운영 화면</strong>
          </div>
          <SystemStatusPill />
          <button
            onClick={handleSync}
            disabled={syncing}
            className="toolbar-button"
            title={status === "ok" ? "동기화 요청 완료. 반영까지 시간이 걸릴 수 있습니다." : syncRequestDescription}
            style={{ color: syncColor }}
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncLabel}
          </button>
          <DashboardLedgerEntryDialog />
          <button
            onClick={() => window.location.reload()}
            className="toolbar-button"
          >
            <RotateCw size={14} />
            화면 갱신
          </button>
        </header>
        <div className="page-frame">
          <div className="page-stack">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
