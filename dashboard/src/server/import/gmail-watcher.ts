import { pyeonhanSourceFileHash } from "./pyeonhan-excel-parser.ts";

export interface GmailAttachmentEnvelope {
  messageId: string;
  attachmentId: string;
  filename: string;
  bytes: Buffer;
}

export interface GmailWatcherAdapter {
  listAttachments: (query: string) => Promise<GmailAttachmentEnvelope[]>;
}

export const GMAIL_IMPORT_ENABLED_ENV = "GMAIL_IMPORT_ENABLED";
export const GMAIL_IMPORT_QUERY_ENV = "GMAIL_IMPORT_QUERY";
export const GMAIL_IMPORT_POLL_INTERVAL_ENV = "GMAIL_IMPORT_POLL_INTERVAL_MS";
export const GMAIL_IMPORT_DRY_RUN_ONLY_ENV = "GMAIL_IMPORT_DRY_RUN_ONLY";
export const GMAIL_IMPORT_LABEL_ENV = "GMAIL_IMPORT_LABEL";
export const DEFAULT_PYEONHAN_GMAIL_QUERY = "has:attachment filename:xlsx subject:(편한가계부 OR 가계부)";
export const DEFAULT_GMAIL_IMPORT_POLL_INTERVAL_MS = 300_000;

type GmailImportEnv = Record<string, string | undefined>;

export interface GmailImportRuntimeStatus {
  enabled: boolean;
  state: "disabled" | "needs_credentials" | "ready";
  query: string;
  pollIntervalMs: number;
  credentialsConfigured: boolean;
  dryRunOnly: boolean;
  label: string | null;
}

export function buildGmailImportQuery(env: GmailImportEnv = process.env) {
  return env[GMAIL_IMPORT_QUERY_ENV]?.trim() || DEFAULT_PYEONHAN_GMAIL_QUERY;
}

function gmailPollInterval(env: GmailImportEnv) {
  const value = Number(env[GMAIL_IMPORT_POLL_INTERVAL_ENV]);
  return Number.isFinite(value) && value >= 60_000
    ? value
    : DEFAULT_GMAIL_IMPORT_POLL_INTERVAL_MS;
}

export function getGmailImportRuntimeStatus(env: GmailImportEnv = process.env): GmailImportRuntimeStatus {
  const enabled = env[GMAIL_IMPORT_ENABLED_ENV]?.toLowerCase() === "true";
  const credentialFiles = Boolean(env.GMAIL_CREDENTIALS_FILE && env.GMAIL_TOKEN_FILE);
  const explicitOAuth = Boolean(
    env.GMAIL_OAUTH_CLIENT_ID
    && env.GMAIL_OAUTH_CLIENT_SECRET
    && env.GMAIL_OAUTH_REFRESH_TOKEN,
  );
  const credentialsConfigured = credentialFiles || explicitOAuth;
  return {
    enabled,
    state: !enabled ? "disabled" : credentialsConfigured ? "ready" : "needs_credentials",
    query: buildGmailImportQuery(env),
    pollIntervalMs: gmailPollInterval(env),
    credentialsConfigured,
    dryRunOnly: env[GMAIL_IMPORT_DRY_RUN_ONLY_ENV]?.toLowerCase() !== "false",
    label: env[GMAIL_IMPORT_LABEL_ENV]?.trim() || null,
  };
}

export function gmailAttachmentIdentity(input: Pick<GmailAttachmentEnvelope, "messageId" | "attachmentId">) {
  return `gmail:${input.messageId}:${input.attachmentId}`;
}

export async function processGmailAttachment<T>(
  attachment: GmailAttachmentEnvelope,
  dependencies: {
    wasProcessed: (identity: string) => Promise<boolean>;
    wasSourceFileProcessed: (sourceFileHash: string) => Promise<boolean>;
    importAttachment: (attachment: GmailAttachmentEnvelope) => Promise<T>;
  },
) {
  const identity = gmailAttachmentIdentity(attachment);
  if (await dependencies.wasProcessed(identity)) {
    return { status: "duplicate" as const, identity, result: null };
  }
  const sourceFileHash = pyeonhanSourceFileHash(attachment.bytes);
  if (await dependencies.wasSourceFileProcessed(sourceFileHash)) {
    return { status: "duplicate_file" as const, identity, sourceFileHash, result: null };
  }
  return {
    status: "handed_off" as const,
    identity,
    sourceFileHash,
    result: await dependencies.importAttachment(attachment),
  };
}

export async function pollGmailAttachmentsOnce<T>(input: {
  adapter: GmailWatcherAdapter;
  query: string;
  wasProcessed: (identity: string) => Promise<boolean>;
  wasSourceFileProcessed: (sourceFileHash: string) => Promise<boolean>;
  importAttachment: (attachment: GmailAttachmentEnvelope) => Promise<T>;
}) {
  const attachments = await input.adapter.listAttachments(input.query);
  const results = [];
  for (const attachment of attachments) {
    results.push(await processGmailAttachment(attachment, input));
  }
  return results;
}

export async function pollConfiguredGmailAttachmentsOnce<T>(input: {
  env?: GmailImportEnv;
  adapter: GmailWatcherAdapter;
  wasProcessed: (identity: string) => Promise<boolean>;
  wasSourceFileProcessed: (sourceFileHash: string) => Promise<boolean>;
  importAttachment: (attachment: GmailAttachmentEnvelope) => Promise<T>;
}) {
  const runtime = getGmailImportRuntimeStatus(input.env);
  if (runtime.state !== "ready") {
    return { status: runtime.state, runtime, results: [] } as const;
  }
  const results = await pollGmailAttachmentsOnce({
    ...input,
    query: runtime.query,
  });
  return { status: "polled" as const, runtime, results };
}
