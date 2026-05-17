import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildExpenseRegistrationFailureView,
  buildExpenseRegistrationSuccessView,
  buildLedgerRegistrationFailureView,
  buildLedgerRegistrationSuccessView,
  buildLedgerEntryModalForType,
  buildLedgerEntryTypeSelectModal,
  buildIncomeLedgerModal,
  buildIncomeRegistrationFailureView,
  buildIncomeRegistrationSuccessView,
  buildWhooingBalanceAdjustmentEntryPayload,
  buildWhooingCardPaymentEntryPayload,
  buildWhooingExpenseEntryPayload,
  buildWhooingIncomeEntryPayload,
  buildWhooingTransferEntryPayload,
  buildExpenseLedgerModal,
  calculateExpensePosting,
  ExpensePostingValidationError,
  IncomePostingValidationError,
  LedgerPostingValidationError,
  isBalanceAdjustmentLedgerSubmission,
  isCardPaymentLedgerSubmission,
  isExpenseLedgerSubmission,
  isIncomeLedgerSubmission,
  isLedgerEntryTypeSelectionSubmission,
  isTransferLedgerSubmission,
  parseBalanceAdjustmentLedgerSubmission,
  parseCardPaymentLedgerSubmission,
  parseExpenseLedgerSubmission,
  parseIncomeLedgerSubmission,
  parseLedgerEntryTypeSelection,
  parseTransferLedgerSubmission,
  type LedgerLocalSyncStatus,
  type WhooingEntryPayload,
} from "@/features/slack/ledger-entry";
import { getSlackLedgerEntryAccounts } from "@/server/whooing/account-repository";
import { syncWhooingEntriesForDate, WhooingLocalSyncError } from "@/server/whooing/sync-client";
import { createWhooingEntry, WhooingWriteClientError } from "@/server/whooing/write-client";

export const runtime = "nodejs";

const SLACK_SIGNATURE_VERSION = "v0";
const SLACK_SIGNATURE_TOLERANCE_SECONDS = 60 * 5;
const sectionId = process.env.WHOOING_SECTION_ID;

type SlackCommand = "/ledger" | "/expense" | "/income";

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
  if (value === "/ledger" || value === "/expense" || value === "/income") return value;
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

