export type AccountingTransactionKind =
  | "card_expense"
  | "cash_expense"
  | "income_received"
  | "liability_payment"
  | "asset_transfer"
  | "capital_injection"
  | "capital_withdrawal"
  | "liability_income_adjustment"
  | "debt_financing"
  | "capital_liability_adjustment"
  | "unknown";

export type AccountingImpact =
  | "increase"
  | "decrease"
  | "expense_increase"
  | "income_increase"
  | "inflow"
  | "outflow"
  | "internal_transfer"
  | "capital_adjustment"
  | "none"
  | "unknown";

export interface AccountingTransactionKindInfo {
  kind: AccountingTransactionKind;
  label: string;
  description: string;
  cashFlowImpact: AccountingImpact;
  profitLossImpact: AccountingImpact;
  assetImpact: AccountingImpact;
  liabilityImpact: AccountingImpact;
}

const unknownKind: AccountingTransactionKindInfo = {
  kind: "unknown",
  label: "분류 필요",
  description: "아직 회계 해석 규칙이 없는 후잉 entry 조합입니다.",
  cashFlowImpact: "unknown",
  profitLossImpact: "unknown",
  assetImpact: "unknown",
  liabilityImpact: "unknown",
};

const kindByPair: Record<string, AccountingTransactionKindInfo> = {
  "expenses:liabilities": {
    kind: "card_expense",
    label: "카드 지출",
    description: "비용이 발생하고 카드/부채 계정이 증가합니다.",
    cashFlowImpact: "none",
    profitLossImpact: "expense_increase",
    assetImpact: "none",
    liabilityImpact: "increase",
  },
  "expenses:assets": {
    kind: "cash_expense",
    label: "현금 지출",
    description: "비용이 발생하고 자산 계정에서 현금이 유출됩니다.",
    cashFlowImpact: "outflow",
    profitLossImpact: "expense_increase",
    assetImpact: "decrease",
    liabilityImpact: "none",
  },
  "assets:income": {
    kind: "income_received",
    label: "수입 입금",
    description: "수익이 발생하고 자산 계정이 증가합니다.",
    cashFlowImpact: "inflow",
    profitLossImpact: "income_increase",
    assetImpact: "increase",
    liabilityImpact: "none",
  },
  "liabilities:assets": {
    kind: "liability_payment",
    label: "부채 상환",
    description: "카드대금 또는 부채를 자산 계정에서 상환합니다.",
    cashFlowImpact: "outflow",
    profitLossImpact: "none",
    assetImpact: "decrease",
    liabilityImpact: "decrease",
  },
  "assets:assets": {
    kind: "asset_transfer",
    label: "자산 이체",
    description: "자산 계정 사이의 내부 이동입니다.",
    cashFlowImpact: "internal_transfer",
    profitLossImpact: "none",
    assetImpact: "internal_transfer",
    liabilityImpact: "none",
  },
  "assets:capital": {
    kind: "capital_injection",
    label: "자본 투입",
    description: "기초잔액 또는 자본성 조정으로 자산이 증가합니다.",
    cashFlowImpact: "capital_adjustment",
    profitLossImpact: "none",
    assetImpact: "increase",
    liabilityImpact: "none",
  },
  "capital:assets": {
    kind: "capital_withdrawal",
    label: "자본 회수",
    description: "기초잔액 또는 자본성 조정으로 자산이 감소합니다.",
    cashFlowImpact: "capital_adjustment",
    profitLossImpact: "none",
    assetImpact: "decrease",
    liabilityImpact: "none",
  },
  "liabilities:income": {
    kind: "liability_income_adjustment",
    label: "부채 차감 수입",
    description: "카드할인 또는 캐시백처럼 부채를 줄이는 수입성 조정입니다.",
    cashFlowImpact: "none",
    profitLossImpact: "income_increase",
    assetImpact: "none",
    liabilityImpact: "decrease",
  },
  "assets:liabilities": {
    kind: "debt_financing",
    label: "부채 조달",
    description: "대출 또는 부채 발생으로 자산과 부채가 함께 증가합니다.",
    cashFlowImpact: "inflow",
    profitLossImpact: "none",
    assetImpact: "increase",
    liabilityImpact: "increase",
  },
  "capital:liabilities": {
    kind: "capital_liability_adjustment",
    label: "부채 자본 조정",
    description: "기초 부채 설정 또는 자본성 부채 조정입니다.",
    cashFlowImpact: "capital_adjustment",
    profitLossImpact: "none",
    assetImpact: "none",
    liabilityImpact: "increase",
  },
  "liabilities:capital": {
    kind: "capital_liability_adjustment",
    label: "부채 자본 조정",
    description: "부채를 자본 계정과 상계하는 조정입니다.",
    cashFlowImpact: "capital_adjustment",
    profitLossImpact: "none",
    assetImpact: "none",
    liabilityImpact: "decrease",
  },
};

export function classifyTransactionKind(lAccount: string, rAccount: string): AccountingTransactionKindInfo {
  return kindByPair[`${lAccount}:${rAccount}`] ?? unknownKind;
}
