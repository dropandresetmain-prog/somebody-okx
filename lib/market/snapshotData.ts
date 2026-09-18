import type { MarketOffering } from "./discovery";

/**
 * Synchronized snapshot of demo offerings from the canonical provider set.
 *
 * Provider/scenario strings are allowed in this data file per §0 rule 2.
 * Synchronized fallback / cache of demo offerings. Live discovery prefers the
 * official onchainos CLI; this snapshot is used only with explicit provenance
 * (see M2_DISCOVERY_FINDINGS.md, corrected 2026-09-18).
 */

const SNAPSHOT_RETRIEVED_AT = 1726617600000; // 2024-09-18T00:00:00Z (fixed for determinism)

export const SNAPSHOT_OFFERINGS: readonly MarketOffering[] = [
  {
    offeringId: "2135:newsliquid_twitter_search",
    providerId: "2135",
    serviceId: "newsliquid_twitter_search",
    name: "OpenNews Twitter Search",
    description:
      "Keyword/topic/user/engagement/date/language filtered search over Newsliquid's proprietary social intelligence dataset. Returns structured social evidence from platform-derived data not reproducible from public web alone.",
    price: { amount: "0.002", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: SNAPSHOT_RETRIEVED_AT },
    compatibleResourceClasses: [], // filled by registry validation
  },
  {
    offeringId: "3460:xbird_twitter_x_api",
    providerId: "3460",
    serviceId: "xbird_twitter_x_api",
    name: "Twitter X API",
    description:
      "Machine execution interface for X/Twitter — read, bookmark, list, user, media service families. BYOA model where user supplies own X session credentials. Provides bounded external execution infrastructure for social publishing and retrieval.",
    price: { amount: "0.0025", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: SNAPSHOT_RETRIEVED_AT },
    compatibleResourceClasses: [],
  },
  {
    offeringId: "4442:flybeacon_project_growth_analysis",
    providerId: "4442",
    serviceId: "flybeacon_project_growth_analysis",
    name: "Project Growth Analysis",
    description:
      "Generic project/growth analysis covering positioning, competitor tone, channel planning. Substantially overlaps resources the company already controls through internal model reasoning, public web, and company context.",
    price: { amount: "1", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: SNAPSHOT_RETRIEVED_AT },
    compatibleResourceClasses: [],
  },
  {
    offeringId: "4442:flybeacon_x_narrative_pulse",
    providerId: "4442",
    serviceId: "flybeacon_x_narrative_pulse",
    name: "X Narrative Pulse",
    description:
      "Live-X evidence service providing current X/Twitter narrative data. Supplies live external social evidence rather than generic reasoning. Fallback for proprietary_data need when primary social intelligence provider is unavailable.",
    price: { amount: "0.5", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: SNAPSHOT_RETRIEVED_AT },
    compatibleResourceClasses: [],
  },
];
