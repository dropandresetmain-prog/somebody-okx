// The CP2 managerial decision protocol — one generic seam, one audit record.
//
// This is the executable shape of the locked loop for a single requirement:
//
//   stage 1  ground candidate options (application-built, governed parts only)
//   stage 2  attach comparable facts + run HARD ELIGIBILITY (deterministic)
//   stage 3  the LLM recommends among ELIGIBLE options only (a callback here;
//            the model call itself lives in the runner, behind the untrusted
//            parsers in proposals.ts)
//   stage 4  deterministic authorization recheck (authorization.ts)
//
// Everything non-model plumbing lives in one place so no caller can accidentally
// skip the recheck. The result is a ManagerialDecision that records what was
// considered, what the model said, and what the application actually authorized.
//
// THE ECONOMIC CHANGE (locked decision 9/10): internal availability makes the
// internal option ELIGIBLE — it never forces MAKE. An unavailable internal
// path is a typed fact (worker_unavailable / no_staffing_possible), never an
// error and never a reason to auto-buy.

import { buildRequirement, unresolvedMaterialAmbiguity } from "./contract";
import { decideStaffing } from "./staffing";
import { parseManagerialRecommendation } from "./proposals";
import { reauthorizeRecommendation } from "./authorization";
import {
  buildExternalOption,
  buildHybridOption,
  buildInternalOption,
  eligibilityInputFor,
  eligibleOptions,
  EMPTY_FACTS,
  optionIdFor,
  withEligibility,
} from "./options";
import type { StaffingRequest } from "./staffing";
import type {
  AuthorizationResult,
  EconomicFacts,
  FactValue,
  GroundedOption,
  IneligibilityReason,
  ManagerialDecision,
  ManagerialRecommendation,
  OutcomeContract,
  Requirement,
  RequirementPriority,
  SatisfactionStrategy,
  WorkerRecord,
} from "./types";
import type { EligibilityFacts } from "./options";
import type { ExternalAuthorityMode, RecheckContext } from "./authorization";

// ── Inputs ───────────────────────────────────────────────────────────────────

export type RegistryOffering = {
  offeringId: string;
  providerId: string;
  serviceId: string;
  resourceClass: string;
  priceUsd: number | null;
  registryVerified: boolean;
  compatibleResourceClass: boolean;
};

export type GroundingContext = {
  // Which of the registry's offerings were actually discovered for this need.
  // Empty array is a valid, meaningful answer ("nothing comparable found").
  discovered: readonly RegistryOffering[];
  // Live facts the application measured for the internal path, keyed by the
  // sorted capability set the staffing decision produced.
  internalFacts: EconomicFacts;
  // Facts attached to each discovered offering (provider quotes, etc.).
  factsForOffering: (offering: RegistryOffering) => EconomicFacts;
};

export type DecisionPassInput = {
  objectiveKey: string;
  contract: OutcomeContract;
  currentContractRevision: number;
  requirementKey: string;
  requirementTitle: string;
  mustBeTrue: string;
  priority: RequirementPriority;
  artifactKeyForInternalProof: string | null;
  staffing: StaffingRequest & { inventory: readonly WorkerRecord[]; creationAllowed: boolean };
  grounding: GroundingContext;
  // Stage-1 facts shared by every option (live Convex reads the caller did).
  eligibilityFacts: EligibilityFacts;
  // Stage-3 recommendation source. Receives ONLY the eligible options; the
  // adapter serialises them for the model and parses the reply through
  // parseManagerialRecommendation. Returning raw unknown output is expected —
  // it is untrusted until parsed + rechecked downstream.
  recommend: (eligible: readonly GroundedOption[]) => Promise<unknown>;
  at: number;
  decisionId: string;
  spendAuthorityUsd: number | null;
  externalAuthority: ExternalAuthorityMode;
  waiverRequested: boolean;
};

export type DecisionPassResult = {
  decision: ManagerialDecision;
  // Non-null only when a strategy was AUTHORIZED and its governed proofs
  // attached. Callers persist this row; anything else leaves the open
  // requirement exactly as it was.
  boundRequirement: Requirement | null;
  options: GroundedOption[]; // all grounded options incl. ineligible, with typed verdicts
  recommendation: ManagerialRecommendation | null;
  authorization: AuthorizationResult;
};

