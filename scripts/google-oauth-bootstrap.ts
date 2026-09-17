/**
 * One-shot OAuth bootstrap for Google Workspace refresh tokens.
 *
 * Usage (from worktree, with client id/secret already in .env.local):
 *   npm run google:oauth
 *
 * Then open the printed URL, approve, and the script writes GOOGLE_REFRESH_TOKEN
 * into .env.local (gitignored). It never prints the token.
 */
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { google } from "googleapis";
import { SCOPES } from "../lib/google/client";

const PORT = Number(process.env.GOOGLE_OAUTH_BOOTSTRAP_PORT ?? 8787);
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI?.trim() ||
  `http://127.0.0.1:${PORT}/oauth/callback`;
const ENV_PATH = resolve(process.cwd(), ".env.local");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in environment / .env.local`);
  return value;
}

function upsertEnv(path: string, key: string, value: string) {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const line = `${key}=${value}`;
  const next = existing.match(new RegExp(`^${key}=.*$`, "m"))
    ? existing.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${existing.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(path, next, "utf8");
}

async function main() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...SCOPES],
  });

  console.log("1) In Cloud Console → Credentials → your OAuth client,");
  console.log("   add this EXACT Authorized redirect URI:");
  console.log(`   ${REDIRECT_URI}`);
  console.log("");
  console.log("2) Open this URL in a browser signed into the Workspace account:");
  console.log(authUrl);
  console.log("");
  console.log(`3) Waiting on ${REDIRECT_URI} …`);

  const code = await new Promise<string>((resolvePromise, reject) => {
    const server: Server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
        if (url.pathname !== "/oauth/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        if (error) throw new Error(`OAuth error: ${error}`);
        const received = url.searchParams.get("code");
        if (!received) throw new Error("No authorization code in callback");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><h1>Somebody OAuth complete</h1><p>You can close this tab.</p></body></html>",
        );
        server.close();
        resolvePromise(received);
      } catch (err) {
        res.writeHead(500);
        res.end("OAuth failed");
        server.close();
        reject(err);
      }
    });
    server.listen(PORT, "127.0.0.1");
  });

  const tokenResponse = await oauth2.getToken(code);
  const refreshToken = tokenResponse.tokens.refresh_token;
  if (!refreshToken)
    throw new Error(
      "No refresh_token returned. Re-run with prompt=consent, or revoke prior grant at https://myaccount.google.com/permissions then try again.",
    );

  upsertEnv(ENV_PATH, "GOOGLE_REDIRECT_URI", REDIRECT_URI);
  upsertEnv(ENV_PATH, "GOOGLE_REFRESH_TOKEN", refreshToken);
  upsertEnv(ENV_PATH, "GOOGLE_WORKSPACE_LIVE", "true");
  console.log(`Wrote GOOGLE_REFRESH_TOKEN and GOOGLE_REDIRECT_URI to ${ENV_PATH}`);
  console.log("Token value was not printed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
