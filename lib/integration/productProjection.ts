import type { IntegrationIdentity } from "../../app/product/contracts";
import type { ProductIntegrationEvent } from "../product/frontendProjection";
import type { IntegrationAction, IntegrationId, PersistedIntegrationEvent } from "./persistedEvents";

const HEADLINES: Record<IntegrationId, Partial<Record<IntegrationAction, string>>> = {
  okx_marketplace: { market_search: "Searched for external services" },
  okx_agentic_wallet: { payment_preparing: "Preparing x402 payment" },
  okx_x402: { payment_verifying: "Verifying x402 payment" },
  x_layer_testnet: {
    transaction_submitted: "Transaction submitted",
    settlement_confirmed: "Settlement confirmed",
  },
};

export function integrationIdentityFor(id: IntegrationId): IntegrationIdentity {
  switch (id) {
    case "okx_marketplace":
      return { id: "okx_marketplace", label: "OKX Marketplace", logoKey: "okx" };
    case "okx_agentic_wallet":
      return { id: "okx_agentic_wallet", label: "OKX Agentic Wallet", logoKey: "okx" };
    case "okx_x402":
      return { id: "okx_x402", label: "OKX x402", logoKey: "okx" };
    case "x_layer_testnet":
      return { id: "x_layer_testnet", label: "X Layer Testnet", logoKey: "x_layer" };
  }
}

export function toProductIntegrationEvent(
  row: PersistedIntegrationEvent,
): ProductIntegrationEvent | null {
  if (!row.id || !row.integrationId || !row.action) return null;
  const headline = HEADLINES[row.integrationId]?.[row.action];
  if (!headline) return null;
  const candidates =
    row.candidateLabels && row.candidateLabels.length > 0
      ? row.candidateLabels.map((label) => ({ label }))
      : undefined;
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    integration: integrationIdentityFor(row.integrationId),
    action: row.action,
    headline,
    ...(row.resourceNeed ? { resourceNeed: row.resourceNeed } : {}),
    ...(candidates ? { candidateCount: candidates.length, candidates } : {}),
    ...(row.merchantLabel ? { merchantLabel: row.merchantLabel } : {}),
    ...(row.amount ? { amount: row.amount } : {}),
    ...(row.networkLabel ? { networkLabel: row.networkLabel } : {}),
    ...(row.txHash ? { txHash: row.txHash } : {}),
    ...(row.explorerUrl ? { explorerUrl: row.explorerUrl } : {}),
    importance: "standard",
  };
}

export function normalizeIntegrationEventsForProduct(
  rows: unknown,
): ProductIntegrationEvent[] {
  if (!Array.isArray(rows)) return [];
  const out: ProductIntegrationEvent[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as PersistedIntegrationEvent;
    const projected = toProductIntegrationEvent(row);
    if (projected) out.push(projected);
  }
  return out;
}
