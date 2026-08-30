import assert from "node:assert/strict";
import test from "node:test";
import { runGmailImportDryRunPoll } from "./gmail-import-runtime.ts";

const attachment = {
  messageId: "message-1",
  attachmentId: "attachment-1",
  filename: "2026-08.xlsx",
  bytes: Buffer.from("xlsx"),
};

test("Gmail import poll stays fail-closed when credentials are unavailable", async () => {
  let adapterCalls = 0;
  const result = await runGmailImportDryRunPoll({
    env: { GMAIL_IMPORT_ENABLED: "true" },
    loadCredentials: async () => ({ state: "needs_credentials", reason: "refresh_token_missing" }),
    createAdapter: () => ({
      listAttachments: async () => {
        adapterCalls += 1;
        return { checkedMessages: 0, attachments: [] };
      },
    }),
    wasProcessed: async () => false,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => ({ batchId: 1 }),
  });

  assert.equal(result.status, "needs_credentials");
  assert.equal(adapterCalls, 0);
});

test("Gmail import poll creates review batches and summarizes duplicates", async () => {
  const result = await runGmailImportDryRunPoll({
    env: { GMAIL_IMPORT_ENABLED: "true", GMAIL_IMPORT_DRY_RUN_ONLY: "true" },
    loadCredentials: async () => ({
      state: "ready",
      source: "env",
      credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    }),
    createAdapter: () => ({
      listAttachments: async () => ({ checkedMessages: 2, attachments: [attachment] }),
    }),
    wasProcessed: async () => false,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => ({ batchId: 17 }),
  });

  assert.deepEqual(result, {
    status: "polled",
    checkedMessages: 2,
    foundAttachments: 1,
    importedBatches: 1,
    reusedBatches: 0,
    batchIds: [17],
    errors: [],
  });
});

test("Gmail import poll counts the same attachment as reused", async () => {
  const result = await runGmailImportDryRunPoll({
    env: { GMAIL_IMPORT_ENABLED: "true" },
    loadCredentials: async () => ({
      state: "ready",
      source: "env",
      credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    }),
    createAdapter: () => ({ listAttachments: async () => ({ checkedMessages: 1, attachments: [attachment] }) }),
    wasProcessed: async () => true,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => ({ batchId: 1 }),
  });

  assert.equal(result.importedBatches, 0);
  assert.equal(result.reusedBatches, 1);
});

test("Gmail import poll reports a safe attachment error without failing the whole poll", async () => {
  const result = await runGmailImportDryRunPoll({
    env: { GMAIL_IMPORT_ENABLED: "true" },
    loadCredentials: async () => ({
      state: "ready",
      source: "env",
      credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    }),
    createAdapter: () => ({ listAttachments: async () => ({ checkedMessages: 1, attachments: [attachment] }) }),
    wasProcessed: async () => false,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => { throw new Error("invalid workbook details"); },
  });

  assert.equal(result.status, "polled");
  assert.deepEqual(result.errors, ["attachment_import_failed"]);
});