// ── The pass ─────────────────────────────────────────────────────────────────

export async function runManagerialDecisionPass(
  input: DecisionPassInput,
): Promise<DecisionPassResult> {
  const { contract, grounding } = input;
  const stale = input.contract.revision !== input.currentContractRevision;

  // ── Stage 1: ground candidate options ─────────────────────────────────────

  const options: GroundedOption[] = [];
  const notes: string[] = [];

  const staffing = decideStaffing(input.staffing);
  let internalOption: GroundedOption | null = null;
  if (staffing.outcome === "no_staffing_possible") {
    // Typed unavailability — recorded, not thrown. The pass continues with
    // whatever external paths exist; if none, only WAIT/ASK/BLOCK can win.
    notes.push(`internal path unavailable: ${staffing.reason}`);
  } else {
    const internal = buildInternalOption({
      requirementKey: input.requirementKey,
      contractRevision: input.currentContractRevision,
      capabilityKeys: input.staffing.requiredCapabilityKeys,
      responsibility: staffing.reason,
      workerKey: staffing.outcome === "reuse" ? staffing.workerKey : null,
      staffingReason: staffing.reason,
      facts: grounding.internalFacts,
    });
    if (internal.option) internalOption = internal.option;
    else notes.push(`internal option rejected: ungoverned capabilities ${internal.ungovernedKeys.join(", ")}`);
  }
  if (internalOption) options.push(internalOption);

  const externalOptions: GroundedOption[] = [];
  for (const offering of grounding.discovered) {
    const option = buildExternalOption(
      {
        requirementKey: input.requirementKey,
        contractRevision: input.currentContractRevision,
        offeringId: offering.offeringId,
        providerId: offering.providerId,
        serviceId: offering.serviceId,
        resourceClass: offering.resourceClass,
        priceUsd: offering.priceUsd,
        priceProvenance: "provider_quote",
        registryVerified: offering.registryVerified,
        compatibleResourceClass: offering.compatibleResourceClass,
        facts: grounding.factsForOffering(offering),
      },
      "BUY",
    );
    externalOptions.push(option);
    options.push(option);
  }

  // HYBRID: internal half + the single best-priced eligible-shaped external
  // half. Formed deterministically (cheapest quoted offering, tie by id), so a
  // replay rebuilds the same optionId; the model never assembles hybrids.
  if (internalOption && externalOptions.length) {
    const best = [...externalOptions].sort(
      (a, b) =>
        (a.external?.priceUsd ?? Number.MAX_SAFE_INTEGER) -
          (b.external?.priceUsd ?? Number.MAX_SAFE_INTEGER) ||
        a.optionId.localeCompare(b.optionId),
    )[0];
    const combinedFacts: EconomicFacts = {
      ...EMPTY_FACTS,
      ...mergeCostFacts(internalOption.facts, best.facts),
    };
    options.push(
      buildHybridOption({
        requirementKey: input.requirementKey,
        contractRevision: input.currentContractRevision,
        internal: internalOption,
        external: best,
        facts: combinedFacts,
      }),
    );
  }

  // ── Stage 2: comparable facts + hard eligibility ──────────────────────────

  const inputFor = (option: GroundedOption) =>
    eligibilityInputFor(option, {
      ...input.eligibilityFacts,
      // Worker availability is re-read per option from the live inventory, not
      // assumed from grounding time. A CREATE target is availability-neutral.
      workerAvailable: option.internal
        ? option.internal.workerKey === null
          ? true
          : isWorkerFree(input.staffing.inventory, option.internal.workerKey, input.at)
        : null,
      // Proof-first discipline: every option must name an available proof
      // method. Internally the application can always record observations and
      // artifact versions; externally the proof exists only with a concrete,
      // registry-verified quote.
      requiresMandatoryProof: true,
      proofAvailable: proofIsAvailable(option),
    });

  const grounded = withEligibility(options, inputFor);
  const eligible = eligibleOptions(grounded);

  // ── Stage 3: LLM recommendation among ELIGIBLE options only ───────────────

  // Zero eligible options means there is nothing to recommend between. The
  // model is not consulted (budget preserved) and the outcome is a typed
  // refusal the manager can act on — never a silent MAKE fallback.
  if (eligible.length === 0) {
    const reasons = uniqueIneligibilityReasons(grounded);
    return finish(
      input,
      null,
      grounded,
      null,
      {
        kind: "refused",
        requirementKey: input.requirementKey,
        contractRevision: input.currentContractRevision,
        reasons: reasons.length ? reasons : ["unknown"],
        detail: `no grounded option is currently eligible — ${[...notes, ...grounded.flatMap((option) => (option.eligibility.eligible ? [] : [option.eligibility.detail]))].join("; ")}`,
      },
      notes,
    );
  }

  const raw = await recommendSafe(input.recommend, eligible, input.requirementKey, input.currentContractRevision);
  const parsed = parseManagerialRecommendation(raw, {
    requirementKey: input.requirementKey,
    contractRevision: input.currentContractRevision,
    eligibleOptionIds: eligible.map((option) => option.optionId),
  });

  let recommendation: ManagerialRecommendation | null = null;
  let authorization: AuthorizationResult;

  if (!parsed.ok) {
    // A malformed/hallucinated recommendation is NOT a refusal to be ignored:
    // it routes to a typed no-effect outcome. Nothing was authorized, the
    // requirement stays open, the pass is auditable.
    authorization = {
      kind: "refused",
      requirementKey: input.requirementKey,
      contractRevision: input.currentContractRevision,
      reasons: ["unknown"],
      detail: `managerial recommendation rejected: ${parsed.errors.join("; ")}`,
    };
  } else {
    // ── Stage 4: deterministic recheck ──────────────────────────────────────
    recommendation = parsed.value;
    const optionsById = new Map(grounded.map((option) => [option.optionId, option]));
    const ctx: RecheckContext = {
      currentContractRevision: input.currentContractRevision,
      optionsById,
      // Same live-fact builder as stage 2: the recheck sees exactly the
      // eligibility inputs recomputed at authorization time (inventory may
      // have moved between grounding and this call — the function re-reads).
      eligibilityFor: inputFor,
      at: input.at,
      decisionId: input.decisionId,
      spendAuthorityUsd: input.spendAuthorityUsd,
      externalAuthority: input.externalAuthority,
      unresolvedMaterialAmbiguity: stale ? null : unresolvedMaterialAmbiguity(contract),
      waiverRequested: input.waiverRequested,
    };
    if (stale)
      return finish(
        input,
        null,
        grounded,
        recommendation,
        {
          kind: "refused",
          requirementKey: input.requirementKey,
          contractRevision: input.currentContractRevision,
          reasons: ["unknown"],
          detail: `contract revision moved to ${input.currentContractRevision}; grounded options are stale`,
        },
        notes,
      );
    authorization = reauthorizeRecommendation(recommendation, ctx);
  }

  // Bind the AUTHORIZED strategy onto a fresh governed requirement row —
  // proof attachment happens exactly here, keyed by the strategy the
  // application authorized (never one the model named). This records the
  // DECISION; it does not satisfy anything (requirements.ts owns that, and
  // cannot be reached from here).
  let bound: Requirement | null = null;
  if (authorization.kind === "authorized") {
    const built = buildRequirement(
      {
        objectiveKey: input.objectiveKey,
        contract,
        proposed: {
          requirementKey: input.requirementKey,
          priority: input.priority,
          title: input.requirementTitle,
          mustBeTrue: input.mustBeTrue,
          scope: input.mustBeTrue,
        },
        artifactKeyForInternalProof: input.artifactKeyForInternalProof,
        at: input.at,
      },
      authorization.strategy,
    );
    if ("errors" in built) {
      // An authorized strategy whose proof cannot be attached is a contract
      // bug, not a licence to proceed unproofed: typed refusal, no effect.
      return finish(
        input,
        null,
        grounded,
        recommendation,
        {
          kind: "refused",
          requirementKey: input.requirementKey,
          contractRevision: input.currentContractRevision,
          reasons: ["proof_unavailable"],
          detail: `authorized ${authorization.strategy} but proof cannot be attached: ${built.errors.join("; ")}`,
        },
        notes,
      );
    }
    bound = built.requirement;
  }

  return finish(input, bound, grounded, recommendation, authorization, notes);
}

