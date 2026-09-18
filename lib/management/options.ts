// Grounded option construction.
//
// The LLM may propose SEMANTIC strategies; this module is the only thing that
// can produce an option the engine is allowed to execute. Every field is
// either a governed fact, an application-computed value, or a clearly-labelled
// estimate. optionId is a deterministic hash of the semantic identity, so a
// replayed wake rebuilds the same option set with the same ids and cannot
// authorize a phantom option or mint a duplicate effect identity.

import { createHash } from "node:crypto";
import { requireCapability, isControlledCapabilityKey } from "../workforce/catalog";
import { toolPermissionsForCapabilities } from "../workforce/permissions";
import { evaluateOptionEligibility } from "../sourcing/eligibility";
import type { CapabilityKey } from "../workforce/types";
import type {
  EconomicFacts,
  EligibilityInput,
  FactProvenance,
  FactValue,
  GroundedOption,
  Requirement,
  SatisfactionStrategy,
} from "./types";

export const EMPTY_FACTS: EconomicFacts = {
  scope: null,
  expectedQuality: null,
  setupMinutes: null,
  queueMinutes: null,
  executionMinutes: null,
  verificationMinutes: null,
  internalCostUsd: null,
  externalPriceUsd: null,
  reliability: null,
  availability: null,
  reuseValue: null,
  externalAdvantage: null,
};

export function factValue<T>(
  value: T,
  provenance: FactProvenance,
  confidence: FactValue<T>["confidence"],
  sourceRef: string | null = null,
  observedAt: number | null = null,
): FactValue<T> {
  return { value, provenance, sourceRef, observedAt, confidence };
}

export function optionIdFor(input: {
  requirementKey: string;
  contractRevision: number;
  kind: GroundedOption["kind"];
  target: string;
}): string {
  const payload = [
    input.requirementKey,
    String(input.contractRevision),
    input.kind,
    input.target,
  ].join("\u0000");
  return `opt_${createHash("sha256").update(payload).digest("hex").slice(0, 24)}`;
}

export type InternalOptionSeed = {
  requirementKey: string;
  contractRevision: number;
  capabilityKeys: readonly string[];
  responsibility: string;
  workerKey: string | null;
  staffingReason: string | null;
  facts: EconomicFacts;
};

export type ExternalOptionSeed = {
  requirementKey: string;
  contractRevision: number;
  offeringId: string;
  providerId: string;
  serviceId: string;
  resourceClass: string;
  priceUsd: number | null;
  priceProvenance: FactProvenance;
  registryVerified: boolean;
  compatibleResourceClass: boolean;
  facts: EconomicFacts;
};

// Internal option. Capabilities are validated fail-closed here: an ungoverned
// key cannot be part of an option at all, so the model cannot reach execution
// through a capability name it invented.
export function buildInternalOption(
  seed: InternalOptionSeed,
  strategy: SatisfactionStrategy = "MAKE",
): { option: GroundedOption | null; ungovernedKeys: string[] } {
  const accepted: CapabilityKey[] = [];
  const rejected: string[] = [];
  for (const key of seed.capabilityKeys) {
    if (isControlledCapabilityKey(key)) accepted.push(requireCapability(key).key);
    else rejected.push(key);
  }
  if (!accepted.length)
    return { option: null, ungovernedKeys: rejected.length ? rejected : ["(none proposed)"] };

  const keys = [...new Set(accepted)].sort();
  const primitives = [...toolPermissionsForCapabilities(keys)].sort();
  const requiredResources = [...new Set(keys.flatMap((key) => [...requireCapability(key).requiredResources]))].sort();
  const target = `internal:${keys.join("+")}:${seed.workerKey ?? "new"}`;
  const option: GroundedOption = {
    optionId: optionIdFor({
      requirementKey: seed.requirementKey,
      contractRevision: seed.contractRevision,
      kind: strategy === "HYBRID" ? "hybrid" : "internal",
      target,
    }),
    requirementKey: seed.requirementKey,
    contractRevision: seed.contractRevision,
    kind: strategy === "HYBRID" ? "hybrid" : "internal",
    strategy,
    internal: {
      capabilityKeys: keys,
      responsibility: seed.responsibility,
      workerKey: seed.workerKey,
      staffingReason: seed.staffingReason,
      primitives,
    },
    external: null,
    facts: seed.facts,
    eligibility: { eligible: false, reasons: ["unknown"], detail: "not yet evaluated" },
  };
  // Eligibility is NOT evaluated here: it depends on live inventory, deadline
  // and financial bounds, which the caller reads fresh from Convex and passes
  // to withEligibility(). A pre-baked verdict would go stale immediately.
  void requiredResources;
  return { option, ungovernedKeys: rejected };
}

