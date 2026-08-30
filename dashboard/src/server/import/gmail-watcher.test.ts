import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGmailImportQuery,
  getGmailImportRuntimeStatus,
  gmailAttachmentIdentity,
  pollConfiguredGmailAttachmentsOnce,
  pollGmailAttachmentsOnce,
  processGmailAttachment,
  type GmailAttachmentEnvelope,
} from "./gmail-watcher.ts";

const attachment: GmailAttachmentEnvelope = {
  messageId: "message-1",
  attachmentId: "attachment-2",
  filename: "2026-08.xlsx",
  bytes: Buffer.from("xlsx"),
};

test("gmail attachment identity is stable per message and attachment", () => {
  assert.equal(gmailAttachmentIdentity(attachment), "gmail:message-1:attachment-2");
  assert.notEqual(
    gmailAttachmentIdentity(attachment),
    gmailAttachmentIdentity({ ...attachment, attachmentId: "attachment-3" }),
  );
});

test("gmail watcher handoff skips processed attachments and passes new bytes to import", async () => {
  let imports = 0;
  const skipped = await processGmailAttachment(attachment, {
    wasProcessed: async () => true,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => {
      imports += 1;
      return { batchId: 1 };
    },
  });
  const processed = await processGmailAttachment(attachment, {
    wasProcessed: async () => false,
    wasSourceFileProcessed: async () => false,
    importAttachment: async (received) => {
      imports += 1;
      assert.equal(received.bytes.toString(), "xlsx");
      return { batchId: 2 };
    },
  });

  assert.equal(skipped.status, "duplicate");
  assert.equal(processed.status, "handed_off");
  assert.equal(imports, 1);
});

test("gmail watcher blocks identical attachment bytes across different messages", async () => {
  let imports = 0;
  const result = await processGmailAttachment(attachment, {
    wasProcessed: async () => false,
    wasSourceFileProcessed: async (sourceFileHash) => {
      assert.match(sourceFileHash, /^[a-f0-9]{64}$/);
      return true;
    },
    importAttachment: async () => {
      imports += 1;
      return { batchId: 3 };
    },
  });

  assert.equal(result.status, "duplicate_file");
  assert.equal(imports, 0);
});

test("gmail runtime stays disabled without both enabled flag and credential files", () => {
  assert.deepEqual(getGmailImportRuntimeStatus({}), {
    enabled: false,
    state: "disabled",
    query: "has:attachment filename:xlsx subject:(편한가계부 OR 가계부)",
    pollIntervalMs: 300000,
    credentialsConfigured: false,
    dryRunOnly: true,
    label: null,
    autoExecuteEnabled: false,
    safeOnly: false,
    accountCreateEnabled: false,
    accountCreateRequiresApproval: true,
  });
  assert.equal(getGmailImportRuntimeStatus({ GMAIL_IMPORT_ENABLED: "true" }).state, "needs_credentials");
  assert.equal(getGmailImportRuntimeStatus({
    GMAIL_IMPORT_ENABLED: "true",
    GMAIL_CREDENTIALS_FILE: "/run/secrets/gmail-client.json",
    GMAIL_TOKEN_FILE: "/run/secrets/gmail-token.json",
  }).state, "ready");
  assert.equal(getGmailImportRuntimeStatus({
    GMAIL_IMPORT_ENABLED: "true",
    GMAIL_OAUTH_CLIENT_ID: "client-id",
    GMAIL_OAUTH_CLIENT_SECRET: "client-secret",
    GMAIL_OAUTH_REFRESH_TOKEN: "refresh-token",
  }).state, "ready");
});

test("gmail runtime is dry-run only by default and accepts explicit label", () => {
  const status = getGmailImportRuntimeStatus({
    GMAIL_IMPORT_LABEL: "pyeonhan-import",
    GMAIL_IMPORT_DRY_RUN_ONLY: "false",
  });

  assert.equal(status.dryRunOnly, false);
  assert.equal(status.label, "pyeonhan-import");
});

test("gmail query builder preserves a custom read-only attachment query", () => {
  assert.equal(
    buildGmailImportQuery({ GMAIL_IMPORT_QUERY: "has:attachment filename:ledger.xlsx" }),
    "has:attachment filename:ledger.xlsx",
  );
});

test("gmail poller delegates each mock attachment through the deduplicating handoff", async () => {
  const results = await pollGmailAttachmentsOnce({
    adapter: { listAttachments: async (query) => {
      assert.match(query, /filename:xlsx/);
      return { checkedMessages: 1, attachments: [attachment] };
    } },
    query: buildGmailImportQuery({}),
    wasProcessed: async () => false,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => ({ batchId: 7 }),
  });

  assert.equal(results.checkedMessages, 1);
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0].status, "handed_off");
});

test("configured gmail poller fails closed before invoking an adapter", async () => {
  let adapterCalls = 0;
  const dependencies = {
    adapter: { listAttachments: async () => {
      adapterCalls += 1;
      return { checkedMessages: 1, attachments: [attachment] };
    } },
    wasProcessed: async () => false,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => ({ batchId: 8 }),
  };

  const disabled = await pollConfiguredGmailAttachmentsOnce({ env: {}, ...dependencies });
  const missingCredentials = await pollConfiguredGmailAttachmentsOnce({
    env: { GMAIL_IMPORT_ENABLED: "true" },
    ...dependencies,
  });

  assert.equal(disabled.status, "disabled");
  assert.equal(missingCredentials.status, "needs_credentials");
  assert.equal(adapterCalls, 0);
});

test("configured gmail poller invokes a mock adapter only when ready", async () => {
  let adapterCalls = 0;
  const result = await pollConfiguredGmailAttachmentsOnce({
    env: {
      GMAIL_IMPORT_ENABLED: "true",
      GMAIL_CREDENTIALS_FILE: "/run/secrets/gmail-client.json",
      GMAIL_TOKEN_FILE: "/run/secrets/gmail-token.json",
    },
    adapter: { listAttachments: async () => {
      adapterCalls += 1;
      return { checkedMessages: 1, attachments: [attachment] };
    } },
    wasProcessed: async () => false,
    wasSourceFileProcessed: async () => false,
    importAttachment: async () => ({ batchId: 9 }),
  });

  assert.equal(result.status, "polled");
  assert.equal(result.results.results.length, 1);
  assert.equal(adapterCalls, 1);
});
