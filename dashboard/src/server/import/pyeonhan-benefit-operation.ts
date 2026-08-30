export interface BenefitOperationResult {
  ok: boolean;
  status: string;
  message: string;
  operationKey?: string;
}

export interface BenefitOperationDependencies {
  getOperation: (operationKey: string) => Promise<{ status: string } | null>;
  reserveOperation: (input: {
    rowId: number;
    operationType: "benefit";
    operationKey: string;
  }) => Promise<boolean>;
  approve: (input: { importRowId: number; ruleId: string }) => Promise<BenefitOperationResult>;
  finishOperation: (input: {
    operationKey: string;
    status: "created" | "failed";
    errorMessage: string | null;
  }) => Promise<void>;
}

export async function executePyeonhanBenefitOperation(
  input: { importRowId: number; ruleId: string },
  dependencies: BenefitOperationDependencies,
) {
  const operationKey = `pyeonhan-benefit:${input.importRowId}:${input.ruleId}`;
  const existing = await dependencies.getOperation(operationKey);
  if (existing?.status === "created") {
    return { ok: true, status: "event_exists" as const, operationKey, message: "이미 처리된 카드혜택 승인입니다." };
  }
  const reserved = await dependencies.reserveOperation({
    rowId: input.importRowId,
    operationType: "benefit",
    operationKey,
  });
  if (!reserved) {
    return { ok: false, status: "failed" as const, operationKey, message: "동일 카드혜택 처리가 진행 중입니다." };
  }
  try {
    const result = await dependencies.approve(input);
    await dependencies.finishOperation({
      operationKey,
      status: result.ok ? "created" : "failed",
      errorMessage: result.ok ? null : result.message,
    });
    return { ...result, operationKey };
  } catch {
    try {
      await dependencies.finishOperation({
        operationKey,
        status: "failed",
        errorMessage: "카드혜택 승인 상태 기록 실패",
      });
    } catch {
      // The original error remains the actionable result; repository recovery is retry-safe.
    }
    return { ok: false, status: "failed" as const, operationKey, message: "카드혜택 승인 처리에 실패했습니다." };
  }
}
