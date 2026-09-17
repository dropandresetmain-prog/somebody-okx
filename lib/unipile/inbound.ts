import {
  normalizeSupplierClaims,
  stripClaimsTrailer,
  type ClaimExtractionContext,
} from "./claims";
import { parseProviderTimestamp, sourceRevision } from "./chronology";
import type {
  InboundDecision,
  UnipileBinding,
  UnipileProvider,
  UnipileWebhookEvent,
} from "./types";
import { providerChannel } from "./types";
import type { Channel, Quote } from "../procurement/types";

export type CorrelatedInbound =
  | { action: "ignore_own"; reason: string }
  | { action: "reject"; reason: string }
  | { action: "duplicate"; reason: string }
  | {
      action: "accepted";
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
    };

export function normalizeAccountType(value: string): UnipileProvider | null {
  const upper = value.trim().toUpperCase();
  if (upper === "WHATSAPP") return "whatsapp";
  if (upper === "INSTAGRAM") return "instagram";
  return null;
}

export function isOwnOutboundMessage(
  event: UnipileWebhookEvent,
  binding: UnipileBinding,
): boolean {
  const senderId = event.sender?.attendee_provider_id?.trim() ?? "";
  const accountUserId =
    event.account_info?.user_id?.trim() || binding.accountUserId;
  if (!senderId || !accountUserId) return false;
  return senderId === accountUserId;
}

/** Fail-closed correlation / own-message / dedupe. Claims are applied afterward. */
export function correlateInbound(args: {
  event: UnipileWebhookEvent;
  bindings: UnipileBinding[];
  resolveVendorId: (endpointRef: string) => string | null;
  alreadySeenMessageId?: (messageId: string) => boolean;
}): CorrelatedInbound {
  const { event, bindings } = args;
  if (event.event && event.event !== "message_received")
    return { action: "reject", reason: `Unsupported Unipile event: ${event.event}` };

  const provider = normalizeAccountType(event.account_type);
  if (!provider)
    return {
      action: "reject",
      reason: `Unsupported account_type: ${event.account_type}`,
    };

  if (!event.account_id?.trim() || !event.chat_id?.trim() || !event.message_id?.trim())
    return { action: "reject", reason: "Webhook missing account/chat/message identity" };

  if (args.alreadySeenMessageId?.(event.message_id))
    return {
      action: "duplicate",
      reason: "Provider message already processed",
    };

  const binding = bindings.find(
    (b) =>
      b.accountId === event.account_id &&
      b.chatId === event.chat_id &&
      b.provider === provider,
  );
  if (!binding)
    return {
      action: "reject",
      reason: "Unknown or unbound Unipile account/chat",
    };

  if (isOwnOutboundMessage(event, binding))
    return {
      action: "ignore_own",
      reason: "Connected account outbound message filtered",
    };

  const vendorId = args.resolveVendorId(binding.endpointRef);
  if (!vendorId)
    return {
      action: "reject",
      reason: "No configured vendor for Unipile binding",
    };

  const text = (event.message ?? "").trim();
  if (!text)
    return { action: "reject", reason: "Empty supplier message" };

  let observedAt: number;
  try {
    observedAt = parseProviderTimestamp(event.timestamp);
  } catch (error) {
    return {
      action: "reject",
      reason: error instanceof Error ? error.message : "Invalid timestamp",
    };
  }

  const display =
    stripClaimsTrailer(text).slice(0, 1500) || text.slice(0, 1500);

  return {
    action: "accepted",
    vendorId,
    endpointRef: binding.endpointRef,
    provider,
    channel: providerChannel[provider],
    observationId: event.message_id,
    chatId: event.chat_id,
    accountId: event.account_id,
    observedAt,
    revision: sourceRevision(observedAt),
    text: display,
  };
}

export function withExtractedClaims(
  accepted: Extract<CorrelatedInbound, { action: "accepted" }>,
  claims: Partial<Quote>,
  extractionPath: string,
): Extract<InboundDecision, { action: "ingest" }> {
  return {
    action: "ingest",
    vendorId: accepted.vendorId,
    endpointRef: accepted.endpointRef,
    provider: accepted.provider,
    channel: accepted.channel,
    observationId: accepted.observationId,
    chatId: accepted.chatId,
    accountId: accepted.accountId,
    observedAt: accepted.observedAt,
    revision: accepted.revision,
    text: accepted.text,
    claims,
    extractionPath,
  };
}

/**
 * Sync inbound decision: correlate, then trailer / natural-language claims.
 * Empty claims are allowed (message preserved for agent visibility).
 */
export function decideInbound(args: {
  event: UnipileWebhookEvent;
  bindings: UnipileBinding[];
  resolveVendorId: (endpointRef: string) => string | null;
  alreadySeenMessageId?: (messageId: string) => boolean;
  extractionContext?: Omit<ClaimExtractionContext, "referenceAt">;
  claims?: Partial<Quote>;
  claimsPath?: string;
}): InboundDecision {
  const correlated = correlateInbound(args);
  if (correlated.action !== "accepted") return correlated;

  if (args.claims !== undefined)
    return withExtractedClaims(
      correlated,
      args.claims,
      args.claimsPath ?? "provided",
    );

  const normalized = normalizeSupplierClaims(args.event.message ?? "", {
    referenceAt: correlated.observedAt,
    deadlineAt: args.extractionContext?.deadlineAt,
    timeZone: args.extractionContext?.timeZone,
  });
  return withExtractedClaims(
    { ...correlated, text: normalized.text },
    normalized.claims,
    normalized.path,
  );
}

export function evidenceFromInbound(
  decision: Extract<InboundDecision, { action: "ingest" }>,
  retrievedAt: number,
) {
  return {
    vendorId: decision.vendorId,
    source: `Unipile ${decision.channel}`,
    authority: "vendor" as const,
    revision: decision.revision,
    observedAt: decision.observedAt,
    text: decision.text,
    claims: decision.claims,
    provenance: {
      provider: decision.provider,
      channel: decision.channel,
      observationId: decision.observationId,
      parentId: decision.chatId,
      observedAt: decision.observedAt,
      retrievedAt,
      sourceLabel: `unipile:${decision.accountId}`,
    },
  };
}
