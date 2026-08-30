import { readFile } from "node:fs/promises";

type GmailImportEnv = Record<string, string | undefined>;
type CredentialDocument = Record<string, unknown>;

export interface GmailOAuthCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type GmailCredentialLoadResult =
  | { state: "ready"; source: "env" | "authorized_user_file" | "oauth_files"; credentials: GmailOAuthCredentials }
  | { state: "needs_credentials"; reason: "credential_file_missing" | "service_account_unsupported" | "refresh_token_missing" | "unsupported_credential" };

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function classifyGmailCredentialDocument(document: CredentialDocument) {
  const refreshTokenConfigured = Boolean(stringValue(document.refresh_token));
  if (document.type === "service_account" || stringValue(document.private_key)) {
    return { type: "service_account" as const, supported: false, refreshTokenConfigured };
  }
  if (document.type === "authorized_user" || refreshTokenConfigured) {
    return { type: "authorized_user" as const, supported: true, refreshTokenConfigured };
  }
  if (document.installed || document.web) {
    return { type: "oauth_client" as const, supported: true, refreshTokenConfigured };
  }
  return { type: "unknown" as const, supported: false, refreshTokenConfigured };
}

async function readJsonFile(path: string): Promise<CredentialDocument> {
  return JSON.parse(await readFile(path, "utf8")) as CredentialDocument;
}

function oauthClient(document: CredentialDocument) {
  const envelope = (document.installed ?? document.web ?? document) as CredentialDocument;
  return {
    clientId: stringValue(envelope.client_id),
    clientSecret: stringValue(envelope.client_secret),
  };
}

export async function loadGmailOAuthCredentials(
  env: GmailImportEnv = process.env,
  readJson: (path: string) => Promise<CredentialDocument> = readJsonFile,
  credentialPathOverride?: string,
): Promise<GmailCredentialLoadResult> {
  const explicit = {
    clientId: stringValue(env.GMAIL_OAUTH_CLIENT_ID),
    clientSecret: stringValue(env.GMAIL_OAUTH_CLIENT_SECRET),
    refreshToken: stringValue(env.GMAIL_OAUTH_REFRESH_TOKEN),
  };
  if (explicit.clientId && explicit.clientSecret && explicit.refreshToken) {
    return { state: "ready", source: "env", credentials: explicit as GmailOAuthCredentials };
  }

  const credentialPath = credentialPathOverride
    ?? env.GMAIL_OAUTH_CREDENTIAL_PATH
    ?? env.GMAIL_CREDENTIALS_FILE;
  if (!credentialPath) return { state: "needs_credentials", reason: "credential_file_missing" };

  let credentialDocument: CredentialDocument;
  try {
    credentialDocument = await readJson(credentialPath);
  } catch {
    return { state: "needs_credentials", reason: "credential_file_missing" };
  }
  const classification = classifyGmailCredentialDocument(credentialDocument);
  if (classification.type === "service_account") {
    return { state: "needs_credentials", reason: "service_account_unsupported" };
  }

  const client = oauthClient(credentialDocument);
  let refreshToken = stringValue(credentialDocument.refresh_token);
  let source: "authorized_user_file" | "oauth_files" = "authorized_user_file";
  const tokenPath = env.GMAIL_TOKEN_PATH ?? env.GMAIL_TOKEN_FILE;
  if (!refreshToken && tokenPath) {
    try {
      const tokenDocument = await readJson(tokenPath);
      refreshToken = stringValue(tokenDocument.refresh_token);
      source = "oauth_files";
    } catch {
      return { state: "needs_credentials", reason: "credential_file_missing" };
    }
  }
  if (!refreshToken) return { state: "needs_credentials", reason: "refresh_token_missing" };
  if (!client.clientId || !client.clientSecret) {
    return { state: "needs_credentials", reason: "unsupported_credential" };
  }
  return {
    state: "ready",
    source,
    credentials: {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      refreshToken,
    },
  };
}
