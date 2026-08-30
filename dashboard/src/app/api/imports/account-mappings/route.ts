import { NextRequest, NextResponse } from "next/server";
import {
  importActionOriginIsAllowed,
  parseImportMappingRequest,
} from "@/server/import/import-actions";
import { saveImportMapping } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!importActionOriginIsAllowed({
    origin: request.headers.get("origin"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  })) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const parsed = parseImportMappingRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  try {
    const mapping = await saveImportMapping(parsed.value);
    return NextResponse.json({
      ok: true,
      mapping,
      message: "매핑을 저장했습니다. 같은 Excel을 다시 dry-run해 결과를 확인해 주세요.",
    });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "invalid_mapping_target";
    return NextResponse.json({
      ok: false,
      error: invalid ? "invalid_mapping_target" : "mapping_save_failed",
    }, { status: invalid ? 400 : 500 });
  }
}
