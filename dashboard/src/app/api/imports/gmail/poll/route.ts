import { NextRequest, NextResponse } from "next/server";
import { runRuntimeGmailImportDryRunPoll } from "@/server/import/gmail-import-runtime-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let pollInProgress = false;

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!expectedHost) return false;
  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  if (pollInProgress) {
    return NextResponse.json({ ok: false, error: "gmail_poll_in_progress" }, { status: 409 });
  }
  pollInProgress = true;
  try {
    const result = await runRuntimeGmailImportDryRunPoll();
    if (result.status === "disabled") {
      return NextResponse.json({ ok: false, ...result, message: "Gmail import가 비활성화되어 있습니다." }, { status: 409 });
    }
    if (result.status === "needs_credentials") {
      return NextResponse.json({ ok: false, ...result, message: "개인 Gmail OAuth credential과 refresh token이 필요합니다." }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      ...result,
      message: `메일 ${result.checkedMessages}건에서 Excel ${result.foundAttachments}개를 확인했습니다. 신규 batch ${result.importedBatches}개, 재사용 ${result.reusedBatches}개, 무효 첨부 ${result.skippedInvalidAttachments}개입니다. 신규 row ${result.createdRows}건 중 수정 ${result.possibleUpdateCount}건, 매핑 ${result.mappingRequiredCount}건, 자동등록 후보 ${result.autoCreatableCount}건입니다.`,
    });
  } catch (error) {
    const knownErrors = new Set([
      "gmail_auth_failed",
      "gmail_search_failed",
      "gmail_message_failed",
      "gmail_attachment_failed",
      "invalid_gmail_attachment",
    ]);
    const code = error instanceof Error && knownErrors.has(error.message)
      ? error.message
      : "gmail_poll_failed";
    const safeMessage = code !== "gmail_poll_failed"
      ? "Gmail read-only 확인에 실패했습니다. OAuth 권한과 검색 조건을 확인해 주세요."
      : "Gmail 첨부 import dry-run 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: code, message: safeMessage }, { status: 502 });
  } finally {
    pollInProgress = false;
  }
}
