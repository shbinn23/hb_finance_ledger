"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileSpreadsheet, MailSearch, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ImportStatus = "auto_creatable" | "duplicate" | "mapping_required" | "possible_update"
  | "possible_delete" | "conflict" | "review_required";
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
  };
  rows: DryRunRow[];
  possibleDeletes: DryRunRow[];
  mappingGaps: Array<{
    mappingType: "asset" | "expense_category" | "income_category";
    sourceKey: string;
    count: number;
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

const labels: Record<ImportStatus, { label: string; tone: "stable" | "watch" | "over" | "neutral" }> = {
  auto_creatable: { label: "자동등록 가능", tone: "stable" },
  duplicate: { label: "중복", tone: "neutral" },
  mapping_required: { label: "매핑 필요", tone: "watch" },
  possible_update: { label: "수정 후보", tone: "watch" },
  possible_delete: { label: "삭제 후보", tone: "watch" },
  conflict: { label: "충돌", tone: "over" },
  review_required: { label: "검토 필요", tone: "watch" },
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

export function ImportsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyBenefitRowId, setBusyBenefitRowId] = useState<number | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<ImportStatus | "all">("all");
  const [runtimeStatus, setRuntimeStatus] = useState<ImportRuntimeStatus | null>(null);

  function refreshRuntimeStatus() {
    return fetch("/api/system/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: ImportRuntimeStatus) => setRuntimeStatus(payload))
      .catch(() => setRuntimeStatus(null));
  }

  useEffect(() => {
    void refreshRuntimeStatus();
  }, []);

  async function pollGmail() {
    setGmailBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/gmail/poll", { method: "POST" });
      const payload = await response.json() as { message?: string };
      setMessage(payload.message ?? "Gmail dry-run 확인을 마쳤습니다.");
      if (response.ok) await refreshRuntimeStatus();
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
      if (mode !== "apply") setResult(payload as DryRunResult);
      setMessage(payload.message ?? (mode === "dry-run" ? "dry-run 비교를 완료했습니다." : "요청을 완료했습니다."));
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
    await fileRequest("/api/imports/pyeonhan/apply", "apply");
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
        body: JSON.stringify({ importRowId: row.importRowId, ruleId: row.cardBenefitCandidate.ruleId }),
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
    } catch {
      setMessage("카드혜택 승인 요청 중 오류가 발생했습니다.");
    } finally {
      setBusyBenefitRowId(null);
    }
  }

  const rows = result ? [...result.rows, ...result.possibleDeletes] : [];
  const filteredRows = statusFilter === "all" ? rows : rows.filter((row) => row.status === statusFilter);
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
              disabled={gmailBusy || gmailState !== "ready" || runtimeStatus?.gmailImport.dryRunOnly === false}
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
              ["정규화 거래", result.summary.total],
              ["자동등록 가능", result.summary.autoCreatable],
              ["중복", result.summary.duplicates],
              ["검토·매핑", result.summary.reviewRequired + result.summary.mappingRequired],
              ["수정·삭제·충돌", result.summary.possibleUpdates + result.summary.possibleDeletes + result.summary.conflicts],
              ["혜택 승인 후보", result.summary.benefitCandidates],
              ["기존 event", result.summary.benefitExisting],
              ["event 누락", result.summary.benefitEventMissing],
              ["금액 불일치", result.summary.benefitAmountMismatches],
            ].map(([label, value]) => (
              <Card key={String(label)} className="import-summary-card">
                <CardDescription>{label}</CardDescription><strong>{value}</strong>
              </Card>
            ))}
          </div>

          {!result.schema.autoApplySupported || !result.schema.benefitReviewSupported ? (
            <div className="import-warning"><AlertTriangle size={17} /><p>import/ledger operation 또는 benefit review migration 미적용 상태입니다. 지원되지 않는 write 작업은 비활성화됩니다.</p></div>
          ) : null}
          <div className="import-warning import-policy-note">
            <AlertTriangle size={17} />
            <p>자동 삭제는 수행하지 않음. 수정·삭제는 review 후 반영합니다. 환급/캐시백은 수입, 지출 환급, 카드 할인 중 의미가 섞일 수 있어 자동 처리하지 않습니다. 수입 의미가 섞여 있어 수동 정책 필요 상태입니다. 민생지원쿠폰 차액조정은 balance adjustment 또는 별도 지원금 처리 정책 확정 전까지 review-only입니다.</p>
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
                            <td><Button size="sm" disabled={!canApprove || busyBenefitRowId === row.importRowId} onClick={() => approveBenefit(row)}>
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
              <CardHeader><CardDescription>매핑 상태</CardDescription><CardTitle>확인이 필요한 원본 값</CardTitle></CardHeader>
              <CardContent><div className="import-mapping-list">
                {result.mappingGaps.map((gap) => (
                  <div key={`${gap.mappingType}-${gap.sourceKey}`}>
                    <Badge tone="watch">{gap.mappingType}</Badge><strong>{gap.sourceKey}</strong><span>{gap.count}건</span>
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
                  <label><span className="sr-only">상태 필터</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ImportStatus | "all")}>
                    <option value="all">전체 상태</option>
                    {Object.entries(labels).map(([value, status]) => <option key={value} value={value}>{status.label}</option>)}
                  </select></label>
                  <Button size="sm" disabled={busy || !result.schema.autoApplySupported || result.summary.autoCreatable === 0} onClick={apply}>
                    신규 확정 거래 자동 등록
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="metric-detail">수정·삭제 후보는 표시만 하며 자동 반영하지 않습니다. auto_creatable만 등록합니다.</p>
              <div className="table-scroll"><table className="data-table import-table">
                <thead><tr>
                  <th>원본 행</th><th>날짜</th><th>유형</th><th>자산</th><th>내용</th>
                  <th className="amount">승인금액</th><th className="amount">매입금액</th>
                  <th className="amount">할인액</th><th>카드혜택 후보</th><th>상태</th><th>비교 근거</th>
                </tr></thead>
                <tbody>{filteredRows.map((row, index) => {
                  const status = labels[row.status];
                  return <tr key={`${row.transaction.sourceRowIndexes.join("-")}-${row.status}-${index}`}>
                    <td>{row.transaction.sourceRowIndexes.join(", ") || "이전 snapshot"}</td>
                    <td>{row.transaction.occurredDate || "-"}</td><td>{row.transaction.entryType}</td><td>{row.transaction.sourceAssetName || "-"}</td>
                    <td><strong>{row.transaction.item || "-"}</strong><small>{row.transaction.memo}</small></td>
                    <td className="amount">{won(row.transaction.approvalAmount)}</td><td className="amount">{won(row.transaction.postingAmount)}</td>
                    <td className="amount">{won(row.transaction.discountAmount)}</td><td>{row.cardBenefitCandidate?.label ?? "-"}</td>
                    <td><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td>{row.reason}{row.matchedWhooingEntryId ? ` · #${row.matchedWhooingEntryId}` : ""}</td>
                  </tr>;
                })}</tbody>
              </table></div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
