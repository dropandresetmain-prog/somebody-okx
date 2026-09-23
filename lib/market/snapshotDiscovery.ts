import type { MarketDiscovery, MarketDiscoveryInput, MarketOffering } from "./discovery";
import { SNAPSHOT_OFFERINGS } from "./snapshotData";
import { VERIFIED_SERVICE_REGISTRY } from "./registryData";
import { resolveCompatibleClasses } from "./registry";

/**
 * Snapshot-based MarketDiscovery implementation.
 *
 * Filters the synchronized snapshot by:
 * 1. Registry-validated compatibleResourceClasses must include the need's
 *    resourceClass (deterministic hard filter).
 * 2. Keyword overlap may RANK class-compatible candidates; it must NOT be the
 *    sole hard exclusion of an otherwise class-compatible governed offering.
 * 3. Capped at limit (default 5, hard cap 10).
 *
 * Explicit fallback / synchronized cache when live OKX CLI discovery is
 * unavailable or returns no registry-compatible offerings.
 * See docs/work/M2_DISCOVERY_FINDINGS.md (corrected 2026-09-18).
 */

const DEFAULT_LIMIT = 5;
const HARD_CAP = 10;

function keywordScore(offering: MarketOffering, taskDescription: string): number {
  const text = `${offering.name} ${offering.description}`.toLowerCase();
  const words = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  if (words.length === 0) return 0;
  let score = 0;
  for (const w of words) {
    if (text.includes(w)) score += 1;
  }
  return score;
}

export function createSnapshotDiscovery(): MarketDiscovery {
  return {
    async discover(input: MarketDiscoveryInput): Promise<MarketOffering[]> {
      const limit = Math.min(input.limit ?? DEFAULT_LIMIT, HARD_CAP);

      // Attach registry-validated classes to snapshot offerings
      const validated = SNAPSHOT_OFFERINGS.map((o) => ({
        ...o,
        compatibleResourceClasses: resolveCompatibleClasses(o, VERIFIED_SERVICE_REGISTRY),
      }));

      // Hard filter: resource-class compatibility only.
      const classCompatible = validated.filter((o) =>
        o.compatibleResourceClasses.includes(input.resourceClass),
      );

      // Rank by keyword overlap (descriptive preference), then offeringId.
      // Zero overlap remains eligible — Somebody judges semantic suitability.
      classCompatible.sort((a, b) => {
        const scoreDiff =
          keywordScore(b, input.taskDescription) - keywordScore(a, input.taskDescription);
        if (scoreDiff !== 0) return scoreDiff;
        return a.offeringId < b.offeringId ? -1 : a.offeringId > b.offeringId ? 1 : 0;
      });

      return classCompatible.slice(0, limit);
    },
  };
}
