export const FINANCIAL_PLAN = {
  monthlyIncome: 3_110_000,
  monthlySavingTarget: 1_000_000,
};

export interface SavingDefenseInput {
  monthlyIncome: number;
  monthlySavingTarget: number;
  projectedActualMonthTotal: number;
}

export interface SavingDefenseResult {
  savingDefenseBalance: number;
  isDeficit: boolean;
  deficitAmount: number;
  surplusAmount: number;
}

export interface AvailableResourceInput {
  monthlyIncome: number;
  monthlySavingTarget: number;
  currentFixedAmount: number;
  remainingFixedScheduledAmount: number;
  currentVariableSpend: number;
}

export interface AvailableResourceResult {
  reservedFixedTotal: number;
  variableSpendPool: number;
  currentVariableSpend: number;
  availableResource: number;
  isOverrun: boolean;
  overrunAmount: number;
  remainingAmount: number;
}

export function calculateSavingDefenseBalance(input: SavingDefenseInput): SavingDefenseResult {
  const savingDefenseBalance = input.monthlyIncome - input.monthlySavingTarget - input.projectedActualMonthTotal;

  return {
    savingDefenseBalance,
    isDeficit: savingDefenseBalance < 0,
    deficitAmount: Math.max(0, Math.abs(Math.min(0, savingDefenseBalance))),
    surplusAmount: Math.max(0, savingDefenseBalance),
  };
}

export function calculateAvailableResource(input: AvailableResourceInput): AvailableResourceResult {
  const reservedFixedTotal = input.currentFixedAmount + input.remainingFixedScheduledAmount;
  const variableSpendPool = input.monthlyIncome - input.monthlySavingTarget - reservedFixedTotal;
  const availableResource = variableSpendPool - input.currentVariableSpend;

  return {
    reservedFixedTotal,
    variableSpendPool,
    currentVariableSpend: input.currentVariableSpend,
    availableResource,
    isOverrun: availableResource < 0,
    overrunAmount: Math.max(0, Math.abs(Math.min(0, availableResource))),
    remainingAmount: Math.max(0, availableResource),
  };
}
