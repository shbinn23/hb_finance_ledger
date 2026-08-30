"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileSpreadsheet, MailSearch, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ImportStatus = "auto_creatable" | "duplicate" | "mapping_required" | "possible_update"
  | "possible_delete" | "conflict" | "review_required" | "created" | "updated"
  | "skipped" | "reviewed" | "write_failed";
type ImportViewFilter = "all" | "new" | "update" | "transfer" | "mapping"
  | "benefit" | "review" | "duplicate";
type BenefitStatus = "not_applicable" | "rule_matched" | "rule_uncertain" | "event_exists"
  | "needs_review" | "approved" | "skipped" | "created" | "failed";

interface DryRunRow {
  importRowId?: number | null;
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
    discountAmount: number;
  };
  status: ImportStatus;
  reason: string;
  matchedWhooingEntryId: number | null;
  changes: Array<{
    field: string;
    label: string;
    before: string | number | null;
    after: string | number | null;
  }>;
  mirrorChanges: Array<{
    field: string;
    label: string;
    before: string | number | null;
    after: string | number | null;
  }>;
  cardBenefitStatus: BenefitStatus;
  benefitEventIntegrity: "not_applicable" | "missing" | "matched" | "amount_mismatch";
  cardBenefitCandidate: {
    ruleId: string;
    label: string;
    reason: string;
    discountRateBps: number;
    performanceAmount: number;
    confidence: number;
  } | null;
}

interface DryRunResult {
  filename: string;
  batchId?: number;
  sourceRowCount: number;
  startDate: string;
  endDate: string;
  schema: {
    importTablesAvailable: boolean;
    benefitReviewSupported: boolean;
    autoApplySupported: boolean;
    actionExecutionSupported: boolean;
  };
  rows: DryRunRow[];
  possibleDeletes: DryRunRow[];
  mappingGaps: Array<{
    mappingType: "asset" | "expense_category" | "income_category";
    sourceKey: string;
    count: number;
    amountTotal: number;
    entryTypes: string[];
    suggestions: Array<{
      mappingType: "asset" | "expense_category" | "income_category";
      sourceKey: string;
      accountType: string;
      accountId: string;
    }>;
  }>;
  summary: {
    total: number;
    autoCreatable: number;
    duplicates: number;
    mappingRequired: number;
    reviewRequired: number;
    possibleUpdates: number;
    possibleDeletes: number;
    conflicts: number;
    benefitCandidates: number;
    benefitUncertain: number;
    benefitExisting: number;
    benefitEventMissing: number;
    benefitAmountMismatches: number;
  };
}

interface ImportRuntimeStatus {
  gmailImport: {
    state: "disabled" | "needs_credentials" | "ready";
    dryRunOnly: boolean;
  };
  importOperations: {
    supported: boolean;
    latestBatchId: number | null;
    latestBatchStatus: string | null;
    latestFilename: string | null;
    sourceFileHash: string | null;
    normalizedCount: number;
    reviewRequiredCount: number;
    benefitApprovalCandidateCount: number;
    benefitEventExistsCount: number;
  };
}

interface ImportActionHistoryItem {
  id: number;
  rowId: number | null;
  operationType: string;
  status: string;
  whooingEntryId: number | null;
  errorMessage: string | null;
  updatedAt: string;
}

const labels: Record<ImportStatus, { label: string; tone: "stable" | "watch" | "over" | "neutral" }> = {
  auto_creatable: { label: "자동등록 가능", tone: "stable" },
  duplicate: { label: "중복", tone: "neutral" },
  mapping_required: { label: "매핑 필요", tone: "watch" },
  possible_update: { label: "수정 후보", tone: "watch" },
  possible_delete: { label: "삭제 후보", tone: "watch" },
  conflict: { label: "충돌", tone: "over" },
  review_required: { label: "검토 필요", tone: "watch" },
  created: { label: "등록 완료", tone: "stable" },
  updated: { label: "수정 완료", tone: "stable" },
  skipped: { label: "건너뜀", tone: "neutral" },
  reviewed: { label: "검토 완료", tone: "neutral" },
  write_failed: { label: "처리 실패", tone: "over" },
};

