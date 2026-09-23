import type { ResourceClass } from "../workforce/types";

/**
 * §5 — Verified service registry DATA.
 *
 * Small application-owned mapping of stable serviceId → ResourceClass[].
 * This is DATA, not sourcing logic. Provider identities live ONLY here +
 * adapter data files (snapshotData.ts, okxDiscovery.ts).
 */

export type RegistryEntry = {
  serviceId: string; // matches MarketOffering.serviceId
  providerId: string;
  resourceClasses: ResourceClass[];
  verified: boolean;
  notes?: string;
};

export const VERIFIED_SERVICE_REGISTRY: readonly RegistryEntry[] = [
  {
    serviceId: "newsliquid_twitter_search",
    providerId: "2135",
    resourceClasses: ["proprietary_data"],
    verified: true,
    notes:
      "Privileged social intelligence — platform-derived social dataset the company cannot reproduce internally.",
  },
  {
    serviceId: "xbird_twitter_x_api",
    providerId: "3460",
    resourceClasses: ["privileged_access"],
    verified: true,
    notes:
      "External social execution infrastructure — machine execution interface for X that the company does not maintain.",
  },
  {
    serviceId: "flybeacon_project_growth_analysis",
    providerId: "4442",
    resourceClasses: ["llm_reasoning", "public_web", "company_records"],
    verified: true,
    notes:
      "Generic project/growth analysis — substantially overlaps resources the company already controls internally.",
  },
  {
    serviceId: "flybeacon_x_narrative_pulse",
    providerId: "4442",
    resourceClasses: ["proprietary_data"],
    verified: true,
    notes:
      "Live-X evidence fallback — provides live external X data rather than generic reasoning.",
  },
  {
    serviceId: "founder_narrative_pulse",
    providerId: "somebody_controlled_test",
    resourceClasses: ["proprietary_data"],
    verified: true,
    notes:
      "Controlled X Layer TESTNET merchant product — qualitative synthetic founder-messaging research only (not live Twitter/NewsLiquid/conversion data).",
  },
  {
    serviceId: "social_media_guru",
    providerId: "somebody_testnet_social",
    resourceClasses: ["proprietary_data"],
    verified: true,
    notes:
      "Controlled X Layer TESTNET Social Media Guru — synthetic multi-platform social-intelligence dataset (NOT live TikTok/Instagram/Facebook/X).",
  },
  {
    serviceId: "token_market_intelligence",
    providerId: "somebody_testnet_token_intel",
    resourceClasses: ["proprietary_data"],
    verified: true,
    notes:
      "Controlled TESTNET token/market research offering — unrelated to social-media intelligence; marketplace distractor for Testnet demo.",
  },
  {
    serviceId: "wallet_onchain_risk_intelligence",
    providerId: "somebody_testnet_onchain_risk",
    resourceClasses: ["proprietary_data"],
    verified: true,
    notes:
      "Controlled TESTNET wallet/onchain risk offering — unrelated to social-media intelligence; marketplace distractor for Testnet demo.",
  },
];
