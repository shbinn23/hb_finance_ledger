import { NextRequest, NextResponse } from "next/server";
import {
  buildPyeonhanDryRun,
  validatePyeonhanUpload,
} from "@/server/import/pyeonhan-dry-run";
import { PyeonhanExcelFormatError } from "@/server/import/pyeonhan-excel-parser";

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
    return NextResponse.json({ ok: true, ...(await buildPyeonhanDryRun(file)) });
  } catch (error) {
    const message = error instanceof PyeonhanExcelFormatError
      ? error.message
      : "Excel dry-run 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
