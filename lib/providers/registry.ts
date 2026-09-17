/**
 * Provider-adapter registry.
 *
 * Generic: maps providerId → adapter. No provider/scenario names in logic;
 * provider-specific adapters are imported from sibling files.
 */

import type { ExternalResourceResult, ProviderAdapter } from "./types";
import { newsliquidAdapter } from "./newsliquid";
import { xbirdAdapter } from "./xbird";

const ADAPTERS: Record<string, ProviderAdapter> = {
  newsliquid: newsliquidAdapter,
  xbird: xbirdAdapter,
};

/**
 * Return the adapter for the given providerId, or null if unknown.
 */
export function getAdapter(providerId: string): ProviderAdapter | null {
  return ADAPTERS[providerId] ?? null;
}

/**
 * Convenience: normalise a raw provider response using the given adapter.
 * The ctx is forwarded to the adapter's normalizeResponse where applicable.
 */
export function normalizeExternalResult(
  adapter: ProviderAdapter,
  raw: unknown,
  ctx?: {
    offeringId?: string;
    serviceId?: string;
    idempotencyKey?: string;
  },
): ExternalResourceResult {
  // The adapter's normalizeResponse may accept a second ctx argument;
  // we call it with raw only (matching the ProviderAdapter interface).
  // Callers that need ctx should use the adapter-specific normalize directly.
  return adapter.normalizeResponse(raw);
}
