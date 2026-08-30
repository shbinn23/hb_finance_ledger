import type { GmailOAuthCredentials } from "./gmail-credentials.ts";
import type { GmailAttachmentEnvelope, GmailWatcherAdapter } from "./gmail-watcher.ts";

interface GmailMessagePart {
  partId?: string;
  filename?: string;
  body?: { attachmentId?: string; data?: string };
  parts?: GmailMessagePart[];
}

interface GmailXlsxAttachment {
  filename: string;
  attachmentId: string;
  inlineData?: string;
}

const DEFAULT_GMAIL_API_TIMEOUT_MS = 15_000;

export function resolveGmailApiTimeoutMs(value?: number) {
  return Number.isFinite(value) && Number(value) >= 5_000
    ? Math.floor(Number(value))
    : DEFAULT_GMAIL_API_TIMEOUT_MS;
}

function collectXlsxAttachments(
  part: GmailMessagePart | undefined,
  path = "0",
): GmailXlsxAttachment[] {
  if (!part) return [];
  const hasBody = part.body?.attachmentId || part.body?.data;
  const current = part.filename?.toLowerCase().endsWith(".xlsx") && hasBody
    ? [{
        filename: part.filename,
        attachmentId: part.body?.attachmentId ?? `inline-${part.partId ?? path}`,
        inlineData: part.body?.data,
      }]
    : [];
  return [
    ...current,
    ...(part.parts ?? []).flatMap((child, index) => collectXlsxAttachments(child, `${path}-${index}`)),
  ];
}

async function jsonResponse<T>(response: Response, safeError: string): Promise<T> {
  if (!response.ok) throw new Error(safeError);
  return response.json() as Promise<T>;
}

export function createGmailApiAdapter(input: {
  credentials: GmailOAuthCredentials;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): GmailWatcherAdapter {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = resolveGmailApiTimeoutMs(input.timeoutMs);
  const request = (url: string | URL, init: RequestInit = {}) => fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return {
    async listAttachments(query) {
      const tokenBody = new URLSearchParams({
        client_id: input.credentials.clientId,
        client_secret: input.credentials.clientSecret,
        refresh_token: input.credentials.refreshToken,
        grant_type: "refresh_token",
      });
      const token = await jsonResponse<{ access_token?: string }>(await request(
        "https://oauth2.googleapis.com/token",
        { method: "POST", body: tokenBody },
      ), "gmail_auth_failed");
      if (!token.access_token) throw new Error("gmail_auth_failed");
      const headers = { authorization: `Bearer ${token.access_token}` };
      const messages: Array<{ id: string }> = [];
      let pageToken: string | undefined;
      do {
        const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
        listUrl.searchParams.set("q", query);
        listUrl.searchParams.set("maxResults", "100");
        if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
        const list = await jsonResponse<{
          messages?: Array<{ id: string }>;
          nextPageToken?: string;
        }>(await request(listUrl, { headers, cache: "no-store" }), "gmail_search_failed");
        messages.push(...(list.messages ?? []));
        pageToken = list.nextPageToken;
      } while (pageToken);
      const attachments: GmailAttachmentEnvelope[] = [];
      for (const message of messages) {
        const detail = await jsonResponse<{ payload?: GmailMessagePart }>(await request(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=full`,
          { headers, cache: "no-store" },
        ), "gmail_message_failed");
        for (const candidate of collectXlsxAttachments(detail.payload)) {
          const data = candidate.inlineData || (await jsonResponse<{ data?: string }>(await request(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(candidate.attachmentId)}`,
              { headers, cache: "no-store" },
            ), "gmail_attachment_failed")).data;
          if (!data) throw new Error("gmail_attachment_failed");
          attachments.push({
            messageId: message.id,
            attachmentId: candidate.attachmentId,
            filename: candidate.filename,
            bytes: Buffer.from(data, "base64url"),
          });
        }
      }
      return { checkedMessages: messages.length, attachments };
    },
  };
}
