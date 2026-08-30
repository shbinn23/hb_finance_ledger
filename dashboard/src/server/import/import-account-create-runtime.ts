import { createApprovedImportAccount } from "./import-account-create-service";
import {
  findExactWhooingAccount,
  finishImportAccountCreateOperation,
  getImportActionOperation,
  getLatestImportAccountCandidate,
  reserveImportAccountCreateOperation,
  saveImportMapping,
} from "./import-repository";
import { createWhooingAccount, extractWhooingAccountId } from "../whooing/write-client";
import { syncWhooingAccounts } from "../whooing/sync-client";

export function createRuntimeApprovedImportAccount(input: Parameters<typeof createApprovedImportAccount>[0]) {
  return createApprovedImportAccount(input, {
    getCandidate: getLatestImportAccountCandidate,
    findExactAccount: findExactWhooingAccount,
    getOperation: getImportActionOperation,
    reserveOperation: reserveImportAccountCreateOperation,
    createAccount: async (candidate) => extractWhooingAccountId(await createWhooingAccount(candidate.accountType, {
      section_id: candidate.recommendedSectionId,
      title: candidate.title,
      type: "account",
      open_date: candidate.openDate,
      close_date: "29991231",
      memo: "편한가계부 import 승인 생성",
      category: "normal",
    })),
    syncAccounts: syncWhooingAccounts,
    saveMapping: saveImportMapping,
    finishOperation: finishImportAccountCreateOperation,
  });
}
