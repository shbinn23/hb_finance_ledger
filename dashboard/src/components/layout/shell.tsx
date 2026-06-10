"use client";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { RefreshCw, RotateCw } from "lucide-react";

type SyncStatus = "idle" | "ok" | "error";

export function Shell({ children }: { children: React.ReactNode }) {
  const [syncing, setSyncing]     = useState(false);
  const [status, setStatus]       = useState<SyncStatus>("idle");

  const handleSync = async () => {
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
    syncing          ? "동기화 중" :
    status === "ok"  ? "완료" :
    status === "error" ? "실패" :
    "후잉 동기화";

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
          <button
            onClick={handleSync}
            disabled={syncing}
            className="toolbar-button"
            style={{ color: syncColor }}
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncLabel}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="toolbar-button"
          >
            <RotateCw size={14} />
            갱신
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
