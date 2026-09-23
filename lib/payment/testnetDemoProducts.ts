/**
 * Unrelated controlled Testnet marketplace products (non-executable for
 * external_social_intelligence). They exist so Somebody checks a small market
 * rather than behaving as if only one service exists. They are NOT real OKX
 * merchants; provenance is synthetic_test_provider / controlled Testnet only.
 */

export const TESTNET_TOKEN_MARKET_PROVIDER_ID =
  "somebody_testnet_token_intel" as const;
export const TESTNET_TOKEN_MARKET_SERVICE_ID =
  "token_market_intelligence" as const;
export const TESTNET_TOKEN_MARKET_OFFERING_ID =
  "somebody_testnet_token_intel:token_market_intelligence" as const;

export const TESTNET_WALLET_RISK_PROVIDER_ID =
  "somebody_testnet_onchain_risk" as const;
export const TESTNET_WALLET_RISK_SERVICE_ID =
  "wallet_onchain_risk_intelligence" as const;
export const TESTNET_WALLET_RISK_OFFERING_ID =
  "somebody_testnet_onchain_risk:wallet_onchain_risk_intelligence" as const;

/**
 * Fulfillment scopes deliberately exclude external_social_intelligence so a
 * social-intelligence need cannot purchase these offerings.
 */
export const TESTNET_TOKEN_MARKET_FULFILLMENT_SCOPE = {
  serviceId: TESTNET_TOKEN_MARKET_SERVICE_ID,
  resourceClasses: ["proprietary_data"] as const,
  /** No social-intelligence purpose — crypto market research only. */
  purposeKinds: [] as const,
} as const;

export const TESTNET_WALLET_RISK_FULFILLMENT_SCOPE = {
  serviceId: TESTNET_WALLET_RISK_SERVICE_ID,
  resourceClasses: ["proprietary_data"] as const,
  /** No social-intelligence purpose — onchain risk analysis only. */
  purposeKinds: [] as const,
} as const;
