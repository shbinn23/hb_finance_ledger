export type PyeonhanEntryType = "expense" | "income" | "transfer" | "difference_income";

export interface NormalizedPyeonhanTransaction {
  sourceRowIndexes: number[];
  occurredDate: string;
  entryType: PyeonhanEntryType;
  sourceAssetName: string;
  counterpartyAssetName: string | null;
  sourceCategoryName: string | null;
  sourceSubcategoryName: string | null;
  item: string;
  memo: string;
  postingAmount: number;
  approvalAmount: number;
  discountAmount: number;
  currency: string;
  occurrenceIndex: number;
  sourceIdentityKey: string;
  sourceContentHash: string;
  transferPairComplete: boolean;
}

export interface ParsedPyeonhanWorkbook {
  transactions: NormalizedPyeonhanTransaction[];
  sourceRowCount: number;
}