// External option: only ever built from a registry-validated offering, and the
// exact resource class must match what the requirement needs.
export function buildExternalOption(
  seed: ExternalOptionSeed,
  strategy: SatisfactionStrategy = "BUY",
): GroundedOption {
  const target = `external:${seed.offeringId}`;
  return {
    optionId: optionIdFor({
      requirementKey: seed.requirementKey,
      contractRevision: seed.contractRevision,
      kind: "external",
      target,
    }),
    requirementKey: seed.requirementKey,
    contractRevision: seed.contractRevision,
    kind: "external",
    strategy,
    internal: null,
    external: {
      offeringId: seed.offeringId,
      providerId: seed.providerId,
      serviceId: seed.serviceId,
      resourceClass: seed.resourceClass,
      priceUsd: seed.priceUsd,
      priceSource: seed.priceProvenance,
    },
    facts: seed.facts,
    eligibility: { eligible: false, reasons: ["unknown"], detail: "not yet evaluated" },
  };
}

// The half-completed internal half of a HYBRID keeps its own id so the audit
// trail can show which two options were combined.
export function buildHybridOption(input: {
  requirementKey: string;
  contractRevision: number;
  internal: GroundedOption;
  external: GroundedOption;
  facts: EconomicFacts;
}): GroundedOption {
  const target = `hybrid:${input.internal.optionId}+${input.external.optionId}`;
  return {
    optionId: optionIdFor({
      requirementKey: input.requirementKey,
      contractRevision: input.contractRevision,
      kind: "hybrid",
      target,
    }),
    requirementKey: input.requirementKey,
    contractRevision: input.contractRevision,
    kind: "hybrid",
    strategy: "HYBRID",
    internal: input.internal.internal ? { ...input.internal.internal } : null,
    external: input.external.external ? { ...input.external.external } : null,
    facts: input.facts,
    eligibility: { eligible: false, reasons: ["unknown"], detail: "not yet evaluated" },
  };
}

export type EligibilityFacts = Omit<
  EligibilityInput,
  "requirementKey" | "contractRevision" | "kind" | "requiredPrimitives"
>;

export function eligibilityInputFor(
  option: GroundedOption,
  facts: EligibilityFacts,
): EligibilityInput {
  // An external option executes through the application's intent seam, so it
  // asserts no composable worker primitives; internal/hybrid assert their own.
  const primitives = option.internal?.primitives ?? [];
  return {
    requirementKey: option.requirementKey,
    contractRevision: option.contractRevision,
    kind: option.kind,
    requiredPrimitives: primitives,
    ...facts,
  };
}

// Apply stage-1 eligibility to a freshly grounded set. Non-eligible options are
// KEPT in the set with their typed reasons (so the read model can truthfully
// show what was considered and why it was not executable), but a downstream
// authorization can only select an eligible one.
export function withEligibility(
  options: readonly GroundedOption[],
  inputFor: (option: GroundedOption) => EligibilityInput,
): GroundedOption[] {
  return options.map((option) => ({ ...option, eligibility: evaluateOptionEligibility(inputFor(option)) }));
}

export function eligibleOptions(options: readonly GroundedOption[]): GroundedOption[] {
  return options.filter((option) => option.eligibility.eligible);
}

// A requirement's declared proofs determine whether a mandatory proof method is
// available right now and whether the option must carry an external result.
export function requirementNeedsExternalProof(requirement: Requirement): boolean {
  return requirement.proofs.some(
    (proof) =>
      proof.proofKind === "verified_external_result" ||
      proof.proofKind === "verified_external_effect",
  );
}
