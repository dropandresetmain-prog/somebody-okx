/**
 * Durable OKX / X Layer infrastructure facts stored on the Objective aggregate.
 * Compact storage shape — product projection humanizes labels via integrations.ts.
 */

export type IntegrationId =
  | "okx_marketplace"
  | "okx_agentic_wallet"
  | "okx_x402"
  | "x_layer_testnet";

export type IntegrationAction =
  | "market_search"
  | "payment_preparing"
  | "payment_verifying"
  | "transaction_submitted"
  | "settlement_confirmed";

export type PersistedIntegrationEvent = {
  id: string;
  objectiveKey: string;
  integrationId: IntegrationId;
  action: IntegrationAction;
  requirementKey?: string | null;
  decisionId?: string | null;
  intentId?: string | null;
  occurredAt: number;
  resourceNeed?: string | null;
  candidateLabels?: string[];
  merchantLabel?: string | null;
  amount?: { amount: string; currency: string } | null;
  networkLabel?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
};

const MAX_LABEL = 200;
const MAX_LIST = 12;
const MAX_TX = 128;

function bound(value: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function boundLabels(labels: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of labels) {
    if (out.length >= MAX_LIST) break;
    const label = bound(raw, MAX_LABEL);
    if (label) out.push(label);
  }
  return out;
}

/** Founder-facing merchant name from controlled Testnet offering titles. */
export function founderMerchantLabelFromOfferingName(name: string): string {
  return bound(name.replace(/\s*\(controlled TESTNET\)\s*$/i, ""), MAX_LABEL);
}

export function integrationEventId(parts: {
  integrationId: IntegrationId;
  action: IntegrationAction;
  objectiveKey: string;
  epochKey: string;
  intentId?: string | null;
}): string {
  const intent = parts.intentId ? `:${parts.intentId}` : "";
  return bound(
    `${parts.integrationId}:${parts.action}:${parts.objectiveKey}:${parts.epochKey}${intent}`,
    240,
  );
}

export function appendIntegrationEvent(
  existing: readonly PersistedIntegrationEvent[] | undefined,
  event: PersistedIntegrationEvent,
): PersistedIntegrationEvent[] {
  const rows = existing ?? [];
  if (rows.some((row) => row.id === event.id)) return [...rows];
  const normalized: PersistedIntegrationEvent = {
    ...event,
    resourceNeed: event.resourceNeed ? bound(event.resourceNeed, MAX_LABEL) : null,
    candidateLabels: event.candidateLabels ? boundLabels(event.candidateLabels) : undefined,
    merchantLabel: event.merchantLabel ? bound(event.merchantLabel, MAX_LABEL) : null,
    networkLabel: event.networkLabel ? bound(event.networkLabel, MAX_LABEL) : null,
    txHash: event.txHash ? bound(event.txHash, MAX_TX) : null,
    explorerUrl: event.explorerUrl ? bound(event.explorerUrl, 512) : null,
    amount:
      event.amount && event.amount.amount && event.amount.currency
        ? {
            amount: bound(event.amount.amount, 64),
            currency: bound(event.amount.currency, 32),
          }
        : null,
  };
  return [...rows, normalized];
}

export function parseSubmittedTxHash(note: string): string | null {
  const match = note.match(/submitted tx (0x[a-fA-F0-9]{4,128})/);
  return match ? match[1] : null;
}
