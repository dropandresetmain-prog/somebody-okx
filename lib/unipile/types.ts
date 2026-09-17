import type { Channel, EvidenceProvider, Quote } from "../procurement/types";

export type UnipileProvider = "whatsapp" | "instagram";

export type UnipileBinding = {
  endpointRef: string;
  provider: UnipileProvider;
  accountId: string;
  chatId: string;
  /** Connected account's provider user id — used to filter our own outbound echoes. */
  accountUserId: string;
};

export type UnipileCredentials = {
  apiKey: string;
  /** Host[:port] from Unipile dashboard, e.g. api57.unipile.com:18733 */
  dsn: string;
};

export type UnipileWebhookEvent = {
  event: string;
  account_id: string;
  account_type: string;
  account_info?: {
    user_id?: string;
    type?: string;
  };
  chat_id: string;
  message_id: string;
  message?: string;
  timestamp: string;
  sender?: {
    attendee_id?: string;
    attendee_name?: string;
    attendee_provider_id?: string;
  };
};

export type UnipileSendResult = {
  providerMessageId: string;
  accountId: string;
  chatId: string;
  provider: UnipileProvider;
  text: string;
};

export type UnipileMessageReadBack = {
  providerMessageId: string;
  chatId: string;
  accountId?: string;
  text: string;
};

export type InboundDecision =
  | { action: "ignore_own"; reason: string }
  | { action: "reject"; reason: string }
  | { action: "duplicate"; reason: string }
  | {
      action: "ingest";
      vendorId: string;
      endpointRef: string;
      provider: UnipileProvider;
      channel: Channel;
      observationId: string;
      chatId: string;
      accountId: string;
      observedAt: number;
      revision: number;
      text: string;
      /** May be empty when the supplier message has no extractable quote claims. */
      claims: Partial<Quote>;
      extractionPath?: string;
    };

export const providerChannel: Record<UnipileProvider, Channel> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

export const channelProvider: Record<
  "WhatsApp" | "Instagram",
  UnipileProvider
> = {
  WhatsApp: "whatsapp",
  Instagram: "instagram",
};

export function asEvidenceProvider(
  provider: UnipileProvider,
): Exclude<EvidenceProvider, "fixture" | "web" | "gmail"> {
  return provider;
}
