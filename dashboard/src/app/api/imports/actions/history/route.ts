import { NextResponse } from "next/server";
import {
  getImportSchemaStatus,
  listImportActionHistory,
} from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function GET() {
  const schema = await getImportSchemaStatus();
  if (!schema.actionExecutionSupported) {
    return NextResponse.json({ ok: true, supported: false, operations: [] });
  }
  return NextResponse.json({
    ok: true,
    supported: true,
    operations: await listImportActionHistory(),
  });
}
