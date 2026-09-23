/**
 * Controlled TESTNET merchant adapter for founder_narrative_pulse.
 *
 * Offline normalization only — no network, no credentials, no LLM invention.
 */

import type { MarketOffering } from "../market/discovery";
import type { ResourceNeed } from "../objective/resourceNeed";
import type { ProviderAdapter } from "./types";
import {
  buildM3FounderNarrativeRequest,
  M3_PRODUCT_PROVIDER_ID,
  normalizeM3FounderNarrativeResult,
} from "../payment/m3FounderNarrativeProduct";

export const controlledTestMerchantAdapter: ProviderAdapter = {
  providerId: M3_PRODUCT_PROVIDER_ID,
  requestShape(input: { offering: MarketOffering; need: ResourceNeed }) {
    return buildM3FounderNarrativeRequest(input);
  },
  normalizeResponse(raw: unknown) {
    return normalizeM3FounderNarrativeResult(raw);
  },
  verificationStrategy:
    "Protected result must carry provenance synthetic_test_provider, productId " +
    "founder_narrative_pulse, resourceClass proprietary_data, an explicit limitation " +
    "denying live Twitter/NewsLiquid/conversion claims, and non-empty qualitative findings. " +
    "Payment settlement is verified independently on X Layer Testnet; this adapter only " +
    "normalizes the paid product payload.",
};
