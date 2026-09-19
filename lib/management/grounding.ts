// Production grounding adapter — wires the existing registry + discovery seam
// into the GroundingContext shape runManagerialDecisionPass already accepts.
//
// This is a PURE, deterministic adapter. No network, no date/time reads, no
// node: builtins, no scenario branching. Registry ids are DATA flowing through;
// the module never branches on a specific provider, service or brand.
//
// R3 I3: the previous production grounding was empty, so a genuine BUY was
// unreachable and a hardcoded $1 was treated as economic truth. This adapter
// makes wiring a one-line call: pass registry data + discovered offerings +
// the need's resource class, and receive a GroundingContext the decision pass
// already consumes. Every field is either mapped from a real registry/quote
// fact with its honest provenance class, or left null (UNKNOWN) — never
// invented, never upgraded.

import { resolveCompatibleClasses } from "../market/registry";
import type { RegistryEntry } from "../market/registryData";
import type { MarketOffering } from "../market/discovery";
import { requireCapability, isControlledCapabilityKey } from "../workforce/catalog";
import type { ResourceClass } from "../workforce/types";
import {
  EMPTY_FACTS,
  factValue,
} from "./options";
import type { GroundingContext, RegistryOffering } from "./decision";
import type { EconomicFacts, FactProvenance } from "./types";

// ── Input ────────────────────────────────────────────────────────────────────

export type GroundRegistryOfferingsInput = {
  // The verified service registry (application-owned DATA).
  registry: readonly RegistryEntry[];
  // Offerings actually discovered for this need (from discovery/snapshot).
  // Empty array is valid: "nothing comparable found".
  discovered: readonly MarketOffering[];
  // The resource class the requirement needs.
  requiredResourceClass: ResourceClass;
  // Observation timestamp passed in (no Date.now() reads).
  at: number;
};

export type GroundRegistryOfferingsResult = {
  offerings: RegistryOffering[];
  factsForOffering: (offering: RegistryOffering) => EconomicFacts;
};

// ── The adapter ──────────────────────────────────────────────────────────────

export function groundRegistryOfferings(
  input: GroundRegistryOfferingsInput,
): GroundRegistryOfferingsResult {
  const { registry, discovered, requiredResourceClass, at } = input;

  const offerings: RegistryOffering[] = [];
  // Pre-compute facts keyed by offeringId so factsForOffering is O(1).
  const factsByOfferingId = new Map<string, EconomicFacts>();

  for (const offering of discovered) {
    // Registry lookup: the offering's serviceId in the verified registry.
    const registryEntry = registry.find((e) => e.serviceId === offering.serviceId);
    const registryVerified = !!(registryEntry && registryEntry.verified);

    // Compatible resource classes from the registry (exact-match predicate).
    const compatibleClasses = registryEntry
      ? resolveCompatibleClasses(offering, registry)
      : [];
    const compatibleResourceClass = compatibleClasses.includes(requiredResourceClass);

    // The single resource class this offering supplies for the need. When the
    // registry declares multiple classes we pick the one matching the need;
    // otherwise the first declared class (the offering's primary identity).
    const resourceClass = compatibleClasses.includes(requiredResourceClass)
      ? requiredResourceClass
      : compatibleClasses.length > 0
        ? compatibleClasses[0]
        : "";

    // Price: from the offering's quote, parsed as a number. Null when absent.
    // Provenance is "provider_quote" (the offering's source returned it) or
    // null when no price exists.
    let priceUsd: number | null = null;
    let priceProvenance: FactProvenance = "unknown";
    if (offering.price) {
      const parsed = parseDecimalAmount(offering.price.amount);
      if (parsed !== null) {
        priceUsd = parsed;
        priceProvenance = "provider_quote";
      }
    }

    const registryOffering: RegistryOffering = {
      offeringId: offering.offeringId,
      providerId: offering.providerId,
      serviceId: offering.serviceId,
      resourceClass,
      priceUsd,
      registryVerified,
      compatibleResourceClass,
    };
    offerings.push(registryOffering);

    // ── Facts for this offering ────────────────────────────────────────────
    //
    // Only facts the registry/quote data genuinely carries are populated.
    // Everything else stays null (UNKNOWN). Provenance classes are never
    // collapsed or upgraded.
    const facts: EconomicFacts = {
      ...EMPTY_FACTS,
      // Scope: what this offering is for (the need's resource class).
      scope: `external:${resourceClass}`,
      // Price: the only economic fact the registry/quote path carries.
      externalPriceUsd: priceUsd !== null
        ? factValue<number>(priceUsd, priceProvenance, "high", `offering:${offering.offeringId}`, at)
        : null,
      // ── Everything else is null (UNKNOWN) ──────────────────────────────
      // The registry data does NOT carry: expectedQuality, setupMinutes,
      // queueMinutes, executionMinutes, verificationMinutes, reliability,
      // availability, reuseValue, externalAdvantage, internalCostUsd.
      // These stay null — never invented, never defaulted.
    };
    factsByOfferingId.set(offering.offeringId, facts);
  }

  return {
    offerings,
    factsForOffering: (offering: RegistryOffering): EconomicFacts => {
      return factsByOfferingId.get(offering.offeringId) ?? { ...EMPTY_FACTS };
    },
  };
}

// ── Resource-class derivation ────────────────────────────────────────────────
//
// Pure functions so the hardcoded arrays at convex/management.ts (the
// eligibilityFacts block) can become data. These read the catalog and the
// passed-in inventory — no constants, no scenario branching.

// (a) The resource classes required by a set of governed capability keys.
// Ungoverned keys are silently skipped (the caller's responsibility to
// validate before grounding). Returns a sorted, deduplicated array.
export function requiredResourceClassesFor(
  capabilityKeys: readonly string[],
): ResourceClass[] {
  const classes = new Set<ResourceClass>();
  for (const key of capabilityKeys) {
    if (!isControlledCapabilityKey(key)) continue;
    const spec = requireCapability(key);
    for (const resource of spec.requiredResources) {
      classes.add(resource);
    }
  }
  return [...classes].sort();
}

// (b) The resource classes the company actually controls right now, from a
// passed-in inventory. The inventory is the application's observed truth
// about NOW — catalog membership is not ownership.
export function controlledResourceClassesFor(
  inventory: readonly ResourceClass[],
): ResourceClass[] {
  return [...new Set(inventory)].sort();
}

// ── Build a full GroundingContext ────────────────────────────────────────────
//
// Convenience wrapper that produces the exact shape runManagerialDecisionPass
// expects. The caller supplies internalFacts separately (they come from the
// live Convex inventory, not from the registry).
export function buildGroundingContext(
  input: GroundRegistryOfferingsInput & {
    internalFacts: EconomicFacts;
  },
): GroundingContext {
  const { offerings, factsForOffering } = groundRegistryOfferings(input);
  return {
    discovered: offerings,
    internalFacts: input.internalFacts,
    factsForOffering,
  };
}

// ── Internals ────────────────────────────────────────────────────────────────

// Parse a decimal string amount to a number. Returns null for unparseable
// values (NaN, Infinity, empty). Never throws.
function parseDecimalAmount(amount: string): number | null {
  if (!amount || !amount.trim()) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return n;
}
