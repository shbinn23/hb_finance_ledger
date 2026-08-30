import { NextRequest, NextResponse } from "next/server";
import {
  createImportReviewBatch,
  getLatestReviewRowReferences,
  importRowReferenceKey,
} from "@/server/import/import-repository";
import {
  buildPyeonhanDryRun,
  validatePyeonhanUpload,
} from "@/server/import/pyeonhan-dry-run";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    const file = candidate instanceof File ? candidate : null;
    const validationError = validatePyeonhanUpload(file);
    if (validationError || !file) {
      return NextResponse.json({ ok: false, message: validationError }, { status: 400 });
    }
    const dryRun = await buildPyeonhanDryRun(file);
    if (!dryRun.schema.benefitReviewSupported) {
      return NextResponse.json({ ok: false, message: "import review migration 적용이 필요합니다." }, { status: 503 });
    }
    const existing = await getLatestReviewRowReferences(dryRun.sourceFileHash);
    const review = existing ?? await createImportReviewBatch({
      filename: file.name,
      sourceFileHash: dryRun.sourceFileHash,
      startDate: dryRun.startDate,
      endDate: dryRun.endDate,
      rows: dryRun.rows,
      possibleDeletes: dryRun.possibleDeletes,
    });
    return NextResponse.json({
      ok: true,
      ...dryRun,
      batchId: review.batchId,
      reused: Boolean(existing),
      rows: dryRun.rows.map((row) => ({
        ...row,
        importRowId: review.rowIds.get(importRowReferenceKey(
          row.transaction.sourceIdentityKey,
          row.transaction.occurrenceIndex,
        )) ?? null,
      })),
      message: existing
        ? `기존 검토 batch ${review.batchId}를 불러왔습니다.`
        : `검토 batch ${review.batchId}를 저장했습니다. 후잉 원장은 변경하지 않았습니다.`,
    });
  } catch {
    return NextResponse.json({ ok: false, message: "검토 batch 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
