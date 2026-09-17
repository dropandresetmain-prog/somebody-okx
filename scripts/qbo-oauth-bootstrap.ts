/**
 * One-shot OAuth bootstrap for QuickBooks Online Sandbox.
 * Opens the Intuit authorize URL, listens on QBO_REDIRECT_URI, and prints
 * QBO_REFRESH_TOKEN / QBO_REALM_ID for .env.local (never commits them).
 */
import http from "node:http";
import { URL } from "node:url";

async function main() {
  process.loadEnvFile(".env.local");
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri =
    process.env.QBO_REDIRECT_URI || "http://localhost:8000/callback";
  if (!clientId || !clientSecret) {
    throw new Error("Set QBO_CLIENT_ID and QBO_CLIENT_SECRET in .env.local");
  }

  const redirect = new URL(redirectUri);
  const port = Number(redirect.port || 80);
  const state = `somebody-${Date.now()}`;
  const authorize = new URL("https://appcenter.intuit.com/connect/oauth2");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);

  console.log("Open this URL in a browser and approve the Sandbox company:");
  console.log(authorize.toString());

  const tokens = await new Promise<{
    refresh_token: string;
    realmId: string;
  }>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith(redirect.pathname)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const url = new URL(req.url, redirectUri);
        if (url.searchParams.get("state") !== state) {
          throw new Error("OAuth state mismatch");
        }
        const code = url.searchParams.get("code");
        const realmId = url.searchParams.get("realmId");
        if (!code || !realmId) throw new Error("Missing code or realmId");

        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString(
          "base64",
        );
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        });
        const tokenResponse = await fetch(
          "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${basic}`,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body,
          },
        );
        const json = (await tokenResponse.json()) as {
          refresh_token?: string;
          error?: string;
        };
        if (!tokenResponse.ok || !json.refresh_token) {
          throw new Error(
            `Token exchange failed: ${json.error ?? tokenResponse.status}`,
          );
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(
          "QuickBooks Sandbox authorized. You can close this tab and return to the terminal.",
        );
        server.close();
        resolve({ refresh_token: json.refresh_token, realmId });
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(error instanceof Error ? error.message : "OAuth failed");
        server.close();
        reject(error);
      }
    });
    server.listen(port, redirect.hostname === "localhost" ? "127.0.0.1" : undefined);
  });

  console.log("");
  console.log("Add these to .env.local (do not commit):");
  console.log(`QBO_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log(`QBO_REALM_ID=${tokens.realmId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
