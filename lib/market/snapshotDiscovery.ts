import type { MarketDiscovery, MarketDiscoveryInput, MarketOffering } from "./discovery";
import { SNAPSHOT_OFFERINGS } from "./snapshotData";
import { VERIFIED_SERVICE_REGISTRY } from "./registryData";
import { resolveCompatibleClasses } from "./registry";

/**
 * Snapshot-based MarketDiscovery implementation.
 *
 * Filters the synchronized snapshot by:
 * 1. Registry-validated compatibleResourceClasses must include the need's resourceClass.
 * 2. taskDescription keywords must appear in name or description (case-insensitive).
 * 3. Capped at limit (default 5, hard cap 10).
 *
 * Explicit fallback / synchronized cache when live OKX CLI discovery is
 * unavailable or returns no registry-compatible offerings.
 * See docs/work/M2_DISCOVERY_FINDINGS.md (corrected 2026-09-18).
 */

const DEFAULT_LIMIT = 5;
const HARD_CAP = 10;

function matchKeywords(
  offering: MarketOffering,
  taskDescription: string,
): boolean {
  const text = `${offering.name} ${offering.description}`.toLowerCase();
  // Extract meaningful words from task description (>= 4 chars to avoid noise)
  const words = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  if (words.length === 0) return true; // no filterable keywords → match all
  // Match if ANY keyword appears in the offering text
  return words.some((w) => text.includes(w));
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

      // Filter by resourceClass + taskDescription keywords
      const filtered = validated.filter((o) => {
        if (!o.compatibleResourceClasses.includes(input.resourceClass)) return false;
        if (!matchKeywords(o, input.taskDescription)) return false;
        return true;
      });

      // Deterministic sort: offeringId lexicographic
      filtered.sort((a, b) =>
        a.offeringId < b.offeringId ? -1 : a.offeringId > b.offeringId ? 1 : 0,
      );

      return filtered.slice(0, limit);
    },
  };
}
