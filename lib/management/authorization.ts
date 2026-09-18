// Deterministic authorization: the ONLY gate between a managerial
// recommendation and an effect on the world.
//
// The LLM recommends; this module rechecks current truth and either authorizes,
// refuses, or routes to founder approval. A recommendation that names an
// option which does not exist, is no longer eligible, belongs to a stale
// contract revision, or would exceed financial bounds is REFUSED — never
// quietly downgraded, never honoured anyway.
//
// Authority rules encoded here (ARCHITECTURE.md §4/§7, locked decisions 14/15):
//   - a model cannot grant itself spend, publication or destructive authority;
//   - external spend requires an approval record unless it is inside a bound
//     the founder explicitly granted for that revision;
//   - a refusal never resolves a requirement (that rule lives in
//     lib/management/requirements.ts and cannot be bypassed from here).

import { evaluateOptionEligibility } from "../sourcing/eligibility";
import type {
  AuthorizationResult,
  EligibilityInput,
  GroundedOption,
  ManagerialRecommendation,
  Requirement,
  SatisfactionStrategy,
} from "./types";

export type ExternalAuthorityMode =
  // M3 buyer rail is not available/accepted: external effects are recorded as
  // intents but never handed off. Truthful resting state, not a failure.
  | "m3_unavailable"
  // M3 accepted and bounded: hand off inside the bound.
  | "m3_available_bounded"
  // No external effects permitted at all this run.
  | "external_disabled";

export type RecheckContext = {
  currentContractRevision: number;
  // Fresh from Convex at authorization time — never carried from graph state.
  optionsById: ReadonlyMap<string, GroundedOption>;
  requirement: Requirement;
  eligibilityFor: (option: GroundedOption) => EligibilityInput;
  at: number;
  decisionId: string;
  // Founder-granted authority for this objective, if any.
  spendAuthorityUsd: number | null;
  externalAuthority: ExternalAuthorityMode;
  // Material ambiguity in the contract still requires founder input.
  unresolvedMaterialAmbiguity: string | null;
  waiverRequested: boolean;
};

export function reauthorizeRecommendation(
  recommendation: ManagerialRecommendation,
  ctx: RecheckContext,
): AuthorizationResult {
  // 1. Stale-truth guard: a recommendation against an older contract revision
  //    cannot authorize against the current one.
  if (recommendation.contractRevision !== ctx.currentContractRevision)
    return {
      kind: "refused",
      requirementKey: recommendation.requirementKey,
      contractRevision: ctx.currentContractRevision,
      reasons: ["unknown"],
      detail: `recommendation is against contract revision ${recommendation.contractRevision}, current revision is ${ctx.currentContractRevision}`,
    };

  // 2. A waiver is never self-granted by the manager.
  if (ctx.waiverRequested)
    return {
      kind: "approval_required",
      requirementKey: recommendation.requirementKey,
      contractRevision: ctx.currentContractRevision,
      question: "Waiving a requirement needs an explicit authorized reason. Approve or refuse?",
      reason: "waiver_requires_authorization",
    };

  // 3. Material ambiguity must be resolved by the founder before acting.
  if (ctx.unresolvedMaterialAmbiguity)
    return {
      kind: "approval_required",
      requirementKey: recommendation.requirementKey,
      contractRevision: ctx.currentContractRevision,
      question: ctx.unresolvedMaterialAmbiguity,
      reason: "material_ambiguity",
    };

  // 4. The selected option must exist in the freshly-grounded set. The model
  //    cannot authorize an option the application never built.
  const option = ctx.optionsById.get(recommendation.selectedOptionId);
  if (!option || option.requirementKey !== recommendation.requirementKey)
    return {
      kind: "refused",
      requirementKey: recommendation.requirementKey,
      contractRevision: ctx.currentContractRevision,
      reasons: ["unknown"],
      detail: `selected option ${recommendation.selectedOptionId} is not a grounded option for this requirement`,
    };

  // 5. Hard eligibility is RE-CHECKED against current truth, not trusted from
  //    the grounding pass (facts and authority may have moved).
  const eligibility = evaluateOptionEligibility(ctx.eligibilityFor(option));
  if (!eligibility.eligible)
    return {
      kind: "refused",
      requirementKey: recommendation.requirementKey,
      contractRevision: ctx.currentContractRevision,
      reasons: eligibility.reasons,
      detail: `option ${option.optionId} failed the authorization recheck: ${eligibility.detail}`,
    };

  // 6. External effects need the financial boundary respected and a live rail.
  if (option.strategy === "BUY" || option.strategy === "HYBRID") {
    const price = option.external?.priceUsd ?? null;
    if (ctx.externalAuthority === "external_disabled")
      return {
        kind: "refused",
        requirementKey: recommendation.requirementKey,
        contractRevision: ctx.currentContractRevision,
        reasons: ["authority_not_granted"],
        detail: "external effects are disabled for this objective",
      };
    if (price !== null && ctx.spendAuthorityUsd !== null && price > ctx.spendAuthorityUsd)
      return {
        kind: "approval_required",
        requirementKey: recommendation.requirementKey,
        contractRevision: ctx.currentContractRevision,
        question: `Acquisition costs $${price}, above the granted bound of $${ctx.spendAuthorityUsd}. Approve the higher amount or choose another option?`,
        reason: "spend_authority_required",
      };
  }

  // 7. WAIT / ASK_FOUNDER / BLOCK never become effects.
  if (option.strategy === "ASK_FOUNDER")
    return {
      kind: "approval_required",
      requirementKey: recommendation.requirementKey,
      contractRevision: ctx.currentContractRevision,
      question: option.facts.scope ?? "Somebody needs a founder decision before continuing.",
      reason: "material_ambiguity",
    };

  return {
    kind: "authorized",
    decisionId: ctx.decisionId,
    requirementKey: recommendation.requirementKey,
    contractRevision: ctx.currentContractRevision,
    strategy: option.strategy,
    optionId: option.optionId,
    authorizedAt: ctx.at,
  };
}

// Whether an authorized intent may actually be handed to the buyer rail. Kept
// separate from authorization so the M4/M3 boundary is one explicit predicate
// rather than a scattered set of checks.
export function mayHandOffExternally(
  strategy: SatisfactionStrategy,
  mode: ExternalAuthorityMode,
): boolean {
  if (strategy !== "BUY" && strategy !== "HYBRID") return false;
  return mode === "m3_available_bounded";
}
