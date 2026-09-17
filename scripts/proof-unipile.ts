/**
 * Isolated Unipile connectivity check (read-only by default).
 * Does not send messages unless UNIPILE_PROOF_SEND=true and bindings exist.
 * Never prints secrets.
 */
import {
  loadBindings,
  loadCredentials,
  sendChatMessage,
  readMessage,
} from "../lib/unipile";

async function listAccounts(dsn: string, apiKey: string) {
  const host = dsn.replace(/^https?:\/\//i, "");
  const response = await fetch(`https://${host}/api/v1/accounts`, {
    headers: { "X-API-KEY": apiKey, accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`accounts list failed: ${response.status}`);
  const json = (await response.json()) as {
    items?: Array<{ id?: string; type?: string; name?: string }>;
  };
  return (json.items ?? []).map((item) => ({
    id: item.id ? `${item.id.slice(0, 6)}…` : "?",
    type: item.type ?? "unknown",
    name: item.name ?? "",
  }));
}

async function main() {
  const credentials = loadCredentials(process.env);
  if (!credentials) {
    console.log(JSON.stringify({ result: "SKIP", reason: "no credentials" }));
    return;
  }
  const accounts = await listAccounts(credentials.dsn, credentials.apiKey);
  const bindings = loadBindings(process.env);
  const result: Record<string, unknown> = {
    result: "PASS",
    dsnHost: credentials.dsn.split(":")[0],
    accounts,
    bindingsConfigured: bindings.map((b) => ({
      provider: b.provider,
      endpointRef: b.endpointRef,
      accountIdPrefix: `${b.accountId.slice(0, 6)}…`,
      chatIdPrefix: `${b.chatId.slice(0, 6)}…`,
    })),
  };

  if (process.env.UNIPILE_PROOF_SEND === "true" && bindings[0]) {
    const binding = bindings[0]!;
    const text = `Somebody Unipile proof ${Date.now()} (safe isolated check)`;
    const sent = await sendChatMessage({
      credentials,
      provider: binding.provider,
      accountId: binding.accountId,
      chatId: binding.chatId,
      text,
    });
    const observed = await readMessage({
      credentials,
      providerMessageId: sent.providerMessageId,
    });
    result.send = {
      provider: binding.provider,
      messageIdPrefix: `${sent.providerMessageId.slice(0, 8)}…`,
      readBackMatched:
        observed?.providerMessageId === sent.providerMessageId &&
        observed.text.trim() === text.trim(),
    };
  } else {
    result.send = "skipped (set UNIPILE_PROOF_SEND=true with bindings to send)";
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      result: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
