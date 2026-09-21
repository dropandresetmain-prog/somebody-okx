// M4 SHARED CONTRACT — Somebody Management Protocol v1 domain types.
//
// FROZEN. This file is the single vocabulary source for the management engine.
// Lanes may import from here; they must NOT redefine these shapes. Architecture
// authority boundaries (ARCHITECTURE.md §2) are encoded here:
//
//   Convex   = authoritative business state (everything in this file).
//   LangGraph = continuation position only (GraphState below — ids/cursors).
//   @openai/agents = bounded That Guy execution (lib/worker/** unchanged).
//   M3       = financial implementation authority (execution seam below).
//
// Invariants encoded by these types:
//   run stopped ≠ assignment complete ≠ requirement satisfied ≠ objective complete
//   model proposes; deterministic application code authorizes
//   an estimate is an estimate; a quote is a quote; a measurement is a measurement

// ── Governed vocabulary (re-exported, never re-declared) ─────────────────────

export type {
  CapabilityKey,
  ResourceClass,
  ToolPermissionId,
  WorkerSpec,
} from "../workforce/types";

// ── Control state ────────────────────────────────────────────────────────────

// Objective control states (ARCHITECTURE.md §14). Accepted M1/M2 rows use the
// M2 subset; every new state is additive so historical rows keep loading.
export type ManagementState =
  // M1/M2 states (unchanged meaning, historical rows preserved)
  | "received"
  | "planning"
  | "ready_to_execute"
  | "executing"
  | "waiting_for_resource"
  | "completed"
  | "failed"
  // M4 additions
  | "waiting" // quiescent: waiting on time/schedule/external fact
  | "approval_required" // quiescent: material ambiguity or spend authority
  | "blocked" // no executable path currently exists
  | "escalated" // founder attention required, engine stopped acting
  | "recovery_required"; // limit hit or inconsistent state; needs intervention

// States where NOTHING may auto-invoke the model (wake discipline §12).
export const QUIESCENT_STATES: readonly ManagementState[] = [
  "waiting",
  "waiting_for_resource",
  "approval_required",
  "blocked",
  "escalated",
  "recovery_required",
];

export function isQuiescent(state: ManagementState): boolean {
  return QUIESCENT_STATES.includes(state);
}

// ── Outcome Contract ─────────────────────────────────────────────────────────

export type OutcomeLevel = {
  levelKey: string; // stable within a contract revision
  order: number; // 1..n, ascending ambition
  statement: string; // what is TRUE at this level
  label: string; // short founder-readable label
};

// Materiality of an interpretive choice. Ordinary → Somebody may resolve it.
// Material → requires founder input/approval (locked decision 1).
export type AmbiguityMateriality = "ordinary" | "material";

export type ContractAmbiguity = {
  question: string;
  materiality: AmbiguityMateriality;
  resolution: string; // Somebody's stated reading
  resolvedBy: "somebody" | "founder";
  requiresFounderApproval: boolean; // true iff material
};

export type OutcomeContract = {
  contractId: string;
  objectiveKey: string;
  revision: number; // 1-based; a revision change invalidates open completions
  intent: string; // what the founder actually wants, restated
  levels: OutcomeLevel[];
  minimumCompletionBar: string; // must reference one levels[].levelKey
  ambiguities: ContractAmbiguity[];
  createdBy: "somebody" | "founder";
  createdFromRequestId: string; // stable idempotency identity for interpretation
  createdAt: number;
};

// ── Requirements ─────────────────────────────────────────────────────────────

export type RequirementPriority = "required" | "supporting";

/**
 * Semantic requirement discriminator (M6.1 serial protocol).
 *
 * - `deliverable` — founder-facing output stays open until the actual
 *   deliverable exists. A verified BUY is an action receipt only.
 * - `input` — the Requirement itself is that an accepted input/evidence
 *   must become available; a scoped verified external result may satisfy it.
 *
 * Legacy rows omit this field; readers preserve historical proof-derived
 * behavior when absent. Never infer from strategy, proofs, or keywords.
 */
