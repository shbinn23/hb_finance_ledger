"use client";

import { FormEvent, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PenLine, X } from "lucide-react";
import { todayKstDateParts } from "@/lib/kst-date";

type AccountOption = {
  accountType: string;
  accountId: string;
  title: string;
};

type EntryOptions = {
  expenseCategories: AccountOption[];
  paymentAccounts: AccountOption[];
};

type FieldErrors = Record<string, string>;

const cardBenefitOptions = [
  { value: "none", label: "혜택 없음" },
  { value: "hana_mgs_simple_pay_10p", label: "하나 MG+S · 간편결제 10%" },
  { value: "shinhan_lady_lunch_5p", label: "신한 레이디 · 점심 5%" },
  { value: "shinhan_lady_medical_5p", label: "신한 레이디 · 병원/약국 5%" },
  { value: "shinhan_lady_shopping_3p", label: "신한 레이디 · 쇼핑 3%" },
];

function todayInputValue() {
  const parts = todayKstDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parsePaymentValue(value: string) {
  const [accountType, accountId] = value.split(":");
  return { accountType, accountId };
}

export function DashboardLedgerEntryDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState<EntryOptions | null>(null);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [occurredDate, setOccurredDate] = useState(todayInputValue);
  const [categoryAccountId, setCategoryAccountId] = useState("");
  const [paymentAccountValue, setPaymentAccountValue] = useState("");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [discountRuleId, setDiscountRuleId] = useState("none");

  async function loadEntryOptions() {
    if (options || loadingOptions) return;
    setLoadingOptions(true);
    try {
      const response = await fetch("/api/ledger/entry-options");
      if (!response.ok) {
        throw new Error("entry options request failed");
      }
      const data = await response.json() as EntryOptions;
      setOptions(data);
      setCategoryAccountId((current) => current || data.expenseCategories[0]?.accountId || "");
      const firstPayment = data.paymentAccounts[0];
      setPaymentAccountValue((current) => current || (firstPayment ? `${firstPayment.accountType}:${firstPayment.accountId}` : ""));
    } catch {
      setMessage("거래 입력 옵션을 불러오지 못했습니다.");
    } finally {
      setLoadingOptions(false);
    }
  }

  function openDialog() {
    setOpen(true);
    void loadEntryOptions();
  }

  const previewAmount = useMemo(() => {
    const value = Number(amount);
    return Number.isFinite(value) && value > 0 ? value.toLocaleString("ko-KR") : "0";
  }, [amount]);
  const hasExpenseCategories = Boolean(options?.expenseCategories.length);
  const hasPaymentAccounts = Boolean(options?.paymentAccounts.length);
  const canSubmit = !submitting && !loadingOptions && hasExpenseCategories && hasPaymentAccounts;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});

    if (!window.confirm(`후잉 원장에 지출 ${previewAmount}원을 등록합니다. 등록 후 해당 날짜 local DB 동기화를 best-effort로 요청합니다. 진행할까요?`)) {
      return;
    }

    const payment = parsePaymentValue(paymentAccountValue);
    setSubmitting(true);
    try {
      const response = await fetch("/api/ledger/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          occurredDate,
          categoryAccountId,
          paymentAccountType: payment.accountType,
          paymentAccountId: payment.accountId,
          item,
          amount: Number(amount),
          memo,
          discountRuleId,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.message ?? "후잉 지출 등록에 실패했습니다.");
        return;
      }

      setMessage(result.message ?? "후잉 지출 등록이 완료되었습니다.");
      setItem("");
      setAmount("");
      setMemo("");
      setDiscountRuleId("none");
      router.refresh();
    } catch {
      setMessage("후잉 지출 등록 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="toolbar-button" onClick={openDialog}>
        <PenLine size={14} />
        거래 입력
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="ledger-entry-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="거래 입력"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div className="ledger-entry-modal">
            <div className="ledger-entry-header">
              <div>
                <p>Ledger Entry</p>
                <strong>거래 입력</strong>
                <span>지출은 실제 Whooing 원장에 등록됩니다.</span>
              </div>
              <button type="button" className="ledger-entry-close" onClick={() => setOpen(false)} aria-label="닫기">
                <X size={18} />
              </button>
            </div>

            <div className="ledger-entry-tabs" aria-label="거래 유형">
              <button type="button" className="ledger-entry-tab active">지출</button>
              <button type="button" className="ledger-entry-tab" disabled>수입</button>
              <button type="button" className="ledger-entry-tab" disabled>이체</button>
              <button type="button" className="ledger-entry-tab" disabled>카드상환</button>
              <button type="button" className="ledger-entry-tab" disabled>잔고조정</button>
            </div>
            <p className="ledger-entry-helper">수입, 이체, 카드상환, 잔고조정은 다음 단계에서 대시보드 입력을 지원합니다.</p>
            {loadingOptions ? <p className="ledger-entry-helper">거래 입력 옵션을 불러오는 중입니다.</p> : null}

            {message ? <p className="ledger-entry-alert">{message}</p> : null}
            {options && !hasExpenseCategories ? <p className="ledger-entry-alert">지출 카테고리가 없습니다. 후잉 계정 동기화 상태를 확인해 주세요.</p> : null}
            {options && !hasPaymentAccounts ? <p className="ledger-entry-alert">결제수단이 없습니다. 자산 또는 부채 계정 동기화 상태를 확인해 주세요.</p> : null}

            <form className="ledger-entry-form" onSubmit={handleSubmit}>
              <label className="ledger-entry-field">
                <span>날짜</span>
                <input type="date" value={occurredDate} onChange={(event) => setOccurredDate(event.target.value)} required />
                {fieldErrors.occurredDate ? <em>{fieldErrors.occurredDate}</em> : null}
              </label>

              <label className="ledger-entry-field">
                <span>지출 카테고리</span>
                <select
                  value={categoryAccountId}
                  onChange={(event) => setCategoryAccountId(event.target.value)}
                  disabled={loadingOptions || !hasExpenseCategories}
                  required
                >
                  {options?.expenseCategories.map((option) => (
                    <option key={option.accountId} value={option.accountId}>{option.title}</option>
                  ))}
                </select>
                {fieldErrors.categoryAccountId ? <em>{fieldErrors.categoryAccountId}</em> : null}
              </label>

              <label className="ledger-entry-field">
                <span>결제수단</span>
                <select
                  value={paymentAccountValue}
                  onChange={(event) => setPaymentAccountValue(event.target.value)}
                  disabled={loadingOptions || !hasPaymentAccounts}
                  required
                >
                  {options?.paymentAccounts.map((option) => (
                    <option
                      key={`${option.accountType}:${option.accountId}`}
                      value={`${option.accountType}:${option.accountId}`}
                    >
                      {option.title}
                    </option>
                  ))}
                </select>
                {fieldErrors.paymentAccountId ? <em>{fieldErrors.paymentAccountId}</em> : null}
              </label>

              <label className="ledger-entry-field">
                <span>항목명</span>
                <input value={item} onChange={(event) => setItem(event.target.value)} placeholder="예: 점심" required />
                {fieldErrors.item ? <em>{fieldErrors.item}</em> : null}
              </label>

              <label className="ledger-entry-field">
                <span>금액</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                  required
                />
                {fieldErrors.amount ? <em>{fieldErrors.amount}</em> : null}
              </label>

              <label className="ledger-entry-field">
                <span>카드혜택</span>
                <select value={discountRuleId} onChange={(event) => setDiscountRuleId(event.target.value)}>
                  {cardBenefitOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <small>선택한 rule만 평가합니다. 기본값은 혜택 없음입니다.</small>
              </label>

              <label className="ledger-entry-field ledger-entry-field-wide">
                <span>메모</span>
                <textarea value={memo} onChange={(event) => setMemo(event.target.value)} rows={3} placeholder="선택 입력" />
              </label>

              <div className="ledger-entry-actions">
                <button type="button" className="ui-button ui-button-secondary ui-button-md" onClick={() => setOpen(false)}>
                  닫기
                </button>
                <button type="submit" className="ui-button ui-button-primary ui-button-md" disabled={!canSubmit}>
                  {submitting ? "등록 중" : "지출 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
