import { NextRequest, NextResponse } from "next/server";
import { importActionOriginIsAllowed, importWritesAreDryRunOnly, parseImportAccountCreateRequest } from "@/server/import/import-actions";
import { getImportAutomationPolicy } from "@/server/import/import-automation-policy";
import { createRuntimeApprovedImportAccount } from "@/server/import/import-account-create-runtime";
import { runRuntimeGmailImportPoll } from "@/server/import/gmail-import-runtime-server";
import { importAccountCreateSchemaAvailable } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!importActionOriginIsAllowed({
    origin: request.headers.get("origin"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  })) return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  const parsed = parseImportAccountCreateRequest(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const policy = getImportAutomationPolicy();
  if (importWritesAreDryRunOnly() || !policy.accountCreateEnabled) {
    return NextResponse.json({ ok: false, error: "account_creation_disabled" }, { status: 409 });
  }
  if (!(await importAccountCreateSchemaAvailable())) {
    return NextResponse.json({ ok: false, error: "account_creation_schema_unavailable" }, { status: 409 });
  }
  const result = await createRuntimeApprovedImportAccount(parsed.value);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status === "pending" ? 409 : result.status === "rejected" ? 400 : 502 });
  }
  const poll = await runRuntimeGmailImportPoll().catch(() => null);
  return NextResponse.json({
    ...result,
    createdAccounts: result.status === "created" ? 1 : 0,
    savedMappings: 1,
    reevaluation: poll,
  });
}
