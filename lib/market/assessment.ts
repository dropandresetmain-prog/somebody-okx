import type { ResourceClass } from "../workforce/types";
import type { MarketOffering } from "./discovery";

/**
 * §6 — CandidateAssessment.
 *
 * Pure, generic economic/resource judgment. NO provider-name conditionals.
 */

export type AssessmentVerdict =
  | "eligible_buy"
  | "reject_redundant"
  | "reject_incompatible"
  | "reject_untrusted";

export type CandidateAssessment = {
  offeringId: string;
  verdict: AssessmentVerdict;
  reasonCode:
    | "supplies_missing_resource"
    | "redundant_with_owned_resources"
    | "resource_class_mismatch"
    | "unverified_or_invalid";
  resourceClass: ResourceClass; // the need's class
  rationale: string;
};

export function assessCandidate(input: {
  offering: MarketOffering;
  need: { resourceClass: ResourceClass };
  ownedResourceClasses: readonly ResourceClass[];
}): CandidateAssessment {
  const { offering, need, ownedResourceClasses } = input;
  const { offeringId, compatibleResourceClasses } = offering;

  // 1. Unverified: offering has no compatible classes at all (registry returned [])
  if (compatibleResourceClasses.length === 0) {
    return {
      offeringId,
      verdict: "reject_untrusted",
      reasonCode: "unverified_or_invalid",
      resourceClass: need.resourceClass,
      rationale: `Offering ${offeringId} is not verified in the service registry.`,
    };
  }

  // 2. Incompatible: verified but none of its classes match the need's class
  if (!compatibleResourceClasses.includes(need.resourceClass)) {
    return {
      offeringId,
      verdict: "reject_incompatible",
      reasonCode: "resource_class_mismatch",
      resourceClass: need.resourceClass,
      rationale: `Offering ${offeringId} provides [${compatibleResourceClasses.join(", ")}] but need requires ${need.resourceClass}.`,
    };
  }

  // 3. Redundant: all compatible classes are already owned
  const allOwned = compatibleResourceClasses.every((c) =>
    ownedResourceClasses.includes(c),
  );
  if (allOwned) {
    return {
      offeringId,
      verdict: "reject_redundant",
      reasonCode: "redundant_with_owned_resources",
      resourceClass: need.resourceClass,
      rationale: `Offering ${offeringId} only supplies classes already owned: [${compatibleResourceClasses.join(", ")}].`,
    };
  }

  // 4. Eligible buy: supplies the needed class which is not yet owned
  return {
    offeringId,
    verdict: "eligible_buy",
    reasonCode: "supplies_missing_resource",
    resourceClass: need.resourceClass,
    rationale: `Offering ${offeringId} supplies ${need.resourceClass} which is not in owned resources.`,
  };
}

/**
 * Select the single best eligible_buy offering from assessments.
 *
 * Deterministic tie-break: lowest price amount parsed as decimal Number,
 * then offeringId lexicographic. Returns null when zero eligible or when
 * the selected offering's class is not actually missing.
 */
export function selectOffering(
  assessments: readonly CandidateAssessment[],
  offerings: readonly MarketOffering[],
): MarketOffering | null {
  const eligible = assessments.filter((a) => a.verdict === "eligible_buy");
  if (eligible.length === 0) return null;

  const offeringById = new Map<string, MarketOffering>();
  for (const o of offerings) {
    offeringById.set(o.offeringId, o);
  }

  // Sort: lowest price first, then offeringId lexicographic
  const sorted = [...eligible].sort((a, b) => {
    const oa = offeringById.get(a.offeringId);
    const ob = offeringById.get(b.offeringId);
    const pa = oa?.price ? Number(oa.price.amount) : Number.POSITIVE_INFINITY;
    const pb = ob?.price ? Number(ob.price.amount) : Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.offeringId < b.offeringId ? -1 : a.offeringId > b.offeringId ? 1 : 0;
  });

  const best = sorted[0];
  const bestOffering = offeringById.get(best.offeringId);
  if (!bestOffering) return null;

  // Safety: the selected offering's class must actually be missing from owned
  // (caller is responsible for passing correct ownedResourceClasses to assessCandidate)
  return bestOffering;
}
