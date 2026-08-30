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
  incomeCategories: AccountOption[];
  assetAccounts: AccountOption[];
  liabilityAccounts: AccountOption[];
  paymentAccounts: AccountOption[];
  depositAccounts: AccountOption[];
  transferAccounts: AccountOption[];
  creditCardAccounts: AccountOption[];
  balanceAdjustmentAccounts: AccountOption[];
  capitalAccounts: AccountOption[];
};

type FieldErrors = Record<string, string>;
type DashboardEntryType = "expense" | "income" | "transfer" | "card_payment" | "balance_adjustment";

const entryTypes: { value: DashboardEntryType; label: string }[] = [
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
  { value: "transfer", label: "이체" },
  { value: "card_payment", label: "카드상환" },
  { value: "balance_adjustment", label: "잔고조정" },
];

const entrySubmitLabels: Record<DashboardEntryType, string> = {
  expense: "지출 등록",
  income: "수입 등록",
  transfer: "이체 등록",
  card_payment: "카드상환 등록",
  balance_adjustment: "잔고조정 등록",
};

const entryConfirmLabels: Record<DashboardEntryType, string> = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
  card_payment: "카드상환",
  balance_adjustment: "잔고조정",
};

const cardBenefitOptions = [
  { value: "none", label: "혜택 없음" },
  { value: "hana_mgs_simple_pay_10p", label: "하나 MG+S · 간편결제 10%" },
  { value: "hana_mgs_subscription_50p", label: "하나 MG+S · 구독 50%" },
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
  const [entryCreated, setEntryCreated] = useState(false);
  const [options, setOptions] = useState<EntryOptions | null>(null);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [entryType, setEntryType] = useState<DashboardEntryType>("expense");
  const [occurredDate, setOccurredDate] = useState(todayInputValue);
  const [categoryAccountId, setCategoryAccountId] = useState("");
  const [paymentAccountValue, setPaymentAccountValue] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [cardAccountId, setCardAccountId] = useState("");
  const [assetAccountId, setAssetAccountId] = useState("");
  const [targetAccountType, setTargetAccountType] = useState<"assets" | "liabilities">("assets");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"increase" | "decrease">("increase");
  const [capitalAccountId, setCapitalAccountId] = useState("");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [discountRuleId, setDiscountRuleId] = useState("none");
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());

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
      setIncomeAccountId((current) => current || data.incomeCategories[0]?.accountId || "");
      setDepositAccountId((current) => current || data.depositAccounts[0]?.accountId || "");
      setFromAccountId((current) => current || data.transferAccounts[0]?.accountId || "");
      setToAccountId((current) => current || data.transferAccounts[1]?.accountId || data.transferAccounts[0]?.accountId || "");
      setCardAccountId((current) => current || data.creditCardAccounts[0]?.accountId || "");
      setAssetAccountId((current) => current || data.assetAccounts[0]?.accountId || "");
      setTargetAccountId((current) => current || data.balanceAdjustmentAccounts.find((account) => account.accountType === targetAccountType)?.accountId || data.balanceAdjustmentAccounts[0]?.accountId || "");
      setCapitalAccountId((current) => current || data.capitalAccounts[0]?.accountId || "");
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

  function resetEntryFormForNextEntry() {
    setEntryCreated(false);
    setMessage("");
    setFieldErrors({});
    setItem("");
    setAmount("");
    setMemo("");
    setDiscountRuleId("none");
    setOperationKey(crypto.randomUUID());
  }

  const previewAmount = useMemo(() => {
    const value = Number(amount);
    return Number.isFinite(value) && value > 0 ? value.toLocaleString("ko-KR") : "0";
  }, [amount]);
  const hasExpenseCategories = Boolean(options?.expenseCategories.length);
  const hasPaymentAccounts = Boolean(options?.paymentAccounts.length);
  const hasIncomeCategories = Boolean(options?.incomeCategories.length);
  const hasDepositAccounts = Boolean(options?.depositAccounts.length);
  const hasTransferAccounts = Boolean(options && options.transferAccounts.length >= 2);
  const hasCreditCardAccounts = Boolean(options?.creditCardAccounts.length);
  const hasAssetAccounts = Boolean(options?.assetAccounts.length);
  const hasBalanceAdjustmentAccounts = Boolean(options?.balanceAdjustmentAccounts.length);
  const hasCapitalAccounts = Boolean(options?.capitalAccounts.length);
  const canSubmitByType = {
    expense: hasExpenseCategories && hasPaymentAccounts,
    income: hasIncomeCategories && hasDepositAccounts,
    transfer: hasTransferAccounts,
    card_payment: hasCreditCardAccounts && hasAssetAccounts,
    balance_adjustment: hasBalanceAdjustmentAccounts && hasCapitalAccounts,
  };
  const canSubmit = !entryCreated && !submitting && !loadingOptions && canSubmitByType[entryType];
  const balanceTargetOptions = options?.balanceAdjustmentAccounts.filter((account) => account.accountType === targetAccountType) ?? [];
  const itemLabel = entryType === "income"
    ? "내용/출처"
    : entryType === "transfer"
      ? "내용"
      : entryType === "card_payment"
        ? "내용"
        : entryType === "balance_adjustment"
          ? "조정 사유"
          : "항목명";

  function buildRequestBody() {
    const payment = parsePaymentValue(paymentAccountValue);
    const base = {
      type: entryType,
      occurredDate,
      item,
      amount: Number(amount),
      memo,
      operationKey,
      source: "dashboard",
    };

    if (entryType === "expense") {
      return {
        ...base,
        categoryAccountId,
        paymentAccountType: payment.accountType,
        paymentAccountId: payment.accountId,
        discountRuleId,
      };
    }
    if (entryType === "income") {
      return {
        ...base,
        incomeAccountId,
        depositAccountId,
      };
    }
    if (entryType === "transfer") {
      return {
        ...base,
        fromAccountId,
        toAccountId,
      };
    }
    if (entryType === "card_payment") {
      return {
        ...base,
        cardAccountId,
        assetAccountId,
      };
    }

    return {
      ...base,
      targetAccountType,
      targetAccountId,
      adjustmentDirection,
      capitalAccountId,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // After a Whooing entry is created, the same transaction cannot be submitted twice from this form.
    if (entryCreated) {
      return;
    }

    setMessage("");
    setFieldErrors({});

    const entryLabel = entryConfirmLabels[entryType];
    if (!window.confirm(`후잉 원장에 ${entryLabel} ${previewAmount}원을 등록합니다. 등록 후 해당 날짜 local DB 동기화를 best-effort로 요청합니다. 진행할까요?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/ledger/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody()),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.message ?? "후잉 지출 등록에 실패했습니다.");
        return;
      }

      setEntryCreated(true);
      setMessage(result.message ?? (
        result.syncStatus === "pending"
          ? "후잉 원장 등록은 완료됐습니다. 다만 대시보드 반영은 지연될 수 있습니다. 같은 거래를 다시 등록하지 말고 화면 갱신 또는 동기화 요청 후 확인해 주세요."
          : "후잉 원장에 등록했고 대시보드 동기화도 완료했습니다."
      ));
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
              {entryTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  className={`ledger-entry-tab${entryType === type.value ? " active" : ""}`}
                  onClick={() => {
                    setEntryType(type.value);
                    setFieldErrors({});
                    setMessage("");
                    setEntryCreated(false);
                  }}
                >
                  {type.label}
                </button>
              ))}
            </div>
            <p className="ledger-entry-helper">선택한 유형은 실제 Whooing 원장에 등록됩니다. 등록 전 확인창이 표시됩니다.</p>
            {loadingOptions ? <p className="ledger-entry-helper">거래 입력 옵션을 불러오는 중입니다.</p> : null}

            {message ? <p className="ledger-entry-alert">{message}</p> : null}
            {options && !hasExpenseCategories ? <p className="ledger-entry-alert">지출 카테고리가 없습니다. 후잉 계정 동기화 상태를 확인해 주세요.</p> : null}
            {options && !hasPaymentAccounts ? <p className="ledger-entry-alert">결제수단이 없습니다. 자산 또는 부채 계정 동기화 상태를 확인해 주세요.</p> : null}
            {options && entryType === "income" && (!hasIncomeCategories || !hasDepositAccounts) ? <p className="ledger-entry-alert">수입 카테고리 또는 입금계좌가 없습니다.</p> : null}
            {options && entryType === "transfer" && !hasTransferAccounts ? <p className="ledger-entry-alert">이체에는 서로 다른 자산 계정 2개 이상이 필요합니다.</p> : null}
            {options && entryType === "card_payment" && (!hasCreditCardAccounts || !hasAssetAccounts) ? <p className="ledger-entry-alert">카드상환에는 신용카드와 출금 자산 계정이 필요합니다.</p> : null}
            {options && entryType === "balance_adjustment" && (!hasBalanceAdjustmentAccounts || !hasCapitalAccounts) ? <p className="ledger-entry-alert">잔고조정에는 조정계좌와 capital 계정이 필요합니다.</p> : null}

            <form className="ledger-entry-form" onSubmit={handleSubmit}>
              <label className="ledger-entry-field">
                <span>날짜</span>
                <input type="date" value={occurredDate} onChange={(event) => setOccurredDate(event.target.value)} required />
                {fieldErrors.occurredDate ? <em>{fieldErrors.occurredDate}</em> : null}
              </label>

              {entryType === "expense" ? (
                <>
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
                </>
              ) : null}

              {entryType === "income" ? (
                <>
                  <label className="ledger-entry-field">
                    <span>수입 카테고리</span>
                    <select value={incomeAccountId} onChange={(event) => setIncomeAccountId(event.target.value)} disabled={loadingOptions || !hasIncomeCategories} required>
                      {options?.incomeCategories.map((option) => (
                        <option key={option.accountId} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.incomeAccountId ? <em>{fieldErrors.incomeAccountId}</em> : null}
                  </label>

                  <label className="ledger-entry-field">
                    <span>입금계좌</span>
                    <select value={depositAccountId} onChange={(event) => setDepositAccountId(event.target.value)} disabled={loadingOptions || !hasDepositAccounts} required>
                      {options?.depositAccounts.map((option) => (
                        <option key={option.accountId} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.depositAccountId ? <em>{fieldErrors.depositAccountId}</em> : null}
                  </label>
                </>
              ) : null}

              {entryType === "transfer" ? (
                <>
                  <label className="ledger-entry-field">
                    <span>출금계좌</span>
                    <select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} disabled={loadingOptions || !hasTransferAccounts} required>
                      {options?.transferAccounts.map((option) => (
                        <option key={option.accountId} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.fromAccountId ? <em>{fieldErrors.fromAccountId}</em> : null}
                  </label>

                  <label className="ledger-entry-field">
                    <span>입금계좌</span>
                    <select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} disabled={loadingOptions || !hasTransferAccounts} required>
                      {options?.transferAccounts.map((option) => (
                        <option key={option.accountId} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.toAccountId ? <em>{fieldErrors.toAccountId}</em> : null}
                  </label>
                </>
              ) : null}

              {entryType === "card_payment" ? (
                <>
                  <label className="ledger-entry-field">
                    <span>카드</span>
                    <select value={cardAccountId} onChange={(event) => setCardAccountId(event.target.value)} disabled={loadingOptions || !hasCreditCardAccounts} required>
                      {options?.creditCardAccounts.map((option) => (
                        <option key={option.accountId} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.cardAccountId ? <em>{fieldErrors.cardAccountId}</em> : null}
                  </label>

                  <label className="ledger-entry-field">
                    <span>출금계좌</span>
                    <select value={assetAccountId} onChange={(event) => setAssetAccountId(event.target.value)} disabled={loadingOptions || !hasAssetAccounts} required>
                      {options?.assetAccounts.map((option) => (
                        <option key={option.accountId} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.assetAccountId ? <em>{fieldErrors.assetAccountId}</em> : null}
                  </label>
                </>
              ) : null}

              {entryType === "balance_adjustment" ? (
                <>
                  <label className="ledger-entry-field">
                    <span>조정 대상 타입</span>
                    <select
                      value={targetAccountType}
                      onChange={(event) => {
                        const nextType = event.target.value === "liabilities" ? "liabilities" : "assets";
                        setTargetAccountType(nextType);
                        setTargetAccountId(options?.balanceAdjustmentAccounts.find((account) => account.accountType === nextType)?.accountId ?? "");
                      }}
                      disabled={loadingOptions || !hasBalanceAdjustmentAccounts}
                      required
                    >
                      <option value="assets">자산</option>
                      <option value="liabilities">부채</option>
                    </select>
                    {fieldErrors.targetAccountType ? <em>{fieldErrors.targetAccountType}</em> : null}
                  </label>

                  <label className="ledger-entry-field">
                    <span>조정계좌</span>
                    <select value={targetAccountId} onChange={(event) => setTargetAccountId(event.target.value)} disabled={loadingOptions || balanceTargetOptions.length === 0} required>
                      {balanceTargetOptions.map((option) => (
                        <option key={`${option.accountType}:${option.accountId}`} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.targetAccountId ? <em>{fieldErrors.targetAccountId}</em> : null}
                  </label>

                  <label className="ledger-entry-field">
                    <span>조정 방향</span>
                    <select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value === "decrease" ? "decrease" : "increase")} required>
                      <option value="increase">증가</option>
                      <option value="decrease">감소</option>
                    </select>
                    {fieldErrors.adjustmentDirection ? <em>{fieldErrors.adjustmentDirection}</em> : null}
                  </label>

                  <label className="ledger-entry-field">
                    <span>조정 상대 capital</span>
                    <select value={capitalAccountId} onChange={(event) => setCapitalAccountId(event.target.value)} disabled={loadingOptions || !hasCapitalAccounts} required>
                      {options?.capitalAccounts.map((option) => (
                        <option key={option.accountId} value={option.accountId}>{option.title}</option>
                      ))}
                    </select>
                    {fieldErrors.capitalAccountId ? <em>{fieldErrors.capitalAccountId}</em> : null}
                  </label>
                </>
              ) : null}

              <label className="ledger-entry-field">
                <span>{itemLabel}</span>
                <input
                  value={item}
                  onChange={(event) => setItem(event.target.value)}
                  placeholder={entryType === "card_payment" ? "비우면 카드대금 상환" : "예: 점심"}
                  required={entryType !== "card_payment"}
                />
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

              {entryType === "expense" ? (
                <label className="ledger-entry-field">
                  <span>카드혜택</span>
                  <select value={discountRuleId} onChange={(event) => setDiscountRuleId(event.target.value)}>
                    {cardBenefitOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <small>선택한 rule만 평가합니다. 기본값은 혜택 없음입니다.</small>
                </label>
              ) : null}

              <label className="ledger-entry-field ledger-entry-field-wide">
                <span>메모</span>
                <textarea value={memo} onChange={(event) => setMemo(event.target.value)} rows={3} placeholder="선택 입력" />
              </label>

              <div className="ledger-entry-actions">
                <button type="button" className="ui-button ui-button-secondary ui-button-md" onClick={() => setOpen(false)}>
                  닫기
                </button>
                {entryCreated ? (
                  <button type="button" className="ui-button ui-button-secondary ui-button-md" onClick={resetEntryFormForNextEntry}>
                    새 거래 입력
                  </button>
                ) : null}
                <button type="submit" className="ui-button ui-button-primary ui-button-md" disabled={!canSubmit}>
                  {submitting ? "등록 중" : entrySubmitLabels[entryType]}
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