export type RequirementKind = "deliverable" | "input";

// CRITICAL: provider-candidate rejection ≠ satisfaction; MAKE decision ≠
// satisfaction; worker-run completion ≠ satisfaction. Only an accepted
// resolution with current proof moves state to "satisfied".
export type RequirementState =
  | "active" // unresolved, still being worked
  | "satisfied" // proof-bearing resolution accepted by application code
  | "blocked" // no path right now; gates completion if required
  | "superseded" // replaced by a later revision of the contract/requirement
  | "waived"; // requires an authorized reason (never model-granted)

export type RequirementWaiver = {
  reason: string;
  authorizedBy: "founder"; // only the founder can authorize a waiver
  at: number;
};

// What must be true, and how the application can tell. Proof kinds are
// governed: each names an application-checkable observation, never a claim.
export type ProofSpec = {
  proofKey: string;
  description: string;
  // The application-observable fact class that proves it. Governed set only.
  proofKind:
    | "company_artifact_version" // artifact advanced to ≥ version N by a run
    | "application_observation" // evidence row with origin application_observation
    | "verified_external_result" // acquired provider result persisted + verified
    | "verified_external_effect" // external effect read back and verified
    | "founder_confirmation"; // explicit founder input recorded
  params: Record<string, string | number>;
};

export type SatisfactionStrategy =
  | "MAKE"
  | "BUY"
  | "HYBRID"
  | "WAIT"
  | "ASK_FOUNDER"
  | "BLOCK";

// Exhaustive over SatisfactionStrategy: adding a strategy without listing it
// here is a compile error.
const strategyRecord: Record<SatisfactionStrategy, true> = {
  MAKE: true,
  BUY: true,
  HYBRID: true,
  WAIT: true,
  ASK_FOUNDER: true,
  BLOCK: true,
};

export const SATISFACTION_STRATEGIES: readonly SatisfactionStrategy[] = (
  Object.keys(strategyRecord) as SatisfactionStrategy[]
).sort();

export function isSatisfactionStrategy(value: string): value is SatisfactionStrategy {
  return Object.prototype.hasOwnProperty.call(strategyRecord, value);
}

export type RequirementResolution = {
  resolutionId: string;
  // What actually satisfied it — an accepted decision/assignment/intent id.
  acceptedDecisionId: string | null;
  acceptedAssignmentId: string | null;
  acceptedIntentId: string | null;
  proofRefs: string[]; // evidence/artifact/intent ids carrying the proof
  contractRevision: number; // revision this proof was accepted against
  acceptedAt: number;
};

export type Requirement = {
  requirementKey: string; // stable across revisions
  objectiveKey: string;
  contractId: string;
  contractRevision: number;
  priority: RequirementPriority;
  title: string;
  mustBeTrue: string;
  scope: string; // what is in / out of this requirement
  /** Requirement keys that must be satisfied/waived before this one is decidable. */
  dependsOnRequirementKeys: string[];
  /** Resource classes / input facts this requirement needs (owned or acquired). */
  requiredResourceClasses: string[];
  /** Short statement of the expected output/state change, when known. */
  expectedOutput: string | null;
  /**
   * Explicit semantic kind. Absent on legacy rows.
   * Serial path: do not infer from strategy or attached proofs.
   */
  requirementKind?: RequirementKind;
  proofs: ProofSpec[];
  state: RequirementState;
  strategy: SatisfactionStrategy | null; // last authorized strategy
  resolution: RequirementResolution | null;
  blockedReason: string | null;
  waiver: RequirementWaiver | null;
  revision: number; // requirement-level revision
  createdAt: number;
  updatedAt: number;
};

// ── Grounded options and economic facts ──────────────────────────────────────

