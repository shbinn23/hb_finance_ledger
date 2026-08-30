import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyGmailCredentialDocument,
  loadGmailOAuthCredentials,
} from "./gmail-credentials.ts";

test("authorized_user credentials are ready for personal Gmail readonly access", async () => {
  const result = await loadGmailOAuthCredentials({}, async () => ({
    type: "authorized_user",
    client_id: "client-id",
    client_secret: "client-secret",
    refresh_token: "refresh-token",
  }), "/secure/authorized-user.json");

  assert.equal(result.state, "ready");
  assert.equal(result.source, "authorized_user_file");
});

test("explicit OAuth environment credentials take precedence", async () => {
  const result = await loadGmailOAuthCredentials({
    GMAIL_OAUTH_CLIENT_ID: "client-id",
    GMAIL_OAUTH_CLIENT_SECRET: "client-secret",
    GMAIL_OAUTH_REFRESH_TOKEN: "refresh-token",
  });

  assert.equal(result.state, "ready");
  assert.equal(result.source, "env");
});

test("service account credentials fail closed for a personal Gmail mailbox", async () => {
  const document = {
    type: "service_account",
    client_email: "masked@example.invalid",
    private_key: "private-key",
  };

  assert.deepEqual(classifyGmailCredentialDocument(document), {
    type: "service_account",
    supported: false,
    refreshTokenConfigured: false,
  });
  const result = await loadGmailOAuthCredentials({}, async () => document, "/secure/service-account.json");
  assert.deepEqual(result, {
    state: "needs_credentials",
    reason: "service_account_unsupported",
  });
});

test("incomplete OAuth credentials fail closed without exposing values", async () => {
  const result = await loadGmailOAuthCredentials({}, async () => ({
    installed: { client_id: "client-id", client_secret: "client-secret" },
  }), "/secure/oauth-client.json");

  assert.deepEqual(result, {
    state: "needs_credentials",
    reason: "refresh_token_missing",
  });
});