function won(value: string | number) {
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

async function createEntryAndSync(payload: WhooingEntryPayload, occurredDate: string): Promise<LedgerLocalSyncStatus> {
  await createWhooingEntry(payload);

  try {
    await syncWhooingEntriesForDate(occurredDate);
    return "synced";
  } catch (error) {
    if (error instanceof WhooingLocalSyncError) return "pending";
    throw error;
  }
}

async function handleSlashCommand(params: URLSearchParams) {
  const command = commandFrom(params.get("command"));

  if (command === "/ledger") {
    const triggerId = params.get("trigger_id");
    if (!triggerId) {
      return NextResponse.json({ error: "Missing Slack trigger_id" }, { status: 400 });
    }

    const result = await openSlackView(triggerId, buildLedgerEntryTypeSelectModal());
    if (!result.ok) {
      return NextResponse.json({ error: "Failed to open Slack modal" }, { status: 502 });
    }

    return slackText("ledger modal skeleton");
  }

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
    const triggerId = params.get("trigger_id");
    if (!triggerId) {
      return NextResponse.json({ error: "Missing Slack trigger_id" }, { status: 400 });
    }

    const accounts = await getSlackLedgerEntryAccounts();
    const result = await openSlackView(triggerId, buildIncomeLedgerModal(accounts));
    if (!result.ok) {
      return NextResponse.json({ error: "Failed to open Slack modal" }, { status: 502 });
    }

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

  if (isLedgerEntryTypeSelectionSubmission(payload)) {
    const selectedType = parseLedgerEntryTypeSelection(payload);
    if (!selectedType) {
      return NextResponse.json({
        response_action: "errors",
        errors: {
          ledger_entry_type: "거래 유형을 선택해야 합니다.",
        },
      });
    }

    const accounts = await getSlackLedgerEntryAccounts();
    return NextResponse.json({
      response_action: "update",
      view: buildLedgerEntryModalForType(selectedType, accounts),
    });
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

  if (isIncomeLedgerSubmission(payload)) {
    const submission = parseIncomeLedgerSubmission(payload);
    if (!submission) {
      return NextResponse.json({ error: "Invalid income submission" }, { status: 400 });
    }

    try {
      const whooingPayload = buildWhooingIncomeEntryPayload({
        sectionId,
        submission,
      });
      await createWhooingEntry(whooingPayload);

      try {
        await syncWhooingEntriesForDate(submission.occurredDate);
      } catch (error) {
        if (error instanceof WhooingLocalSyncError) {
          return NextResponse.json({
            response_action: "update",
            view: buildIncomeRegistrationSuccessView(submission, "pending"),
          });
        }

        throw error;
      }

      return NextResponse.json({
        response_action: "update",
        view: buildIncomeRegistrationSuccessView(submission, "synced"),
      });
    } catch (error) {
      if (error instanceof IncomePostingValidationError) {
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
          view: buildIncomeRegistrationFailureView(),
        });
      }

      throw error;
    }
  }

  if (isTransferLedgerSubmission(payload)) {
    const submission = parseTransferLedgerSubmission(payload);
    if (!submission) {
      return NextResponse.json({ error: "Invalid transfer submission" }, { status: 400 });
    }

    try {
      const whooingPayload = buildWhooingTransferEntryPayload({ sectionId, submission });
      const syncStatus = await createEntryAndSync(whooingPayload, submission.occurredDate);

      return NextResponse.json({
        response_action: "update",
        view: buildLedgerRegistrationSuccessView("이체", [
          { label: "내용", value: submission.item.trim() },
          { label: "이체금액", value: won(submission.amount) },
          { label: "출금 계정", value: submission.fromAccountLabel || submission.fromAccountId },
          { label: "입금 계정", value: submission.toAccountLabel || submission.toAccountId },
        ], syncStatus),
      });
    } catch (error) {
      if (error instanceof LedgerPostingValidationError) {
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
          view: buildLedgerRegistrationFailureView("이체"),
        });
      }

      throw error;
    }
  }

  if (isCardPaymentLedgerSubmission(payload)) {
    const submission = parseCardPaymentLedgerSubmission(payload);
    if (!submission) {
      return NextResponse.json({ error: "Invalid card payment submission" }, { status: 400 });
    }

    try {
      const whooingPayload = buildWhooingCardPaymentEntryPayload({ sectionId, submission });
      const syncStatus = await createEntryAndSync(whooingPayload, submission.occurredDate);

      return NextResponse.json({
        response_action: "update",
        view: buildLedgerRegistrationSuccessView("카드상환", [
          { label: "내용", value: submission.item.trim() },
          { label: "상환금액", value: won(submission.amount) },
          { label: "카드/부채 계정", value: submission.liabilityAccountLabel || submission.liabilityAccountId },
          { label: "출금 계정", value: submission.assetAccountLabel || submission.assetAccountId },
        ], syncStatus),
      });
    } catch (error) {
      if (error instanceof LedgerPostingValidationError) {
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
          view: buildLedgerRegistrationFailureView("카드상환"),
        });
      }

      throw error;
    }
  }

  if (isBalanceAdjustmentLedgerSubmission(payload)) {
    const submission = parseBalanceAdjustmentLedgerSubmission(payload);
    if (!submission) {
      return NextResponse.json({ error: "Invalid balance adjustment submission" }, { status: 400 });
    }

    try {
      const whooingPayload = buildWhooingBalanceAdjustmentEntryPayload({ sectionId, submission });
      const syncStatus = await createEntryAndSync(whooingPayload, submission.occurredDate);

      return NextResponse.json({
        response_action: "update",
        view: buildLedgerRegistrationSuccessView("잔고조정", [
          { label: "사유", value: submission.reason.trim() },
          { label: "조정금액", value: won(submission.amount) },
          { label: "대상 계정", value: submission.targetAccountLabel || submission.targetAccountId },
          { label: "방향", value: submission.direction === "increase" ? "증가" : "감소" },
        ], syncStatus),
      });
    } catch (error) {
      if (error instanceof LedgerPostingValidationError) {
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
          view: buildLedgerRegistrationFailureView("잔고조정"),
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