// Provenance classes are DISTINCT and must never be collapsed. An LLM estimate
// is not a provider quote and not a measurement (locked decision set: "do not
// manufacture precision").
export type FactProvenance =
  | "measured" // observed by the application at runtime
  | "provider_quote" // returned by a provider/market source
  | "persisted_evidence" // already recorded company fact (artifact, history)
  | "registry_data" // application-owned verified registry DATA
  | "llm_estimate" // model estimate — clearly labelled as an estimate
  | "unknown"; // genuinely unknown; stays unknown

export type FactValue<T> = {
  value: T;
  provenance: FactProvenance;
  sourceRef: string | null; // where it came from, when known
  observedAt: number | null;
  confidence: "high" | "medium" | "low" | "none";
};

// Only decision-relevant facts. Every field is optional: absence is not zero.
export type EconomicFacts = {
  scope: string | null;
  expectedQuality: FactValue<"unknown" | "below_internal" | "comparable" | "above_internal"> | null;
  setupMinutes: FactValue<number> | null;
  queueMinutes: FactValue<number> | null;
  executionMinutes: FactValue<number> | null;
  verificationMinutes: FactValue<number> | null;
  internalCostUsd: FactValue<number> | null;
  externalPriceUsd: FactValue<number> | null;
  reliability: FactValue<"unproven" | "proven_once" | "proven_repeatedly"> | null;
  availability: FactValue<"free" | "busy" | "unavailable"> | null;
  reuseValue: FactValue<"none" | "some" | "high"> | null;
  externalAdvantage: FactValue<
    | "none"
    | "speed"
    | "cost"
    | "specialization"
    | "privilege_or_access"
    | "provenance"
  > | null;
};

export type OptionKind = "internal" | "external" | "hybrid";

// A candidate way to satisfy one requirement. Internal options name a worker
// plan; external options name a discovered+validated offering; hybrids name
// both. Application grounding fills facts; the LLM never invents an option id.
export type GroundedOption = {
  optionId: string; // deterministic hash of (requirementKey, kind, target)
  requirementKey: string;
  contractRevision: number;
  kind: OptionKind;
  strategy: SatisfactionStrategy;
  // For internal: capability + worker resolution intent. For external: the
  // validated offering. For hybrid: both halves.
  internal: {
    capabilityKeys: string[]; // governed keys after validation
    responsibility: string;
    workerKey: string | null; // REUSE target, null → CREATE
    staffingReason: string | null;
    primitives: string[]; // governed tool permission ids this option needs
  } | null;
  external: {
    offeringId: string | null;
    providerId: string | null;
    serviceId: string | null;
    resourceClass: string | null;
    priceUsd: number | null;
    priceSource: FactProvenance;
    // Application-set grounding verdicts the eligibility kernel must re-check
    // (a model cannot flip these; they come from the registry lookup).
    registryVerified: boolean;
    compatibleResourceClass: boolean;
  } | null;
  facts: EconomicFacts;
  // Stage 1 result, computed by application code, never by the model.
  eligibility: OptionEligibility;
};

export type IneligibilityReason =
  | "capability_not_governed" // a required primitive/integration does not exist
  | "authority_not_granted" // needs spend/destructive/professional authority
  | "budget_exceeded"
  | "deadline_infeasible"
  | "proof_unavailable"
  | "provider_incompatible"
  | "unverified_source"
  | "worker_unavailable"
  | "contradictory_requirement"
  | "input_not_owned" // required input/resource is not currently company-controlled
  | "unknown";

export type OptionEligibility =
  | { eligible: true; checksPassed: string[] }
  | { eligible: false; reasons: IneligibilityReason[]; detail: string };

// ── Stage 1: hard eligibility (deterministic, single authority) ──────────────

