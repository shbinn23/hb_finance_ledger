import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  buildGmailAuthorizationUrl,
  exchangeGmailAuthorizationCode,
  parseInstalledOAuthClient,
  writeAuthorizedUserCredential,
} from "../src/server/import/gmail-oauth-bootstrap.ts";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeHtml(message: string) {
  return `<!doctype html><meta charset="utf-8"><title>Gmail OAuth</title><p>${message}</p>`;
}

async function main() {
  const clientPathValue = argument("--client");
  if (!clientPathValue) throw new Error("usage: npm run gmail:oauth -- --client /path/to/client.json [--output /path/to/authorized-user.json]");
  const clientPath = resolve(clientPathValue);
  const outputPath = resolve(argument("--output")
    ?? `${homedir()}/.config/hb_finance_ledger/gmail-authorized-user.json`);
  await chmod(clientPath, 0o600);
  const client = parseInstalledOAuthClient(JSON.parse(await readFile(clientPath, "utf8")));
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const authorization = await new Promise<{ code: string; redirectUri: string }>((resolveAuthorization, rejectAuthorization) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/oauth2/callback") {
        response.writeHead(404).end();
        return;
      }
      const callbackState = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");
      if (error || callbackState !== state || !code) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end(safeHtml("Gmail 승인이 완료되지 않았습니다. 이 창을 닫고 다시 시도해 주세요."));
        server.close();
        rejectAuthorization(new Error(error ? "gmail_oauth_denied" : "gmail_oauth_callback_invalid"));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(safeHtml("Gmail read-only 승인이 완료되었습니다. 이 창을 닫고 Codex로 돌아가세요."));
      const address = server.address();
      const redirectUri = typeof address === "object" && address
        ? `http://127.0.0.1:${address.port}/oauth2/callback`
        : "";
      server.close();
      resolveAuthorization({ code, redirectUri });
    });
    server.on("error", rejectAuthorization);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || !address) {
        server.close();
        rejectAuthorization(new Error("gmail_oauth_listener_failed"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
      const authorizationUrl = buildGmailAuthorizationUrl({
        authUri: client.authUri,
        clientId: client.clientId,
        redirectUri,
        state,
        codeChallenge,
      });
      const browser = spawn("open", [authorizationUrl.toString()], { detached: true, stdio: "ignore" });
      browser.unref();
      process.stdout.write("기본 브라우저에서 Gmail read-only 승인 창을 열었습니다. 승인 완료를 기다립니다.\n");
    });
    setTimeout(() => {
      server.close();
      rejectAuthorization(new Error("gmail_oauth_callback_timeout"));
    }, 10 * 60 * 1000).unref();
  });

  const token = await exchangeGmailAuthorizationCode({
    client,
    code: authorization.code,
    codeVerifier,
    redirectUri: authorization.redirectUri,
  });
  await writeAuthorizedUserCredential(outputPath, {
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    refreshToken: token.refreshToken,
  });
  process.stdout.write(`Gmail authorized_user credential을 안전하게 저장했습니다: ${outputPath}\n`);
}

main().catch((error) => {
  const safeErrors = new Set([
    "gmail_oauth_client_required",
    "gmail_oauth_denied",
    "gmail_oauth_callback_invalid",
    "gmail_oauth_callback_timeout",
    "gmail_oauth_listener_failed",
    "gmail_oauth_exchange_failed",
    "gmail_refresh_token_missing",
  ]);
  const message = error instanceof Error && safeErrors.has(error.message)
    ? error.message
    : error instanceof Error && error.message.startsWith("usage:")
      ? error.message
      : "gmail_oauth_bootstrap_failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
