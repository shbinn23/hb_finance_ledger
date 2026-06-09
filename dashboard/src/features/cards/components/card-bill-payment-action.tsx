"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CardBillPaymentRow } from "@/lib/card-benefits/card-bill-payment";

interface CardBillPaymentActionProps {
  row: CardBillPaymentRow;
}

function actionLabel(status: string) {
  if (status === "registered") return "등록됨";
  if (status === "asset_required") return "계좌 선택 필요";
  if (status === "no_bill") return "청구 없음";
  if (status === "needs_review") return "확인 필요";
  return "상환 등록";
}

function paymentDate(row: CardBillPaymentRow) {
  if (!row.payDate) return "";
  return `${row.billMonth}-${String(row.payDate).padStart(2, "0")}`;
}

export function CardBillPaymentAction({ row }: CardBillPaymentActionProps) {
  const router = useRouter();
  const [isSubmitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const canRegister = row.repaymentStatus === "ready" && row.recommendedAssetAccountId && row.payDate;

  async function onRegister() {
    if (!canRegister) return;
    const confirmed = window.confirm(
      `${row.cardName} ${row.billMonth} 청구액 ${row.billAmount.toLocaleString("ko-KR")}원을 후잉 장부에 카드대금 상환으로 기록합니다.\n\n실제 은행 이체가 아니라 후잉 장부 기록입니다.`,
    );
    if (!confirmed) return;

    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/cards/bill-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billMonth: row.billMonth,
          cardAccountId: row.cardAccountId,
          assetAccountId: row.recommendedAssetAccountId,
          amount: row.billAmount,
          payDate: paymentDate(row),
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; syncStatus?: string };
      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "상환 등록에 실패했습니다.");
        return;
      }

      setMessage(payload.syncStatus === "pending" ? "등록 완료. 대시보드 반영은 잠시 후 확인하세요." : "등록 완료.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card-action-stack">
      <button
        type="button"
        className="ui-button ui-button-secondary ui-button-sm"
        disabled={!canRegister || isSubmitting}
        onClick={onRegister}
      >
        {isSubmitting ? "등록 중" : actionLabel(row.repaymentStatus)}
      </button>
      {message ? <div className="metric-detail">{message}</div> : null}
    </div>
  );
}