export type EligibilityInput = {
  requirementKey: string;
  contractRevision: number;
  kind: OptionKind;
  // Governed primitives the option would actually execute through.
  requiredPrimitives: readonly string[];
  // Resource classes the option consumes, and which the company controls now.
  requiredResourceClasses: readonly string[];
  controlledResourceClasses: readonly string[];
  // Deadline + mandatory proof, when the requirement declares them.
  deadlineAt: number | null;
  now: number;
  estimatedMinutes: number | null;
  requiresMandatoryProof: boolean;
  proofAvailable: boolean;
  // External options only: identity/endpoint compatibility + price.
  external: {
    offeringId: string | null;
    resourceClass: string | null;
    registryVerified: boolean;
    compatibleResourceClass: boolean;
    priceUsd: number | null;
  } | null;
  // Worker options only: availability after reservation filtering.
  workerAvailable: boolean | null;
  // Financial authority bounds (M3 boundary). M4 may not exceed them.
  spendAuthorityUsd: number | null;
  budgetRemainingUsd: number | null;
};

export type EligibilityResult = OptionEligibility;

// ── Stage 3: LLM managerial recommendation (proposal, not authority) ─────────

// Exactly the fields ARCHITECTURE.md §7 Stage 3 requires. Anything else the
// model sends is discarded by the parser.
export type ManagerialRecommendation = {
  requirementKey: string;
  contractRevision: number;
  selectedOptionId: string;
  strongestAlternativeId: string | null;
  rationale: string;
  materialAssumptions: string[];
  changeMyMindEvidence: string[];
};

// ── Deterministic authorization recheck (the ONLY authority gate) ────────────

export type AuthorizationResult =
  | {
      kind: "authorized";
      decisionId: string;
      requirementKey: string;
      contractRevision: number;
      strategy: SatisfactionStrategy;
      optionId: string;
      authorizedAt: number;
      // R3 A4 — the founder approval RECORD that bounds monetary external spend,
      // bound at authorization time and carried onto the intent so the hand-off
      // predicate can see it. REQUIRED so an external authorization cannot be
      // constructed without naming the approval behind it: M4 authorizing a
      // decision is not the founder approving a payment. For a non-monetary
      // (MAKE) strategy this is null by definition.
      spendApprovalId: string | null;
    }
  | {
      kind: "refused";
      requirementKey: string;
      contractRevision: number;
      reasons: IneligibilityReason[];
      detail: string;
      // A refusal is a fact about the OPTION, never a requirement resolution.
    }
  | {
      kind: "approval_required";
      requirementKey: string;
      contractRevision: number;
      question: string;
      reason:
        | "material_ambiguity"
        | "spend_authority_required"
        | "external_effect_requires_approval"
        | "waiver_requires_authorization";
    };

// ── Managerial decision record (persisted business truth) ────────────────────

export type ManagerialDecision = {
  decisionId: string;
  objectiveKey: string;
  contractRevision: number;
  requirementKey: string;
  kind: "satisfaction_strategy" | "staffing" | "completion_proposal" | "escalation";
  strategy: SatisfactionStrategy | null;
  optionId: string | null;
  recommendation: ManagerialRecommendation | null; // what the model proposed
  authorization: AuthorizationResult;
  coarsePlanSummary: string; // the plan the manager is holding
  consideredOptionIds: string[];
  at: number;
};

// ── Persistent workforce ─────────────────────────────────────────────────────

export type WorkerLifecycle = "available" | "assigned" | "suspended" | "retired";

// A validated semantic capability definition. Somebody may define NEW semantic
// capabilities, but only by composing primitives that ALREADY exist under
// governance. A missing primitive is a blocker, never an invented tool.
export type CapabilitySpec = {
  key: string; // semantic key, e.g. "competitor_pricing_analysis"
  name: string;
  responsibility: string;
  requiredResources: string[]; // governed ResourceClass values
  primitives: string[]; // governed ToolPermissionId values that exist today
  // Validation is application-owned: see validateCapabilitySpec().
};

export type CapabilitySpecValidation =
  | { ok: true; spec: CapabilitySpec; governedKeys: string[] }
  | {
      ok: false;
      missingPrimitives: string[];
      missingResources: string[];
      // The blocker to persist: a real capability/resource gap, not an error.
      blocker: string;
    };

export type VerifiedAssignmentRecord = {
  assignmentId: string;
  objectiveKey: string;
  requirementKey: string | null;
  capabilityKeys: string[];
  outcome: "accepted" | "rejected" | "superseded";
  summary: string;
  at: number;
};

