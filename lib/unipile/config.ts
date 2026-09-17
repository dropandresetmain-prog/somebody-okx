import type { UnipileBinding, UnipileCredentials, UnipileProvider } from "./types";

function trim(value: string | undefined, name: string) {
  const next = value?.trim() ?? "";
  if (!next) throw new Error(`Missing ${name}`);
  return next;
}

export function parseBindingsJson(raw: string | undefined): UnipileBinding[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("UNIPILE_BINDINGS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed))
    throw new Error("UNIPILE_BINDINGS_JSON must be an array");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object")
      throw new Error(`UNIPILE_BINDINGS_JSON[${index}] must be an object`);
    const row = item as Record<string, unknown>;
    const provider = row.provider;
    if (provider !== "whatsapp" && provider !== "instagram")
      throw new Error(`UNIPILE_BINDINGS_JSON[${index}].provider is invalid`);
    for (const key of [
      "endpointRef",
      "accountId",
      "chatId",
      "accountUserId",
    ] as const) {
      if (typeof row[key] !== "string" || !row[key].trim())
        throw new Error(`UNIPILE_BINDINGS_JSON[${index}].${key} is required`);
    }
    return {
      endpointRef: (row.endpointRef as string).trim(),
      provider: provider as UnipileProvider,
      accountId: (row.accountId as string).trim(),
      chatId: (row.chatId as string).trim(),
      accountUserId: (row.accountUserId as string).trim(),
    };
  });
}

export function loadBindings(
  env: Record<string, string | undefined> = process.env,
): UnipileBinding[] {
  return parseBindingsJson(env.UNIPILE_BINDINGS_JSON);
}

export function loadCredentials(
  env: Record<string, string | undefined> = process.env,
): UnipileCredentials | null {
  const apiKey = env.UNIPILE_API_KEY?.trim();
  const dsn = env.UNIPILE_DSN?.trim();
  if (!apiKey && !dsn) return null;
  if (!apiKey || !dsn)
    throw new Error("UNIPILE_API_KEY and UNIPILE_DSN must both be set");
  return { apiKey, dsn };
}

export function unipileConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  try {
    return Boolean(loadCredentials(env) && loadBindings(env).length);
  } catch {
    return false;
  }
}

export function bindingForEndpoint(
  bindings: UnipileBinding[],
  endpointRef: string,
): UnipileBinding | undefined {
  return bindings.find((b) => b.endpointRef === endpointRef);
}

export function bindingForChat(
  bindings: UnipileBinding[],
  accountId: string,
  chatId: string,
  provider: UnipileProvider,
): UnipileBinding | undefined {
  return bindings.find(
    (b) =>
      b.accountId === accountId &&
      b.chatId === chatId &&
      b.provider === provider,
  );
}

export function requireWebhookSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  return trim(env.UNIPILE_WEBHOOK_SECRET, "UNIPILE_WEBHOOK_SECRET");
}

export function baseUrl(dsn: string): string {
  const host = dsn.trim().replace(/^https?:\/\//i, "");
  return `https://${host}`;
}
