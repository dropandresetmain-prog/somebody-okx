/**
 * Bounded controlled Testnet marketplace for SOMEBODY_EXECUTION_MODE=testnet_demo.
 *
 * Exactly THREE offerings. Discovery uses the MarketDiscovery contract.
 * Decision recomputation stays deterministic (no live OKX CLI I/O).
 */

import type { MarketDiscovery, MarketDiscoveryInput, MarketOffering } from "./discovery";
import { VERIFIED_SERVICE_REGISTRY } from "./registryData";
import { resolveCompatibleClasses } from "./registry";
import {
  SOCIAL_MEDIA_GURU_OFFERING_ID,
  SOCIAL_MEDIA_GURU_PROVIDER_ID,
  SOCIAL_MEDIA_GURU_SERVICE_ID,
} from "../payment/socialMediaGuruProduct";
import {
  TESTNET_TOKEN_MARKET_OFFERING_ID,
  TESTNET_TOKEN_MARKET_PROVIDER_ID,
  TESTNET_TOKEN_MARKET_SERVICE_ID,
  TESTNET_WALLET_RISK_OFFERING_ID,
  TESTNET_WALLET_RISK_PROVIDER_ID,
  TESTNET_WALLET_RISK_SERVICE_ID,
} from "../payment/testnetDemoProducts";

const TESTNET_DEMO_RETRIEVED_AT = 1_720_000_000_000;

export const TESTNET_DEMO_OFFERING_COUNT = 3 as const;

export const TESTNET_DEMO_OFFERINGS: readonly MarketOffering[] = [
  {
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
    providerId: SOCIAL_MEDIA_GURU_PROVIDER_ID,
    serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
    name: "Social Media Guru (controlled TESTNET)",
    description:
      "Controlled Testnet synthetic social-media intelligence across TikTok, Instagram, Facebook, and X — audience behavior, formats, engagement tendencies, messaging themes, and content recommendations. Explicitly NOT live platform data. Served by the local x402 X Layer TESTNET merchant.",
    price: { amount: "0.01", asset: "USDT", unit: "per_use" },
    source: {
      kind: "controlled_testnet",
      retrievedAt: TESTNET_DEMO_RETRIEVED_AT,
      raw: {
        provenance: "synthetic_test_provider",
        marketplace: "testnet_demo",
        network: "eip155:1952",
      },
    },
    compatibleResourceClasses: [],
  },
  {
    offeringId: TESTNET_TOKEN_MARKET_OFFERING_ID,
    providerId: TESTNET_TOKEN_MARKET_PROVIDER_ID,
    serviceId: TESTNET_TOKEN_MARKET_SERVICE_ID,
    name: "Token Market Intelligence (controlled TESTNET)",
    description:
      "Controlled Testnet crypto/token market research and analytics. Unrelated to social-media marketing intelligence. Not a live OKX merchant; synthetic_test_provider provenance only.",
    price: { amount: "0.02", asset: "USDT", unit: "per_use" },
    source: {
      kind: "controlled_testnet",
      retrievedAt: TESTNET_DEMO_RETRIEVED_AT,
      raw: {
        provenance: "synthetic_test_provider",
        marketplace: "testnet_demo",
        network: "eip155:1952",
      },
    },
    compatibleResourceClasses: [],
  },
  {
    offeringId: TESTNET_WALLET_RISK_OFFERING_ID,
    providerId: TESTNET_WALLET_RISK_PROVIDER_ID,
    serviceId: TESTNET_WALLET_RISK_SERVICE_ID,
    name: "Wallet / Onchain Risk Intelligence (controlled TESTNET)",
    description:
      "Controlled Testnet wallet, token, transaction, and contract risk analysis. Unrelated to social-media marketing intelligence. Not a live OKX merchant; synthetic_test_provider provenance only.",
    price: { amount: "0.015", asset: "USDT", unit: "per_use" },
    source: {
      kind: "controlled_testnet",
      retrievedAt: TESTNET_DEMO_RETRIEVED_AT,
      raw: {
        provenance: "synthetic_test_provider",
        marketplace: "testnet_demo",
        network: "eip155:1952",
      },
    },
    compatibleResourceClasses: [],
  },
];

/**
 * Deterministic MarketDiscovery for the Testnet demo marketplace.
 * Returns registry-validated class-compatible offerings from the fixed set of 3.
 */
export function createTestnetDemoDiscovery(): MarketDiscovery {
  return {
    async discover(input: MarketDiscoveryInput): Promise<MarketOffering[]> {
      const validated = TESTNET_DEMO_OFFERINGS.map((o) => ({
        ...o,
        compatibleResourceClasses: resolveCompatibleClasses(
          o,
          VERIFIED_SERVICE_REGISTRY,
        ),
        source: {
          ...o.source,
          retrievedAt: o.source.retrievedAt,
        },
      }));
      return validated.filter((o) =>
        o.compatibleResourceClasses.includes(input.resourceClass),
      );
    },
  };
}