// Persistent That Guy identity. Distinct from Assignment/WorkContract/Run.
export type WorkerRecord = {
  workerKey: string;
  displayName: string;
  capabilityKeys: string[]; // governed keys
  dynamicCapabilities: CapabilitySpec[]; // validated semantic specs
  responsibility: string;
  lifecycle: WorkerLifecycle;
  reservedBy: {
    objectiveKey: string;
    requirementKey: string | null;
    assignmentId: string;
    heldUntil: number; // reservation lease; expiry returns it to available
  } | null;
  verifiedAssignments: VerifiedAssignmentRecord[]; // bounded history
  contextRefs: string[]; // company records/artifacts worth remembering
  createdByObjective: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StaffingDecision =
  | {
      outcome: "reuse";
      workerKey: string;
      reason: string;
      considered: string[];
      facts: { availability: string; setupMinutes: number | null; reuseValue: string };
    }
  | {
      outcome: "create";
      workerKey: string;
      reason: string; // must be one of the supported CREATE reasons
      createReason:
        | "availability"
        | "specialization"
        | "context_setup_cost"
        | "parallelism"
        | "completion_time"
        | "business_reason";
      considered: string[];
    }
  | {
      outcome: "no_staffing_possible";
      reason: string;
      blockers: string[]; // typed, not an exception
    };

// ── Assignments (bounded internal work) ──────────────────────────────────────

export type AssignmentState =
  | "authorized"
  | "dispatched"
  | "running"
  | "result_submitted"
  | "verified" // application accepted the assignment's own proof
  | "failed"
  | "superseded";

export type Assignment = {
  assignmentId: string;
  objectiveKey: string;
  requirementKey: string;
  contractRevision: number;
  decisionId: string;
  workerKey: string;
  kind: "internal_make" | "internal_component_of_hybrid";
  state: AssignmentState;
  attempt: number; // bounded retries
  runId: string | null;
  workContract: import("../objective/types").WorkContract;
  resultSummary: string | null;
  idempotencyScope: string;
  createdAt: number;
  updatedAt: number;
};

// ── External acquisition / effect seam (M3 boundary) ─────────────────────────

// M4 owns the INTENT and its stable identity. M3 owns payment/signing/
// submission/reconciliation. M4 must not implement a payment state machine.
export type ExecutionIntentState =
  | "authorized" // Somebody authorized an external effect
  | "handed_off" // given to the buyer rail; M3 owns what happens next
  | "awaiting_m3" // truthful resting state while M3/R2 is unavailable
  | "result_recorded" // provider result persisted, not yet verified
  | "verified" // independently verified
  | "failed"
  | "reconciliation_required"; // ambiguous external state

export type ExecutionIntent = {
  intentId: string;
  // Stable logical effect identity: replay/duplicate-wake cannot double-spend.
  idempotencyKey: string;
  objectiveKey: string;
  requirementKey: string;
  contractRevision: number;
  decisionId: string;
  kind: "external_acquisition" | "external_effect";
  strategy: "BUY" | "HYBRID";
  target: {
    offeringId: string | null;
    providerId: string | null;
    serviceId: string | null;
    resourceClass: string | null;
    endpointRef: string | null;
  };
  terms: {
    priceUsd: number | null;
    priceProvenance: FactProvenance;
    requiresApproval: boolean;
    approvalId: string | null;
  };
  state: ExecutionIntentState;
  attempts: number;
  lastEventId: string | null;
  resultEvidenceId: string | null;
  verificationEvidenceId: string | null;
  boundaryNote: string; // truthful statement of where M4 stopped and why
  createdAt: number;
  updatedAt: number;
  /**
   * When this BUY answers a validated ResourceNeed, the need's dedupeKey
   * (purpose-scoped). Same resource class alone must not cross-cover.
   */
  needDedupeKey?: string | null;
  /** Optional ResourceNeed id when known at authorization time. */
  resourceNeedId?: string | null;
  /**
   * Bounded ResourceNeed purpose when known at authorization. Forwarded to the
   * controlled merchant product request; never secrets or full Objective state.
   */
  purpose?: string | null;
};

// ── Wake events (Convex-owned, idempotent) ───────────────────────────────────

export type WakeReason =
  | "objective_submitted"
  | "founder_input"
  | "objective_revised"
  | "worker_result"
  | "worker_failure"
  | "worker_capability_request"
  | "worker_resource_request"
  | "approval_resolved"
  | "provider_result"
  | "resource_acquired"
  | "verification_result"
  | "decision_applied"
  | "timeout"
  | "recovery_event"
  | "no_progress";

export type WakeEvent = {
  eventId: string; // dedupe identity — duplicates are harmless by construction
  objectiveKey: string;
  reason: WakeReason;
  // A pointer to the Convex truth that changed (never the payload itself).
  refKind:
    | "assignment"
    | "intent"
    | "requirement"
    | "contract"
    | "approval"
    | "evidence"
    | "objective"
    | "artifact";
  refId: string;
  summary: string;
  at: number;
  consumedAt: number | null; // null until Somebody has observed it
};

// ── Anti-explosion / no-progress budgets (persisted, survive restart) ────────

export type ObjectiveBudget = {
  objectiveKey: string;
  limits: {
    maxWorkersCreated: number;
    maxActiveAssignments: number;
    maxManagementDecisions: number;
    maxWorkerAttemptsPerRequirement: number;
    maxRetriesPerIntent: number;
    maxElapsedMs: number;
    maxModelCalls: number;
    maxExternalSpendUsd: number;
    maxNoProgressCycles: number;
  };
  used: {
    workersCreated: number;
    activeAssignments: number;
    managementDecisions: number;
    modelCalls: number;
    externalSpendCommittedUsd: number;
    noProgressCycles: number;
    attemptsByRequirement: Record<string, number>;
    retriesByIntent: Record<string, number>;
  };
  startedAt: number;
  lastProgressAt: number; // advanced only by a materially new observation
};

export type BudgetVerdict =
  | { ok: true }
  | { ok: false; limit: string; detail: string; state: ManagementState };

// ── Completion gate (application-owned; Somebody only proposes) ──────────────

export type CompletionProposal = {
  proposalId: string;
  objectiveKey: string;
  contractId: string;
  contractRevision: number;
  claimedLevelKey: string;
  rationale: string;
  proposedAt: number;
};

export type CompletionVerdict =
  | {
      accepted: true;
      objectiveState: "completed";
      satisfiedRequired: string[];
      disclosedPendingSupporting: string[];
      levelsAboveBarPending: string[];
    }
  | {
      accepted: false;
      objectiveState: ManagementState;
      unmet: string[]; // specific, human-readable, machine-checkable
    };

// ── Graph state (LangGraph continuation — deliberately SMALL) ────────────────

// IDs and cursors only. The company is NOT copied into graph memory. Every
// consequential node reloads Convex truth before authorizing or acting.
export type GraphState = {
  objectiveKey: string;
  contractRevision: number | null;
  focusRequirementKey: string | null;
  managerDecisionId: string | null;
  pendingIntentId: string | null;
  wakeReason: WakeReason | null;
  wakeEventIds: string[]; // events folded into this pass
  continuation: Record<string, string>; // execution-local correlation only
  lastNode: string | null;
  pass: number; // graph-local counter; NOT business truth
};

export type GraphOutcome = {
  objectiveState: ManagementState;
  acted: boolean;
  nextWakeExpected: WakeReason | null;
  summary: string;
};

// ── Legacy compatibility ─────────────────────────────────────────────────────

// M2's plan-level MAKE/BUY/BLOCKED kernel stays valid for the rows and tests it
// already proved (ARCHITECTURE.md §21: superseded planning assumptions do not
// rewrite historical evidence). M4's per-requirement protocol is additive, and
// the single deterministic authority stays in lib/sourcing/.
export type { SourcingDecision } from "../sourcing/types";