const benefitLabels: Record<BenefitStatus, { label: string; tone: "stable" | "watch" | "over" | "neutral" }> = {
  not_applicable: { label: "해당 없음", tone: "neutral" },
  rule_matched: { label: "rule 확정", tone: "stable" },
  rule_uncertain: { label: "rule 불확실", tone: "watch" },
  event_exists: { label: "event 존재", tone: "neutral" },
  needs_review: { label: "근거 확인 필요", tone: "watch" },
  approved: { label: "승인 처리 중", tone: "watch" },
  skipped: { label: "건너뜀", tone: "neutral" },
  created: { label: "event 생성", tone: "stable" },
  failed: { label: "생성 실패", tone: "over" },
};

function won(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function changeValue(value: string | number | null) {
  if (value === null || value === "") return "없음";
  return typeof value === "number" ? won(value) : value;
}

function rowMatchesFilter(row: DryRunRow, filter: ImportViewFilter) {
  if (filter === "all") return true;
  if (filter === "new") return row.status === "auto_creatable";
  if (filter === "update") return row.status === "possible_update" || row.status === "possible_delete";
  if (filter === "transfer") return row.transaction.entryType === "transfer";
  if (filter === "mapping") return row.status === "mapping_required";
  if (filter === "benefit") return row.cardBenefitStatus !== "not_applicable";
  if (filter === "duplicate") return row.status === "duplicate";
  return row.status === "review_required" || row.status === "conflict";
}

export function ImportsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyBenefitRowId, setBusyBenefitRowId] = useState<number | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [busyMappingKey, setBusyMappingKey] = useState("");
  const [message, setMessage] = useState("");
  const [viewFilter, setViewFilter] = useState<ImportViewFilter>("all");
  const [runtimeStatus, setRuntimeStatus] = useState<ImportRuntimeStatus | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [busyActionRowId, setBusyActionRowId] = useState<number | null>(null);
  const [actionHistory, setActionHistory] = useState<ImportActionHistoryItem[]>([]);

  function refreshRuntimeStatus() {
    return fetch("/api/system/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: ImportRuntimeStatus) => setRuntimeStatus(payload))
      .catch(() => setRuntimeStatus(null));
  }

  function refreshActionHistory() {
    return fetch("/api/imports/actions/history", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { operations?: ImportActionHistoryItem[] }) => setActionHistory(payload.operations ?? []))
      .catch(() => setActionHistory([]));
  }

  useEffect(() => {
    void refreshRuntimeStatus();
    void refreshActionHistory();
  }, []);

  async function pollGmail() {
    setGmailBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/gmail/poll", { method: "POST" });
      const payload = await response.json() as { message?: string; latestBatch?: DryRunResult | null };
      setMessage(payload.message ?? "Gmail dry-run 확인을 마쳤습니다.");
      if (response.ok) {
        if (payload.latestBatch) {
          setResult(payload.latestBatch);
          setSelectedRowIds([]);
        }
        await refreshRuntimeStatus();
        await refreshActionHistory();
      }
    } catch {
      setMessage("Gmail read-only 확인 중 오류가 발생했습니다.");
    } finally {
      setGmailBusy(false);
    }
  }

  async function fileRequest(path: string, mode: "dry-run" | "review" | "apply") {
    if (!file) {
      setMessage("Excel 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      if (mode === "apply") body.set("confirmed", "true");
      const response = await fetch(path, { method: "POST", body });
      const payload = await response.json() as { ok: boolean; message?: string } & Partial<DryRunResult>;
      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "요청에 실패했습니다.");
        return;
      }
      if (mode !== "apply") {
        setResult(payload as DryRunResult);
        setSelectedRowIds([]);
      }
      setMessage(payload.message ?? (mode === "dry-run" ? "dry-run 비교를 완료했습니다." : "요청을 완료했습니다."));
    } catch {
      setMessage("서버 요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function updateRowStatus(rowId: number, status: ImportStatus) {
    setResult((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.importRowId === rowId ? { ...row, status } : row),
      possibleDeletes: current.possibleDeletes.map((row) => row.importRowId === rowId ? { ...row, status } : row),
    } : current);
  }

  async function apply() {
    if (!result || selectedRowIds.length === 0) {
      setMessage("Whooing 원장에 실제 등록할 신규 거래를 선택해 주세요.");
      return;
    }
    if (!window.confirm(
      `선택한 신규 확정 거래 ${selectedRowIds.length}건을 Whooing 원장에 실제 등록합니다. 수정·삭제는 포함되지 않습니다. 진행할까요?`,
    )) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/actions/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importRowIds: selectedRowIds, confirmed: true }),
      });
      const payload = await response.json() as {
        message?: string;
        created?: number;
        reused?: number;
        failed?: number;
        syncPending?: number;
        results?: Array<{ rowId: number; status: "created" | "reused" | "skipped" | "failed" }>;
      };
      payload.results?.forEach((item) => {
        if (item.status === "created" || item.status === "reused") updateRowStatus(item.rowId, "created");
        if (item.status === "failed") updateRowStatus(item.rowId, "write_failed");
      });
      setSelectedRowIds([]);
      setMessage(payload.message ?? (response.ok
        ? `등록 ${payload.created ?? 0}건 · 재사용 ${payload.reused ?? 0}건 · 실패 ${payload.failed ?? 0}건${payload.syncPending ? ` · 동기화 대기 ${payload.syncPending}건` : ""}`
        : "신규 거래 등록에 실패했습니다."));
      await refreshActionHistory();
      await refreshRuntimeStatus();
    } catch {
      setMessage("신규 거래 등록 요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function approveUpdate(row: DryRunRow) {
    if (!row.importRowId || !window.confirm(
      `mirror #${row.matchedWhooingEntryId ?? "-"} Whooing 거래를 실제 수정합니다. 표시된 수정 전 → 현재 값을 확인했나요?`,
    )) return;
    setBusyActionRowId(row.importRowId);
    setMessage("");
    try {
      const response = await fetch("/api/imports/actions/approve-update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importRowId: row.importRowId, confirmed: true }),
      });
      const payload = await response.json() as { status?: string; message?: string };
      if (response.ok && (payload.status === "updated" || payload.status === "reused")) {
        updateRowStatus(row.importRowId, "updated");
      }
      setMessage(payload.message ?? (response.ok ? "Whooing 거래 수정을 완료했습니다." : "Whooing 거래 수정에 실패했습니다."));
      await refreshActionHistory();
    } catch {
      setMessage("Whooing 거래 수정 요청 중 오류가 발생했습니다.");
    } finally {
      setBusyActionRowId(null);
    }
  }

  async function markReviewed(row: DryRunRow, action: "skip" | "review") {
    if (!row.importRowId || !window.confirm(
      action === "skip" ? "이 후보를 건너뜀으로 표시할까요? 원장 거래는 삭제하지 않습니다." : "이 후보를 검토 완료로 표시할까요? 원장은 변경하지 않습니다.",
    )) return;
    setBusyActionRowId(row.importRowId);
    setMessage("");
    try {
      const response = await fetch("/api/imports/actions/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importRowIds: [row.importRowId], action, confirmed: true }),
      });
      const payload = await response.json() as { message?: string; updated?: number };
      if (response.ok && payload.updated) updateRowStatus(row.importRowId, action === "skip" ? "skipped" : "reviewed");
      setMessage(payload.message ?? (response.ok ? "검토 상태를 저장했습니다." : "검토 상태 저장에 실패했습니다."));
      await refreshActionHistory();
    } catch {
      setMessage("검토 상태 저장 중 오류가 발생했습니다.");
    } finally {
      setBusyActionRowId(null);
    }
  }

  async function approveBenefit(row: DryRunRow) {
    if (!row.importRowId || !row.cardBenefitCandidate || !window.confirm(
      "후잉 원장은 수정하지 않고 app.card_benefit_events만 생성합니다. 승인금액, 매입금액, 할인금액, 실적금액이 분리 저장됩니다. 진행할까요?",
    )) return;
    setBusyBenefitRowId(row.importRowId);
    setMessage("");
    try {
      const response = await fetch("/api/imports/benefit-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importRowId: row.importRowId, ruleId: row.cardBenefitCandidate.ruleId, confirmed: true }),
      });
      const payload = await response.json() as { benefitStatus?: BenefitStatus; message?: string };
      setMessage(payload.message ?? "카드혜택 승인 요청을 처리했습니다.");
      if (payload.benefitStatus) {
        setResult((current) => current ? {
          ...current,
          rows: current.rows.map((candidate) => candidate.importRowId === row.importRowId
            ? { ...candidate, cardBenefitStatus: payload.benefitStatus ?? candidate.cardBenefitStatus }
            : candidate),
        } : current);
      }
      await refreshActionHistory();
    } catch {
      setMessage("카드혜택 승인 요청 중 오류가 발생했습니다.");
    } finally {
      setBusyBenefitRowId(null);
    }
  }

  async function saveMapping(
    gap: DryRunResult["mappingGaps"][number],
    suggestion: DryRunResult["mappingGaps"][number]["suggestions"][number],
  ) {
    if (!window.confirm(
      `'${gap.sourceKey}' ${gap.count}건을 ${suggestion.accountType}:${suggestion.accountId}에 매핑합니다. 저장 후 같은 Excel을 다시 dry-run해야 합니다. 진행할까요?`,
    )) return;
    const key = `${gap.mappingType}:${gap.sourceKey}`;
    setBusyMappingKey(key);
    try {
      const response = await fetch("/api/imports/account-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mappingType: gap.mappingType,
          sourceKey: gap.sourceKey,
          accountType: suggestion.accountType,
          accountId: suggestion.accountId,
          confirmed: true,
        }),
      });
      const payload = await response.json() as { message?: string };
      setMessage(payload.message ?? (response.ok ? "매핑을 저장했습니다." : "매핑 저장에 실패했습니다."));
    } catch {
      setMessage("매핑 저장 중 오류가 발생했습니다.");
    } finally {
      setBusyMappingKey("");
    }
  }

  const rows = result ? [...result.rows, ...result.possibleDeletes] : [];
  const filteredRows = rows.filter((row) => rowMatchesFilter(row, viewFilter));
  const benefitRows = result?.rows.filter((row) => row.transaction.discountAmount > 0) ?? [];
  const benefitRuleSummary = [...benefitRows.reduce((summary, row) => {
    const candidate = row.cardBenefitCandidate;
    if (!candidate) return summary;
    const current = summary.get(candidate.ruleId) ?? {
      ruleId: candidate.ruleId,
      label: candidate.label,
      count: 0,
      approvalAmount: 0,
      performanceAmount: 0,
      postingAmount: 0,
      discountAmount: 0,
    };
    current.count += 1;
    current.approvalAmount += row.transaction.approvalAmount;
    current.performanceAmount += candidate.performanceAmount;
    current.postingAmount += row.transaction.postingAmount;
    current.discountAmount += row.transaction.discountAmount;
    summary.set(candidate.ruleId, current);
    return summary;
  }, new Map<string, {
    ruleId: string;
    label: string;
    count: number;
    approvalAmount: number;
    performanceAmount: number;
    postingAmount: number;
    discountAmount: number;
  }>()).values()];
  const gmailState = runtimeStatus?.gmailImport.state ?? "disabled";
  const gmailLabel = gmailState === "ready" ? "연결 준비 완료" : gmailState === "needs_credentials" ? "credential 필요" : "비활성";
  const transferCount = result?.rows.filter((row) => row.transaction.entryType === "transfer").length ?? 0;
  const refundReviewCount = result?.rows.filter((row) => /환급|캐시백/.test(row.reason)).length ?? 0;
  const newCandidateCount = result?.rows.filter((row) => ![
    "duplicate", "possible_update", "conflict",
  ].includes(row.status)).length ?? 0;
  const dryRunOnly = runtimeStatus?.gmailImport.dryRunOnly ?? true;
  const actionExecutionSupported = result?.schema.actionExecutionSupported ?? false;

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
        <CardHeader><CardDescription>Excel snapshot</CardDescription><CardTitle>업로드 및 dry-run</CardTitle></CardHeader>
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
            <Button disabled={busy || !file} onClick={() => fileRequest("/api/imports/pyeonhan/dry-run", "dry-run")}>
              <Upload size={15} />{busy ? "처리 중" : "dry-run 비교"}
            </Button>
          </div>
          <div className="import-upload-row">
            <div>
              <p className="metric-detail">Gmail 자동 감지: {gmailLabel} · {runtimeStatus?.gmailImport.dryRunOnly ?? true ? "dry-run only" : "write 허용"}.</p>
              <p className="metric-detail">메일과 첨부를 읽기만 하며 후잉 원장은 변경하지 않습니다. 5MB 이하 편한가계부 .xlsx 파일을 사용하세요.</p>
            </div>
            <Button
              variant="secondary"
              disabled={gmailBusy || gmailState !== "ready"}
              onClick={pollGmail}
            >
              <MailSearch size={15} />{gmailBusy ? "확인 중" : "Gmail dry-run 확인"}
            </Button>
          </div>
          <p className="metric-detail">최근 import batch: {runtimeStatus?.importOperations.latestBatchId
            ? `#${runtimeStatus.importOperations.latestBatchId} · ${runtimeStatus.importOperations.latestBatchStatus} · ${runtimeStatus.importOperations.latestFilename ?? "파일명 없음"} · 해시 ${runtimeStatus.importOperations.sourceFileHash?.slice(0, 8) ?? "-"}… · 정규화 ${runtimeStatus.importOperations.normalizedCount}건 · 검토 필요 ${runtimeStatus.importOperations.reviewRequiredCount}건 · 승인 후보 ${runtimeStatus.importOperations.benefitApprovalCandidateCount}건 · 기존 event ${runtimeStatus.importOperations.benefitEventExistsCount}건`
            : "없음"}</p>
          {message ? <p className="import-feedback" role="status">{message}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="import-summary-grid">
            {[
              ["신규 거래 후보", newCandidateCount],
              ["수정 후보", result.summary.possibleUpdates],
              ["새 자산·매핑", result.summary.mappingRequired],
              ["이체 후보", transferCount],
              ["카드혜택 후보", result.summary.benefitCandidates],
              ["환급·캐시백 검토", refundReviewCount],
              ["자동등록 가능", result.summary.autoCreatable],
              ["dry-run-only", (runtimeStatus?.gmailImport.dryRunOnly ?? true) ? "ON" : "OFF"],
            ].map(([label, value]) => (
              <Card key={String(label)} className="import-summary-card">
                <CardDescription>{label}</CardDescription><strong>{value}</strong>
              </Card>
            ))}
          </div>
          <div className="import-integrity-strip" aria-label="import 검산 상태">
            <span>중복 <strong>{result.summary.duplicates}</strong></span>
            <span>삭제 후보 <strong>{result.summary.possibleDeletes}</strong></span>
            <span>충돌 <strong>{result.summary.conflicts}</strong></span>
            <span>기존 event <strong>{result.summary.benefitExisting}</strong></span>
            <span>event 누락 <strong>{result.summary.benefitEventMissing}</strong></span>
            <span>금액 불일치 <strong>{result.summary.benefitAmountMismatches}</strong></span>
          </div>

          {!result.schema.actionExecutionSupported || !result.schema.benefitReviewSupported ? (
            <div className="import-warning"><AlertTriangle size={17} /><p>import/ledger operation 또는 benefit review migration 미적용 상태입니다. 지원되지 않는 write 작업은 비활성화됩니다.</p></div>
          ) : null}
          <div className="import-warning import-policy-note">
            <AlertTriangle size={17} />
            <p>자동 삭제와 신규 계정 자동 생성은 지원하지 않습니다. 수정 후보는 단건 승인 후 반영하고 삭제 후보는 review-only입니다. 환급/캐시백은 수입, 지출 환급, 카드 할인 중 의미가 섞일 수 있어 자동 처리하지 않습니다. 수입 의미가 섞여 있어 수동 정책 필요 상태입니다. 민생지원쿠폰 차액조정은 balance adjustment 또는 별도 지원금 처리 정책 확정 전까지 review-only입니다.</p>
          </div>

          {result.summary.benefitCandidates === 0
            && result.summary.benefitExisting > 0
            && result.summary.benefitEventMissing === 0
            && result.summary.benefitAmountMismatches === 0 ? (
              <div className="import-feedback" role="status">
                <strong>현재 추가로 승인할 카드혜택 후보는 없습니다.</strong>
                <p>감지된 할인 거래는 모두 기존 event와 정상 연결되어 있습니다. 신규 할인 후보가 생기면 rule_matched 상태로 표시됩니다.</p>
              </div>
            ) : null}

          {benefitRows.length > 0 ? (
            <Card className="transaction-panel">
              <CardHeader>
                <CardDescription>원장 수정 없음, 카드혜택 event만 생성</CardDescription>
                <div className="metric-card-top">
                  <CardTitle>카드혜택 후보 승인</CardTitle>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || Boolean(result.batchId) || !result.schema.benefitReviewSupported}
                    onClick={() => fileRequest("/api/imports/pyeonhan/review", "review")}
                  >
                    {result.batchId ? `검토 batch #${result.batchId}` : "검토 batch 저장"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="metric-detail">rule 확정 후보만 단건 승인할 수 있습니다. 불확실 할인은 자동 event 생성 대상이 아닙니다.</p>
                {benefitRuleSummary.length > 0 ? (
                  <div className="import-mapping-list">
                    {benefitRuleSummary.map((rule) => (
                      <div key={rule.ruleId}>
                        <Badge tone="neutral">{rule.count}건</Badge>
                        <strong>{rule.label}</strong>
                        <span>승인 {won(rule.approvalAmount)} · 실적 {won(rule.performanceAmount)} · 매입 {won(rule.postingAmount)} · 할인 {won(rule.discountAmount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="table-scroll">
                  <table className="data-table import-benefit-table">
                    <thead><tr>
                      <th>날짜</th><th>카드</th><th>분류</th><th>내용</th><th>원본/import ID</th><th>mirror ID</th>
                      <th className="amount">승인금액</th><th className="amount">매입금액</th><th className="amount">할인</th>
                      <th className="amount">실적 후보</th><th>할인율</th><th>추정 rule</th><th>신뢰도</th><th>상태</th><th>액션</th>
                    </tr></thead>
                    <tbody>
                      {benefitRows.map((row) => {
                        const benefit = benefitLabels[row.cardBenefitStatus];
                        const canApprove = row.cardBenefitStatus === "rule_matched"
                          && Boolean(row.importRowId && row.matchedWhooingEntryId && row.cardBenefitCandidate);
                        return (
                          <tr key={`benefit-${row.transaction.sourceRowIndexes.join("-")}-${row.transaction.item}`}>
                            <td>{row.transaction.occurredDate}</td>
                            <td>{row.transaction.sourceAssetName}</td>
                            <td>{[row.transaction.sourceCategoryName, row.transaction.sourceSubcategoryName].filter(Boolean).join(" / ") || "-"}</td>
                            <td><strong>{row.transaction.item}</strong><small>{row.transaction.memo}</small></td>
                            <td>{row.transaction.sourceRowIndexes.join(", ")} / {row.importRowId ?? "저장 전"}</td>
                            <td>{row.matchedWhooingEntryId ? `#${row.matchedWhooingEntryId}` : "-"}</td>
                            <td className="amount">{won(row.transaction.approvalAmount)}</td>
                            <td className="amount">{won(row.transaction.postingAmount)}</td>
                            <td className="amount">{won(row.transaction.discountAmount)}</td>
                            <td className="amount">{row.cardBenefitCandidate ? won(row.cardBenefitCandidate.performanceAmount) : "-"}</td>
                            <td>{row.cardBenefitCandidate ? `${row.cardBenefitCandidate.discountRateBps / 100}%` : "-"}</td>
                            <td>{row.cardBenefitCandidate?.label ?? "확정 불가"}</td>
                            <td>{row.cardBenefitCandidate ? `${Math.round(row.cardBenefitCandidate.confidence * 100)}%` : "-"}</td>
                            <td><Badge tone={benefit.tone}>{benefit.label}</Badge></td>
                            <td><Button size="sm" disabled={!canApprove || busyBenefitRowId === row.importRowId || dryRunOnly || !actionExecutionSupported} onClick={() => approveBenefit(row)}>
                              {row.cardBenefitStatus === "created" || row.cardBenefitStatus === "event_exists"
                                ? "생성 완료" : !result.batchId ? "검토 저장 필요" : "event 승인"}
                            </Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {result.mappingGaps.length > 0 ? (
            <Card>
              <CardHeader><CardDescription>새 자산·분류 후보</CardDescription><CardTitle>확인이 필요한 원본 값</CardTitle></CardHeader>
              <CardContent><div className="import-mapping-list">
                {result.mappingGaps.map((gap) => (
                  <div key={`${gap.mappingType}-${gap.sourceKey}`}>
                    <Badge tone="watch">{gap.mappingType}</Badge>
                    <strong>{gap.sourceKey}</strong>
                    <span>{gap.count}건 · {won(gap.amountTotal)} · {gap.entryTypes.join(", ")}</span>
                    <div className="import-mapping-actions">
                      {gap.suggestions.length > 0 ? gap.suggestions.map((suggestion) => (
                        <Button
                          key={`${suggestion.accountType}:${suggestion.accountId}`}
                          size="sm"
                          variant="secondary"
                          disabled={busyMappingKey === `${gap.mappingType}:${gap.sourceKey}` || !actionExecutionSupported}
                          onClick={() => saveMapping(gap, suggestion)}
                        >
                          {suggestion.sourceKey}에 매핑
                        </Button>
                      )) : <span>계정 생성 필요 또는 수동 매핑 필요</span>}
                    </div>
                  </div>
                ))}
              </div></CardContent>
            </Card>
          ) : null}

          <Card className="transaction-panel">
            <CardHeader>
              <CardDescription>{result.startDate}~{result.endDate}</CardDescription>
              <div className="metric-card-top">
                <CardTitle>거래 비교 결과</CardTitle>
                <div className="import-actions">
                  <label><span className="sr-only">검토 필터</span><select value={viewFilter} onChange={(event) => setViewFilter(event.target.value as ImportViewFilter)}>
                    <option value="all">전체</option>
                    <option value="new">신규</option>
                    <option value="update">수정 후보</option>
                    <option value="transfer">이체</option>
                    <option value="mapping">매핑 필요</option>
                    <option value="benefit">카드혜택</option>
                    <option value="review">검토 필요</option>
                    <option value="duplicate">중복</option>
                  </select></label>
                  <Button size="sm" disabled={busy || !actionExecutionSupported || selectedRowIds.length === 0 || dryRunOnly} onClick={apply}>
                    선택 거래 등록
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="metric-detail">신규 확정 거래 자동 등록은 선택한 저장 row만 수행합니다. 수정은 단건 승인하며 삭제 후보는 표시만 합니다. dry-run-only에서는 원장 등록이 비활성화됩니다.</p>
              <div className="table-scroll"><table className="data-table import-table">
                <thead><tr>
                  <th>선택</th><th>원본 행</th><th>날짜</th><th>유형</th><th>자산</th><th>내용</th>
                  <th className="amount">승인금액</th><th className="amount">매입금액</th>
                  <th className="amount">할인액</th><th>카드혜택 후보</th><th>상태</th><th>비교 근거</th><th>액션</th>
                </tr></thead>
                <tbody>{filteredRows.map((row, index) => {
                  const status = labels[row.status];
                  return <tr key={`${row.transaction.sourceRowIndexes.join("-")}-${row.status}-${index}`}>
                    <td>{row.status === "auto_creatable" && row.importRowId ? <input
                      type="checkbox"
                      aria-label={`${row.transaction.item} 신규 등록 선택`}
                      checked={selectedRowIds.includes(row.importRowId)}
                      onChange={(event) => setSelectedRowIds((current) => event.target.checked
                        ? [...new Set([...current, row.importRowId as number])]
                        : current.filter((id) => id !== row.importRowId))}
                    /> : "-"}</td>
                    <td>{row.transaction.sourceRowIndexes.join(", ") || "이전 snapshot"}</td>
                    <td>{row.transaction.occurredDate || "-"}</td><td>{row.transaction.entryType === "transfer" ? "이체" : row.transaction.entryType}</td><td>{row.transaction.sourceAssetName || "-"}</td>
                    <td><strong>{row.transaction.item || "-"}</strong><small>{row.transaction.memo}</small></td>
                    <td className="amount">{won(row.transaction.approvalAmount)}</td><td className="amount">{won(row.transaction.postingAmount)}</td>
                    <td className="amount">{won(row.transaction.discountAmount)}</td><td>
                      <span>{row.cardBenefitCandidate?.label ?? "-"}</span>
                      {row.benefitEventIntegrity !== "not_applicable" ? <small>{row.benefitEventIntegrity === "matched"
                        ? "event 일치"
                        : row.benefitEventIntegrity === "missing"
                          ? "event 누락"
                          : "금액 불일치"}</small> : null}
                    </td>
                    <td><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td>
                      <span>{row.reason}{row.matchedWhooingEntryId ? ` · mirror #${row.matchedWhooingEntryId}` : ""}</span>
                      {row.transaction.entryType === "transfer" && row.transaction.sourceRowIndexes.length === 2
                        ? <small>2개 편한가계부 row → 1개 Whooing transfer</small> : null}
                      {row.changes?.length > 0 ? <small>수정 전 → 현재: {row.changes.map((change) => (
                        `${change.label} ${changeValue(change.before)} → ${changeValue(change.after)}`
                      )).join(" · ")}</small> : null}
                      {row.mirrorChanges?.length > 0 ? <small>mirror → import: {row.mirrorChanges.map((change) => (
                        `${change.label} ${changeValue(change.before)} → ${changeValue(change.after)}`
                      )).join(" · ")}</small> : null}
                    </td>
                    <td>
                      {row.status === "possible_update"
                        ? <div className="import-actions">
                          <Button size="sm" disabled={!row.importRowId || busyActionRowId === row.importRowId || dryRunOnly || !actionExecutionSupported} onClick={() => approveUpdate(row)}>수정 승인</Button>
                          <Button size="sm" variant="secondary" disabled={!row.importRowId || busyActionRowId === row.importRowId || !actionExecutionSupported} onClick={() => markReviewed(row, "review")}>검토 완료</Button>
                        </div>
                        : row.status === "auto_creatable"
                          ? <span className="metric-detail">{row.importRowId ? "선택 후 등록" : "검토 batch 저장 필요"}</span>
                          : ["possible_delete", "conflict", "review_required", "mapping_required"].includes(row.status)
                            ? <div className="import-actions">
                              <Button size="sm" variant="secondary" disabled={!row.importRowId || busyActionRowId === row.importRowId || !actionExecutionSupported} onClick={() => markReviewed(row, "review")}>검토 완료</Button>
                              <Button size="sm" variant="secondary" disabled={!row.importRowId || busyActionRowId === row.importRowId || !actionExecutionSupported} onClick={() => markReviewed(row, "skip")}>건너뜀</Button>
                            </div>
                            : <span className="metric-detail">{row.status === "duplicate" ? "처리 없음" : labels[row.status].label}</span>}
                    </td>
                  </tr>;
                })}</tbody>
              </table></div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardDescription>최근 승인·검토 결과</CardDescription>
          <CardTitle>작업 이력</CardTitle>
        </CardHeader>
        <CardContent>
          {actionHistory.length > 0 ? <div className="table-scroll"><table className="data-table">
            <thead><tr><th>시각</th><th>작업</th><th>import row</th><th>Whooing entry</th><th>상태</th><th>메시지</th></tr></thead>
            <tbody>{actionHistory.map((operation) => <tr key={operation.id}>
              <td>{new Date(operation.updatedAt).toLocaleString("ko-KR")}</td>
              <td>{operation.operationType}</td>
              <td>{operation.rowId ?? "mapping"}</td>
              <td>{operation.whooingEntryId ?? "-"}</td>
              <td><Badge tone={operation.status === "created" ? "stable" : operation.status === "failed" ? "over" : "watch"}>{operation.status}</Badge></td>
              <td>{operation.errorMessage ?? "-"}</td>
            </tr>)}</tbody>
          </table></div> : <p className="metric-detail">아직 기록된 승인 작업이 없습니다.</p>}
        </CardContent>
      </Card>
    </>
  );
}
