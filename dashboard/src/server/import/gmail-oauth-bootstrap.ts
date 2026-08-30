import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type CredentialDocument = Record<string, unknown>;

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface InstalledOAuthClient {
  clientId: string;
  clientSecret: string;
  authUri: string;
  tokenUri: string;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) throw new Error("gmail_oauth_client_required");
  return value;
}

export function parseInstalledOAuthClient(document: CredentialDocument): InstalledOAuthClient {
  if (!document.installed || typeof document.installed !== "object") {
    throw new Error("gmail_oauth_client_required");
  }
  const installed = document.installed as CredentialDocument;
  return {
    clientId: requiredString(installed.client_id),
    clientSecret: requiredString(installed.client_secret),
    authUri: requiredString(installed.auth_uri),
    tokenUri: requiredString(installed.token_uri),
  };
}

export function buildGmailAuthorizationUrl(input: {
  authUri: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL(input.authUri);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeGmailAuthorizationCode(input: {
  client: InstalledOAuthClient;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}) {
  const body = new URLSearchParams({
    client_id: input.client.clientId,
    client_secret: input.client.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });
  const response = await (input.fetchImpl ?? fetch)(input.client.tokenUri, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("gmail_oauth_exchange_failed");
  const token = await response.json() as { refresh_token?: unknown };
  if (typeof token.refresh_token !== "string" || token.refresh_token.length === 0) {
    throw new Error("gmail_refresh_token_missing");
  }
  return { refreshToken: token.refresh_token };
}

export async function writeAuthorizedUserCredential(path: string, input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify({
    type: "authorized_user",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  }, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}
