import { baseUrl } from "./config";
import type {
  UnipileCredentials,
  UnipileMessageReadBack,
  UnipileSendResult,
  UnipileProvider,
} from "./types";

async function unipileFetch(
  credentials: UnipileCredentials,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${baseUrl(credentials.dsn)}${path}`, {
    ...init,
    headers: {
      "X-API-KEY": credentials.apiKey,
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return response;
}

export async function sendChatMessage(args: {
  credentials: UnipileCredentials;
  provider: UnipileProvider;
  accountId: string;
  chatId: string;
  text: string;
}): Promise<UnipileSendResult> {
  const body = new FormData();
  body.set("text", args.text);
  body.set("account_id", args.accountId);
  const response = await unipileFetch(
    args.credentials,
    `/api/v1/chats/${encodeURIComponent(args.chatId)}/messages`,
    { method: "POST", body },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unipile send failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }
  const json = (await response.json()) as {
    object?: string;
    message_id?: string | null;
  };
  if (!json.message_id)
    throw new Error("Unipile send response missing message_id");
  return {
    providerMessageId: json.message_id,
    accountId: args.accountId,
    chatId: args.chatId,
    provider: args.provider,
    text: args.text,
  };
}

export async function readMessage(args: {
  credentials: UnipileCredentials;
  providerMessageId: string;
}): Promise<UnipileMessageReadBack | null> {
  const response = await unipileFetch(
    args.credentials,
    `/api/v1/messages/${encodeURIComponent(args.providerMessageId)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unipile read-back failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }
  const json = (await response.json()) as {
    id?: string;
    message_id?: string;
    chat_id?: string;
    account_id?: string;
    text?: string;
    body?: string;
    message?: string;
  };
  const providerMessageId = json.message_id || json.id;
  const chatId = json.chat_id;
  const text = (json.text ?? json.body ?? json.message ?? "").trim();
  if (!providerMessageId || !chatId) return null;
  return {
    providerMessageId,
    chatId,
    accountId: json.account_id,
    text,
  };
}
