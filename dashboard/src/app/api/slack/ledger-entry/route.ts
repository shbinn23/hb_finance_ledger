import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildExpenseRegistrationFailureView,
  buildExpenseRegistrationSuccessView,
  buildWhooingExpenseEntryPayload,
  buildExpenseLedgerModal,
  calculateExpensePosting,
  ExpensePostingValidationError,
  isExpenseLedgerSubmission,
  parseExpenseLedgerSubmission,
} from "@/features/slack/ledger-entry";
import { getSlackLedgerEntryAccounts } from "@/server/whooing/account-repository";
import { syncWhooingEntriesForDate, WhooingLocalSyncError } from "@/server/whooing/sync-client";
import { createWhooingEntry, WhooingWriteClientError } from "@/server/whooing/write-client";

export const runtime = "nodejs";

const SLACK_SIGNATURE_VERSION = "v0";
const SLACK_SIGNATURE_TOLERANCE_SECONDS = 60 * 5;
const sectionId = process.env.WHOOING_SECTION_ID;

type SlackCommand = "/expense" | "/income";

interface SlackViewsOpenResponse {
  ok?: boolean;
  error?: string;
}

interface VerifySlackSignatureInput {
  signingSecret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs?: number;
}

function verifySlackSignature({
  signingSecret,
  timestamp,
  signature,
  rawBody,
  nowMs = Date.now(),
}: VerifySlackSignatureInput) {
  if (!signingSecret || !timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampSeconds);
  if (ageSeconds > SLACK_SIGNATURE_TOLERANCE_SECONDS) return false;

  const baseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const digest = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const expectedSignature = `${SLACK_SIGNATURE_VERSION}=${digest}`;

  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function slackText(text: string) {
  return NextResponse.json({
    response_type: "ephemeral",
    text,
  });
}

function commandFrom(value: string | null): SlackCommand | null {
  if (value === "/expense" || value === "/income") return value;
  return null;
}

async function openSlackView(triggerId: string, view: object) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: "missing_slack_bot_token" };
  }

  const response = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view,
    }),
  });

  return response.json() as Promise<SlackViewsOpenResponse>;
}

async function handleSlashCommand(params: URLSearchParams) {
  const command = commandFrom(params.get("command"));

  if (command === "/expense") {
    const triggerId = params.get("trigger_id");
    if (!triggerId) {
      return NextResponse.json({ error: "Missing Slack trigger_id" }, { status: 400 });
    }

    const accounts = await getSlackLedgerEntryAccounts();
    const result = await openSlackView(triggerId, buildExpenseLedgerModal(accounts));
    if (!result.ok) {
      return NextResponse.json({ error: "Failed to open Slack modal" }, { status: 502 });
    }

    return slackText("expense modal skeleton");
  }

  if (command === "/income") {
    return slackText("income modal skeleton");
  }

  return slackText("unsupported ledger command skeleton");
}

async function handleInteractivity(params: URLSearchParams) {
  const payloadText = params.get("payload");
  if (!payloadText) {
    return NextResponse.json({ error: "Missing Slack payload" }, { status: 400 });
  }

  let payload: { type?: string };
  try {
    payload = JSON.parse(payloadText) as { type?: string };
  } catch {
    return NextResponse.json({ error: "Invalid Slack payload" }, { status: 400 });
  }

  if (isExpenseLedgerSubmission(payload)) {
    const submission = parseExpenseLedgerSubmission(payload);
    if (!submission) {
      return NextResponse.json({ error: "Invalid expense submission" }, { status: 400 });
    }

    try {
      const calculation = calculateExpensePosting(submission);
      const whooingPayload = buildWhooingExpenseEntryPayload({
        sectionId,
        submission,
        calculation,
      });
      await createWhooingEntry(whooingPayload);

      // TODO: If Whooing POST + local sync approaches Slack's 3s limit, ack first
      // and move dashboard sync plus user notification to an async job/chat.postMessage.
      try {
        await syncWhooingEntriesForDate(submission.occurredDate);
      } catch (error) {
        if (error instanceof WhooingLocalSyncError) {
          return NextResponse.json({
            response_action: "update",
            view: buildExpenseRegistrationSuccessView(submission, calculation, "pending"),
          });
        }

        throw error;
      }

      return NextResponse.json({
        response_action: "update",
        view: buildExpenseRegistrationSuccessView(submission, calculation, "synced"),
      });
    } catch (error) {
      if (error instanceof ExpensePostingValidationError) {
        return NextResponse.json({
          response_action: "errors",
          errors: {
            [error.blockId]: error.message,
          },
        });
      }

      if (error instanceof WhooingWriteClientError) {
        return NextResponse.json({
          response_action: "update",
          view: buildExpenseRegistrationFailureView(),
        });
      }

      throw error;
    }
  }

  if (payload.type === "view_submission") {
    return NextResponse.json({ text: "view_submission skeleton" });
  }

  return NextResponse.json({ text: "interactivity skeleton" });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureValid = verifySlackSignature({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    rawBody,
  });

  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  if (params.has("payload")) {
    return handleInteractivity(params);
  }

  return handleSlashCommand(params);
}
