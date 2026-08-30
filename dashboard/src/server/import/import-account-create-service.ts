import { createHash } from "node:crypto";
import type { ImportMappingType } from "./import-automation-policy.ts";

export interface ApprovedImportAccountRequest {
  mappingType: ImportMappingType;
  sourceKey: string;
  accountType: "assets" | "liabilities" | "expenses" | "income";
  title: string;
  confirmed: boolean;
}

interface Candidate {
  mappingType: ImportMappingType;
  sourceKey: string;
  recommendedAccountType: string;
  recommendedSectionId: string;
  recommendedTitle: string;
  canCreate: boolean;
  blockedReason: string | null;
  openDate: string;
}

interface Dependencies {
  getCandidate: (mappingType: ImportMappingType, sourceKey: string) => Promise<Candidate | null>;
  findExactAccount: (accountType: string, title: string) => Promise<{ accountId: string; accountType: string } | null>;
  getOperation: (operationKey: string) => Promise<{ status: string; whooingAccountId?: string | null } | null>;
  reserveOperation: (input: { mappingType: ImportMappingType; sourceKey: string; operationKey: string }) => Promise<boolean>;
  createAccount: (input: Candidate & { accountType: ApprovedImportAccountRequest["accountType"]; title: string }) => Promise<string>;
  syncAccounts: () => Promise<unknown>;
  saveMapping: (input: { mappingType: ImportMappingType; sourceKey: string; accountType: string; accountId: string }) => Promise<unknown>;
  finishOperation: (input: {
    operationKey: string;
    status: "created" | "failed";
    whooingAccountId: string | null;
    errorMessage: string | null;
  }) => Promise<void>;
}

function operationKeyFor(input: ApprovedImportAccountRequest) {
  return `pyeonhan-account:${createHash("sha256").update(JSON.stringify({
    mappingType: input.mappingType,
    sourceKey: input.sourceKey.trim(),
    accountType: input.accountType,
    title: input.title.trim(),
  })).digest("hex")}`;
}

export async function createApprovedImportAccount(
  request: ApprovedImportAccountRequest,
  dependencies: Dependencies,
) {
  const operationKey = operationKeyFor(request);
  if (!request.confirmed) {
    return { ok: false as const, status: "rejected" as const, operationKey, accountId: null, message: "계정 생성 확인이 필요합니다." };
  }
  const candidate = await dependencies.getCandidate(request.mappingType, request.sourceKey.trim());
  if (!candidate?.canCreate || candidate.recommendedAccountType !== request.accountType) {
    return { ok: false as const, status: "rejected" as const, operationKey, accountId: null, message: candidate?.blockedReason ?? "현재 batch의 명확한 계정 후보가 아닙니다." };
  }
  const title = request.title.trim();
  if (!title || title.length > 30 || title !== candidate.recommendedTitle) {
    return { ok: false as const, status: "rejected" as const, operationKey, accountId: null, message: "검증된 추천 이름과 일치하지 않습니다." };
  }

  const exact = await dependencies.findExactAccount(request.accountType, title);
  if (exact) {
    await dependencies.saveMapping({
      mappingType: request.mappingType, sourceKey: request.sourceKey.trim(),
      accountType: exact.accountType, accountId: exact.accountId,
    });
    return { ok: true as const, status: "mapped_existing" as const, operationKey, accountId: exact.accountId, message: "기존 Whooing 계정을 매핑했습니다." };
  }

  const existing = await dependencies.getOperation(operationKey);
  let accountId = existing?.whooingAccountId ?? null;
  if (existing?.status === "created" && accountId) {
    await dependencies.syncAccounts();
    await dependencies.saveMapping({
      mappingType: request.mappingType, sourceKey: request.sourceKey.trim(),
      accountType: request.accountType, accountId,
    });
    return { ok: true as const, status: "reused" as const, operationKey, accountId, message: "이미 생성된 Whooing 계정을 매핑했습니다." };
  }

  const reserved = await dependencies.reserveOperation({
    mappingType: request.mappingType, sourceKey: request.sourceKey.trim(), operationKey,
  });
  if (!reserved) {
    return { ok: false as const, status: "pending" as const, operationKey, accountId: null, message: "동일 계정 생성이 처리 중입니다." };
  }

  try {
    if (!accountId) {
      accountId = await dependencies.createAccount({ ...candidate, accountType: request.accountType, title });
      await dependencies.finishOperation({ operationKey, status: "failed", whooingAccountId: accountId, errorMessage: "account_created_mapping_pending" });
    }
    await dependencies.syncAccounts();
    await dependencies.saveMapping({
      mappingType: request.mappingType, sourceKey: request.sourceKey.trim(),
      accountType: request.accountType, accountId,
    });
    await dependencies.finishOperation({ operationKey, status: "created", whooingAccountId: accountId, errorMessage: null });
    return { ok: true as const, status: "created" as const, operationKey, accountId, message: "Whooing 계정을 생성하고 import 매핑을 저장했습니다." };
  } catch {
    await dependencies.finishOperation({ operationKey, status: "failed", whooingAccountId: accountId, errorMessage: accountId ? "account_created_mapping_pending" : "account_create_failed" });
    return { ok: false as const, status: "failed" as const, operationKey, accountId, message: accountId ? "계정은 생성됐지만 미러 갱신 또는 매핑이 지연됐습니다. 재시도하면 중복 생성 없이 이어집니다." : "Whooing 계정 생성에 실패했습니다." };
  }
}