function finish(
  input: DecisionPassInput,
  requirement: Requirement | null,
  options: GroundedOption[],
  recommendation: ManagerialRecommendation | null,
  authorization: AuthorizationResult,
  notes: string[],
): DecisionPassResult {
  const decision: ManagerialDecision = {
    decisionId: input.decisionId,
    objectiveKey: input.objectiveKey,
    contractRevision: input.currentContractRevision,
    requirementKey: input.requirementKey,
    kind: "satisfaction_strategy",
    strategy: authorization.kind === "authorized" ? authorization.strategy : null,
    optionId: authorization.kind === "authorized" ? authorization.optionId : null,
    recommendation,
    authorization,
    coarsePlanSummary:
      [...notes, summarizeAuthorization(authorization)].filter(Boolean).join(" — "),
    consideredOptionIds: options.map((option) => option.optionId),
    at: input.at,
  };
  return { decision, boundRequirement: requirement, options, recommendation, authorization };
}

// The recommendation callback may reject (model outage). An outage is a typed
// refusal with zero effects — never an exception reaching the graph.
async function recommendSafe(
  recommend: (eligible: readonly GroundedOption[]) => Promise<unknown>,
  eligible: readonly GroundedOption[],
  requirementKey: string,
  contractRevision: number,
): Promise<unknown> {
  try {
    return await recommend(eligible);
  } catch (error) {
    return {
      requirementKey,
      contractRevision,
      error: `recommendation source failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function uniqueIneligibilityReasons(options: readonly GroundedOption[]): IneligibilityReason[] {
  const reasons = new Set<IneligibilityReason>();
  for (const option of options)
    if (!option.eligibility.eligible) for (const reason of option.eligibility.reasons) reasons.add(reason);
  return [...reasons].sort();
}

function isWorkerFree(inventory: readonly WorkerRecord[], workerKey: string, now: number): boolean {
  const worker = inventory.find((candidate) => candidate.workerKey === workerKey);
  if (!worker) return false;
  if (worker.lifecycle === "suspended" || worker.lifecycle === "retired") return false;
  return !worker.reservedBy || worker.reservedBy.heldUntil <= now;
}

// The external proof path is only "available" when the offering is a concrete,
// registry-verified quote. Stays a fact — authorizability is stage 4's call.
function proofIsAvailable(option: GroundedOption): boolean {
  if (option.kind === "internal") return true;
  return (
    option.external !== null &&
    option.external.registryVerified &&
    option.external.priceUsd !== null
  );
}

function sumFact(
  a: FactValue<number> | null,
  b: FactValue<number> | null,
): FactValue<number> | null {
  if (a === null && b === null) return null;
  const parts = [a, b].filter((part): part is FactValue<number> => part !== null);
  return {
    value: parts.reduce((total, part) => total + part.value, 0),
    // Mixed provenance collapses to "unknown", never to the stronger class.
    provenance: parts.every((part) => part.provenance === parts[0].provenance)
      ? parts[0].provenance
      : "unknown",
    sourceRef: parts.map((part) => part.sourceRef).filter(Boolean).join("+") || null,
    observedAt: Math.max(...parts.map((part) => part.observedAt ?? 0)) || null,
    confidence: parts.length > 1 ? "low" : parts[0].confidence,
  };
}

// A hybrid's cost facts are derived from BOTH halves so the comparison table
// never shows a hybrid as cheaper than its own parts (anti-wrapper rule).
function mergeCostFacts(internal: EconomicFacts, external: EconomicFacts): Partial<EconomicFacts> {
  return {
    internalCostUsd: sumFact(internal.internalCostUsd, external.internalCostUsd),
    externalPriceUsd: sumFact(internal.externalPriceUsd, external.externalPriceUsd),
    setupMinutes: sumFact(internal.setupMinutes, external.setupMinutes),
    executionMinutes: sumFact(internal.executionMinutes, external.executionMinutes),
  };
}

function summarizeAuthorization(authorization: AuthorizationResult): string {
  if (authorization.kind === "authorized")
    return `authorized ${authorization.strategy} via ${authorization.optionId}`;
  if (authorization.kind === "refused") return `refused: ${authorization.detail}`;
  return `founder approval required: ${authorization.question}`;
}

export { optionIdFor };
