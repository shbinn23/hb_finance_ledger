"use client";

import { useState } from "react";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ImportStatus =
  | "auto_creatable"
  | "duplicate"
  | "mapping_required"
  | "possible_update"
  | "possible_delete"
  | "conflict"
  | "review_required";

interface DryRunRow {
  transaction: {
    sourceRowIndexes: number[];
    occurredDate: string;
    entryType: string;
    sourceAssetName: string;
    counterpartyAssetName: string | null;
    sourceCategoryName: string | null;
    sourceSubcategoryName: string | null;
    item: string;
    memo: string;
    postingAmount: number;
    approvalAmount: number;
  };
  status: ImportStatus;
  reason: string;
  matchedWhooingEntryId: number | null;
}

interface DryRunResult {
  filename: string;
  sourceRowCount: number;
  startDate: string;
  endDate: string;
  schema: { autoApplySupported: boolean };
  rows: DryRunRow[];
  possibleDeletes: DryRunRow[];
  summary: {
    total: number;
    autoCreatable: number;
    duplicates: number;
    mappingRequired: number;
    reviewRequired: number;
    possibleUpdates: number;
    possibleDeletes: number;
    conflicts: number;
  };
}

const labels: Record<ImportStatus, { label: string; tone: "stable" | "watch" | "over" | "neutral" }> = {
  auto_creatable: { label: "자동등록 가능", tone: "stable" },
  duplicate: { label: "중복", tone: "neutral" },
  mapping_required: { label: "매핑 필요", tone: "watch" },
  possible_update: { label: "수정 후보", tone: "watch" },
  possible_delete: { label: "삭제 후보", tone: "watch" },
  conflict: { label: "충돌", tone: "over" },
  review_required: { label: "검토 필요", tone: "watch" },
};

function won(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function ImportsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request(path: string, confirmed = false) {
    if (!file) {
      setMessage("Excel 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      if (confirmed) body.set("confirmed", "true");
      const response = await fetch(path, { method: "POST", body });
      const payload = await response.json() as { ok: boolean; message?: string } & Partial<DryRunResult>;
      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "요청에 실패했습니다.");
        return;
      }
      if (!confirmed) setResult(payload as DryRunResult);
      setMessage(payload.message ?? "dry-run 비교를 완료했습니다.");
    } catch {
      setMessage("서버 요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result || !window.confirm(
      "자동 등록은 신규 확정 거래만 수행하며, 수정/삭제는 자동 반영하지 않습니다. 실제 Whooing 원장에 등록할까요?",
    )) return;
    await request("/api/imports/pyeonhan/apply", true);
  }

  const rows = result ? [...result.rows, ...result.possibleDeletes] : [];

  return (
    <>
      <section className="section-hero">
        <div>
          <p className="eyebrow compact">Import Control</p>
          <h1>편한가계부 가져오기</h1>
          <p>Excel snapshot을 Whooing mirror와 비교하고 확실한 신규 거래만 등록합니다.</p>
        </div>
        <Badge tone="neutral">Review first</Badge>
      </section>

      <Card className="import-upload-card">
        <CardHeader>
          <CardDescription>Excel snapshot</CardDescription>
          <CardTitle>업로드 및 dry-run</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="import-upload-row">
            <label className="import-file-field">
              <FileSpreadsheet size={18} />
              <span>{file?.name ?? ".xlsx 파일 선택"}</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(null);
                  setMessage("");
                }}
              />
            </label>
            <Button disabled={busy || !file} onClick={() => request("/api/imports/pyeonhan/dry-run")}>
              <Upload size={15} />
              {busy ? "비교 중" : "dry-run 비교"}
            </Button>
          </div>
          <p className="metric-detail">현재 Gmail 자동 감지는 설정 전입니다. 5MB 이하 편한가계부 .xlsx 파일을 사용하세요.</p>
          {message ? <p className="import-feedback" role="status">{message}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="import-summary-grid">
            {[
              ["정규화 거래", result.summary.total],
              ["자동등록 가능", result.summary.autoCreatable],
              ["중복", result.summary.duplicates],
              ["검토·매핑", result.summary.reviewRequired + result.summary.mappingRequired],
              ["수정·삭제·충돌", result.summary.possibleUpdates + result.summary.possibleDeletes + result.summary.conflicts],
            ].map(([label, value]) => (
              <Card key={String(label)} className="import-summary-card">
                <CardDescription>{label}</CardDescription>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>

          {!result.schema.autoApplySupported ? (
            <div className="import-warning">
              <AlertTriangle size={17} />
              <p>import/ledger operation migration 미적용 상태입니다. dry-run만 가능하며 자동 등록은 비활성화됩니다.</p>
            </div>
          ) : null}

          <Card className="transaction-panel">
            <CardHeader>
              <CardDescription>{result.startDate}~{result.endDate}</CardDescription>
              <div className="metric-card-top">
                <CardTitle>거래 비교 결과</CardTitle>
                <Button
                  size="sm"
                  disabled={busy || !result.schema.autoApplySupported || result.summary.autoCreatable === 0}
                  onClick={apply}
                >
                  신규 확정 거래 자동 등록
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="metric-detail">수정·삭제 후보는 표시만 하며 자동 반영하지 않습니다.</p>
              <div className="table-scroll">
                <table className="data-table import-table">
                  <thead>
                    <tr>
                      <th>원본 행</th><th>날짜</th><th>유형</th><th>자산</th><th>내용</th>
                      <th className="amount">매입금액</th><th>상태</th><th>비교 근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const status = labels[row.status];
                      return (
                        <tr key={`${row.transaction.sourceRowIndexes.join("-")}-${row.status}-${index}`}>
                          <td>{row.transaction.sourceRowIndexes.join(", ") || "이전 snapshot"}</td>
                          <td>{row.transaction.occurredDate || "-"}</td>
                          <td>{row.transaction.entryType}</td>
                          <td>{row.transaction.sourceAssetName || "-"}</td>
                          <td><strong>{row.transaction.item || "-"}</strong><small>{row.transaction.memo}</small></td>
                          <td className="amount">{won(row.transaction.postingAmount)}</td>
                          <td><Badge tone={status.tone}>{status.label}</Badge></td>
                          <td>{row.reason}{row.matchedWhooingEntryId ? ` · #${row.matchedWhooingEntryId}` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
