import assert from "node:assert/strict";
import test from "node:test";
import {
  gmailAttachmentIdentity,
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
    importAttachment: async () => {
      imports += 1;
      return { batchId: 1 };
    },
  });
  const processed = await processGmailAttachment(attachment, {
    wasProcessed: async () => false,
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
