import assert from "node:assert/strict";
import test from "node:test";
import { createGmailApiAdapter, resolveGmailApiTimeoutMs } from "./gmail-api-adapter.ts";

test("Gmail API timeout rejects unsafe overrides", () => {
  assert.equal(resolveGmailApiTimeoutMs(), 15_000);
  assert.equal(resolveGmailApiTimeoutMs(Number.NaN), 15_000);
  assert.equal(resolveGmailApiTimeoutMs(4_999), 15_000);
  assert.equal(resolveGmailApiTimeoutMs(20_000), 20_000);
});

test("Gmail adapter refreshes OAuth and downloads only xlsx attachments", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "short-lived-token", token_type: "Bearer", expires_in: 3600 });
    }
    if (url.includes("/messages?") && !url.includes("attachments")) {
      return Response.json({ messages: [{ id: "message-1" }] });
    }
    if (url.endsWith("/messages/message-1?format=full")) {
      return Response.json({
        id: "message-1",
        payload: {
          parts: [
            { filename: "2026-08.xlsx", body: { attachmentId: "attachment-1" } },
            { filename: "notes.txt", body: { attachmentId: "attachment-2" } },
          ],
        },
      });
    }
    if (url.endsWith("/messages/message-1/attachments/attachment-1")) {
      return Response.json({ data: Buffer.from("xlsx-bytes").toString("base64url") });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const adapter = createGmailApiAdapter({
    credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    fetchImpl,
  });

  const result = await adapter.listAttachments("has:attachment filename:xlsx");

  assert.equal(result.checkedMessages, 1);
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].filename, "2026-08.xlsx");
  assert.equal(result.attachments[0].bytes.toString(), "xlsx-bytes");
  assert.deepEqual(requests.map((request) => request.method), ["POST", "GET", "GET", "GET"]);
});

test("Gmail adapter returns a safe authentication error", async () => {
  const adapter = createGmailApiAdapter({
    credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    fetchImpl: async () => Response.json({ error: "invalid_grant" }, { status: 400 }),
  });

  await assert.rejects(
    () => adapter.listAttachments("has:attachment filename:xlsx"),
    (error: Error) => error.message === "gmail_auth_failed",
  );
});

test("Gmail adapter accepts small xlsx attachments embedded in message body data", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "token" });
    if (url.includes("/messages?")) return Response.json({ messages: [{ id: "message-inline" }] });
    if (url.includes("?format=full")) {
      return Response.json({
        payload: {
          parts: [{
            partId: "2",
            filename: "inline.xlsx",
            body: { data: Buffer.from("inline-xlsx").toString("base64url") },
          }],
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const adapter = createGmailApiAdapter({
    credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    fetchImpl,
  });

  const result = await adapter.listAttachments("has:attachment filename:xlsx");

  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].attachmentId, "inline-2");
  assert.equal(result.attachments[0].bytes.toString(), "inline-xlsx");
});

test("Gmail adapter downloads attachmentId content when inline data is empty", async () => {
  let attachmentCalls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "token" });
    if (url.includes("/messages?")) return Response.json({ messages: [{ id: "message-external" }] });
    if (url.includes("?format=full")) {
      return Response.json({
        payload: {
          parts: [{
            filename: "external.xlsx",
            body: { attachmentId: "attachment-external", data: "" },
          }],
        },
      });
    }
    if (url.includes("/attachments/attachment-external")) {
      attachmentCalls += 1;
      return Response.json({ data: Buffer.from("external-xlsx").toString("base64url") });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const adapter = createGmailApiAdapter({
    credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    fetchImpl,
  });

  const result = await adapter.listAttachments("has:attachment filename:xlsx");

  assert.equal(attachmentCalls, 1);
  assert.equal(result.attachments[0].bytes.toString(), "external-xlsx");
});

test("Gmail adapter follows message-list pagination and applies request timeouts", async () => {
  let listCalls = 0;
  let everyRequestHadSignal = true;
  const fetchImpl: typeof fetch = async (input, init) => {
    everyRequestHadSignal &&= init?.signal instanceof AbortSignal;
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "token" });
    if (url.includes("/messages?") && !url.includes("attachments")) {
      listCalls += 1;
      return Response.json(listCalls === 1
        ? { messages: [{ id: "message-1" }], nextPageToken: "page-2" }
        : { messages: [{ id: "message-2" }] });
    }
    if (url.includes("?format=full")) return Response.json({ payload: { parts: [] } });
    throw new Error(`unexpected request: ${url}`);
  };
  const adapter = createGmailApiAdapter({
    credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    fetchImpl,
    timeoutMs: 12_000,
  });

  const result = await adapter.listAttachments("has:attachment filename:xlsx");

  assert.equal(result.checkedMessages, 2);
  assert.equal(listCalls, 2);
  assert.equal(everyRequestHadSignal, true);
});
