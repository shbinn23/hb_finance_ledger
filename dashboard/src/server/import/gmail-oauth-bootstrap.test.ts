import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  GMAIL_READONLY_SCOPE,
  buildGmailAuthorizationUrl,
  exchangeGmailAuthorizationCode,
  parseInstalledOAuthClient,
  writeAuthorizedUserCredential,
} from "./gmail-oauth-bootstrap.ts";

test("installed OAuth client is accepted while service accounts fail closed", () => {
  assert.deepEqual(parseInstalledOAuthClient({
    installed: {
      client_id: "client-id",
      client_secret: "client-secret",
      auth_uri: "https://accounts.google.com/o/oauth2/v2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
    },
  }), {
    clientId: "client-id",
    clientSecret: "client-secret",
    authUri: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUri: "https://oauth2.googleapis.com/token",
  });

  assert.throws(
    () => parseInstalledOAuthClient({ type: "service_account" }),
    /gmail_oauth_client_required/,
  );
});

test("authorization URL requests only Gmail readonly with offline consent and PKCE", () => {
  const url = buildGmailAuthorizationUrl({
    authUri: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: "client-id",
    redirectUri: "http://127.0.0.1:43125/oauth2/callback",
    state: "state-value",
    codeChallenge: "challenge-value",
  });

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), GMAIL_READONLY_SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "state-value");
});

test("token exchange requires a refresh token without returning access token data", async () => {
  const result = await exchangeGmailAuthorizationCode({
    client: {
      clientId: "client-id",
      clientSecret: "client-secret",
      authUri: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUri: "https://oauth2.googleapis.com/token",
    },
    code: "authorization-code",
    codeVerifier: "verifier-value",
    redirectUri: "http://127.0.0.1:43125/oauth2/callback",
    fetchImpl: async (_input, init) => {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code_verifier"), "verifier-value");
      return Response.json({ access_token: "discard-me", refresh_token: "refresh-token" });
    },
  });

  assert.deepEqual(result, { refreshToken: "refresh-token" });

  await assert.rejects(
    () => exchangeGmailAuthorizationCode({
      client: {
        clientId: "client-id",
        clientSecret: "client-secret",
        authUri: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUri: "https://oauth2.googleapis.com/token",
      },
      code: "authorization-code",
      codeVerifier: "verifier-value",
      redirectUri: "http://127.0.0.1:43125/oauth2/callback",
      fetchImpl: async () => Response.json({ access_token: "access-token-only" }),
    }),
    /gmail_refresh_token_missing/,
  );
});

test("authorized_user credential is written with owner-only permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gmail-oauth-"));
  const path = join(directory, "authorized-user.json");

  await writeAuthorizedUserCredential(path, {
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
  });

  const document = JSON.parse(await readFile(path, "utf8"));
  const fileStat = await stat(path);
  assert.deepEqual(document, {
    type: "authorized_user",
    client_id: "client-id",
    client_secret: "client-secret",
    refresh_token: "refresh-token",
  });
  assert.equal(fileStat.mode & 0o777, 0o600);
});
