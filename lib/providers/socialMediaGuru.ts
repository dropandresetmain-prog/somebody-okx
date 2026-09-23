/**
 * Controlled TESTNET merchant adapter for Social Media Guru.
 *
 * Offline normalization only — no network, no credentials, no LLM invention.
 */

import type { MarketOffering } from "../market/discovery";
import type { ResourceNeed } from "../objective/resourceNeed";
import type { ProviderAdapter } from "./types";
import {
  buildSocialMediaGuruRequest,
  normalizeSocialMediaGuruResult,
  SOCIAL_MEDIA_GURU_PROVIDER_ID,
} from "../payment/socialMediaGuruProduct";

export const socialMediaGuruAdapter: ProviderAdapter = {
  providerId: SOCIAL_MEDIA_GURU_PROVIDER_ID,
  requestShape(input: { offering: MarketOffering; need: ResourceNeed }) {
    return buildSocialMediaGuruRequest(input);
  },
  normalizeResponse(raw: unknown) {
    return normalizeSocialMediaGuruResult(raw);
  },
  verificationStrategy:
    "Protected result must carry provenance synthetic_test_provider, productId " +
    "social_media_guru, resourceClass proprietary_data, an explicit limitation " +
    "denying live TikTok/Instagram/Facebook/X/NewsLiquid claims, and the bounded " +
    "synthetic social-intelligence dataset. Payment settlement is verified " +
    "independently on X Layer Testnet; this adapter only normalizes the paid product payload.",
};
