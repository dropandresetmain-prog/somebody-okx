// M4 Management Engine validators mirroring lib/management/types.ts.
// These are Convex runtime validators for the FROZEN shared contract.
// Authority split: pure rules live in lib/management/*; this file only
// defines the persisted shapes.

import { v } from "convex/values";
import { workContract } from "./objectiveValidators";

const nullableString = v.union(v.string(), v.null());

// ── Control state ────────────────────────────────────────────────────────────

export const vManagementState = v.union(
  // M1/M2 states
  v.literal("received"),
  v.literal("planning"),
  v.literal("ready_to_execute"),
  v.literal("executing"),
  v.literal("waiting_for_resource"),
  v.literal("completed"),
  v.literal("failed"),
  // M4 additions
  v.literal("waiting"),
  v.literal("approval_required"),
  v.literal("blocked"),
  v.literal("escalated"),
  v.literal("recovery_required"),
);

// ── Outcome Contract ─────────────────────────────────────────────────────────

export const vOutcomeLevel = v.object({
  levelKey: v.string(),
  order: v.number(),
  statement: v.string(),
  label: v.string(),
});

export const vAmbiguityMateriality = v.union(
  v.literal("ordinary"),
  v.literal("material"),
);

export const vContractAmbiguity = v.object({
  question: v.string(),
  materiality: vAmbiguityMateriality,
  resolution: v.string(),
  resolvedBy: v.union(v.literal("somebody"), v.literal("founder")),
  requiresFounderApproval: v.boolean(),
});

export const vOutcomeContract = v.object({
  contractId: v.string(),
  objectiveKey: v.string(),
  revision: v.number(),
  intent: v.string(),
  levels: v.array(vOutcomeLevel),
  minimumCompletionBar: v.string(),
  ambiguities: v.array(vContractAmbiguity),
  createdBy: v.union(v.literal("somebody"), v.literal("founder")),
  createdFromRequestId: v.string(),
  createdAt: v.number(),
});

// ── Requirements ─────────────────────────────────────────────────────────────

export const vRequirementPriority = v.union(
  v.literal("required"),
  v.literal("supporting"),
);

export const vRequirementState = v.union(
  v.literal("active"),
  v.literal("satisfied"),
  v.literal("blocked"),
  v.literal("superseded"),
  v.literal("waived"),
);

export const vProofKind = v.union(
  v.literal("company_artifact_version"),
  v.literal("application_observation"),
  v.literal("verified_external_result"),
  v.literal("verified_external_effect"),
  v.literal("founder_confirmation"),
);

export const vProofSpec = v.object({
  proofKey: v.string(),
  description: v.string(),
  proofKind: vProofKind,
  params: v.record(v.string(), v.union(v.string(), v.number())),
});

export const vSatisfactionStrategy = v.union(
  v.literal("MAKE"),
  v.literal("BUY"),
  v.literal("HYBRID"),
  v.literal("WAIT"),
  v.literal("ASK_FOUNDER"),
  v.literal("BLOCK"),
);

export const vRequirementWaiver = v.object({
  reason: v.string(),
  authorizedBy: v.literal("founder"),
  at: v.number(),
});

export const vRequirementResolution = v.object({
  resolutionId: v.string(),
  acceptedDecisionId: nullableString,
  acceptedAssignmentId: nullableString,
  acceptedIntentId: nullableString,
  proofRefs: v.array(v.string()),
  contractRevision: v.number(),
  acceptedAt: v.number(),
});

export const vRequirement = v.object({
  requirementKey: v.string(),
  objectiveKey: v.string(),
  contractId: v.string(),
  contractRevision: v.number(),
  priority: vRequirementPriority,
  title: v.string(),
  mustBeTrue: v.string(),
  scope: v.string(),
  // Optional for rows written before M6.1 CP2; readers normalize to [].
  dependsOnRequirementKeys: v.optional(v.array(v.string())),
  requiredResourceClasses: v.optional(v.array(v.string())),
  expectedOutput: v.optional(v.union(v.string(), v.null())),
  // M6.1 serial: explicit semantic discriminator. Absent on legacy rows.
  requirementKind: v.optional(
    v.union(v.literal("deliverable"), v.literal("input")),
  ),
  proofs: v.array(vProofSpec),
  state: vRequirementState,
  strategy: v.union(vSatisfactionStrategy, v.null()),
  resolution: v.union(vRequirementResolution, v.null()),
  blockedReason: nullableString,
  waiver: v.union(vRequirementWaiver, v.null()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// ── Grounded options and economic facts ──────────────────────────────────────

export const vFactProvenance = v.union(
  v.literal("measured"),
  v.literal("provider_quote"),
  v.literal("persisted_evidence"),
  v.literal("registry_data"),
  v.literal("llm_estimate"),
  v.literal("unknown"),
);

export const vFactConfidence = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none"),
);

export const vFactValue = v.object({
  value: v.any(),
  provenance: vFactProvenance,
  sourceRef: nullableString,
  observedAt: v.union(v.number(), v.null()),
  confidence: vFactConfidence,
});

export const vEconomicFacts = v.object({
  scope: nullableString,
  expectedQuality: v.union(vFactValue, v.null()),
  setupMinutes: v.union(vFactValue, v.null()),
  queueMinutes: v.union(vFactValue, v.null()),
  executionMinutes: v.union(vFactValue, v.null()),
  verificationMinutes: v.union(vFactValue, v.null()),
  internalCostUsd: v.union(vFactValue, v.null()),
  externalPriceUsd: v.union(vFactValue, v.null()),
  reliability: v.union(vFactValue, v.null()),
  availability: v.union(vFactValue, v.null()),
  reuseValue: v.union(vFactValue, v.null()),
  externalAdvantage: v.union(vFactValue, v.null()),
});

export const vOptionKind = v.union(
  v.literal("internal"),
  v.literal("external"),
  v.literal("hybrid"),
);

export const vIneligibilityReason = v.union(
  v.literal("capability_not_governed"),
  v.literal("authority_not_granted"),
  v.literal("budget_exceeded"),
  v.literal("deadline_infeasible"),
  v.literal("proof_unavailable"),
  v.literal("provider_incompatible"),
  v.literal("unverified_source"),
  v.literal("worker_unavailable"),
  v.literal("contradictory_requirement"),
  v.literal("input_not_owned"),
  v.literal("unknown"),
);

export const vOptionEligibility = v.union(
  v.object({
    eligible: v.literal(true),
    checksPassed: v.array(v.string()),
  }),
  v.object({
    eligible: v.literal(false),
    reasons: v.array(vIneligibilityReason),
    detail: v.string(),
  }),
);

export const vGroundedOption = v.object({
  optionId: v.string(),
  requirementKey: v.string(),
  contractRevision: v.number(),
  kind: vOptionKind,
  strategy: vSatisfactionStrategy,
  internal: v.union(
    v.object({
      capabilityKeys: v.array(v.string()),
      responsibility: v.string(),
      workerKey: nullableString,
      staffingReason: nullableString,
      primitives: v.array(v.string()),
    }),
    v.null(),
  ),
  external: v.union(
    v.object({
      offeringId: nullableString,
      providerId: nullableString,
      serviceId: nullableString,
      resourceClass: nullableString,
      priceUsd: v.union(v.number(), v.null()),
      priceSource: vFactProvenance,
      registryVerified: v.boolean(),
      compatibleResourceClass: v.boolean(),
      executionPathConfigured: v.boolean(),
      purposeScopeCompatible: v.boolean(),
    }),
    v.null(),
  ),
  facts: vEconomicFacts,
  eligibility: vOptionEligibility,
});

// ── Stage 3: LLM managerial recommendation ───────────────────────────────────

export const vManagerialRecommendation = v.object({
  requirementKey: v.string(),
  contractRevision: v.number(),
  selectedOptionId: v.string(),
  strongestAlternativeId: nullableString,
  rationale: v.string(),
  materialAssumptions: v.array(v.string()),
  changeMyMindEvidence: v.array(v.string()),
});

// ── Authorization result ─────────────────────────────────────────────────────

export const vAuthorizationResult = v.union(
  v.object({
    kind: v.literal("authorized"),
    decisionId: v.string(),
    requirementKey: v.string(),
    contractRevision: v.number(),
    strategy: vSatisfactionStrategy,
    optionId: v.string(),
    authorizedAt: v.number(),
    // R3 A4 — the founder approval record bounding monetary external spend.
    spendApprovalId: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("refused"),
    requirementKey: v.string(),
    contractRevision: v.number(),
    reasons: v.array(vIneligibilityReason),
    detail: v.string(),
  }),
  v.object({
    kind: v.literal("approval_required"),
    requirementKey: v.string(),
    contractRevision: v.number(),
    question: v.string(),
    reason: v.union(
      v.literal("material_ambiguity"),
      v.literal("spend_authority_required"),
      v.literal("external_effect_requires_approval"),
      v.literal("waiver_requires_authorization"),
    ),
  }),
);

// ── Managerial decision record ───────────────────────────────────────────────

export const vDecisionKind = v.union(
  v.literal("satisfaction_strategy"),
  v.literal("staffing"),
  v.literal("completion_proposal"),
  v.literal("escalation"),
);

export const vManagerialDecision = v.object({
  decisionId: v.string(),
  objectiveKey: v.string(),
  contractRevision: v.number(),
  requirementKey: v.string(),
  kind: vDecisionKind,
  strategy: v.union(vSatisfactionStrategy, v.null()),
  optionId: nullableString,
  recommendation: v.union(vManagerialRecommendation, v.null()),
  authorization: vAuthorizationResult,
  coarsePlanSummary: v.string(),
  consideredOptionIds: v.array(v.string()),
  at: v.number(),
});

// ── Persistent workforce ─────────────────────────────────────────────────────

export const vWorkerLifecycle = v.union(
  v.literal("available"),
  v.literal("assigned"),
  v.literal("suspended"),
  v.literal("retired"),
);

export const vCapabilitySpec = v.object({
  key: v.string(),
  name: v.string(),
  responsibility: v.string(),
  requiredResources: v.array(v.string()),
  primitives: v.array(v.string()),
});

export const vCapabilitySpecValidation = v.union(
  v.object({
    ok: v.literal(true),
    spec: vCapabilitySpec,
    governedKeys: v.array(v.string()),
  }),
  v.object({
    ok: v.literal(false),
    missingPrimitives: v.array(v.string()),
    missingResources: v.array(v.string()),
    blocker: v.string(),
  }),
);

export const vVerifiedAssignmentOutcome = v.union(
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("superseded"),
);

export const vVerifiedAssignmentRecord = v.object({
  assignmentId: v.string(),
  objectiveKey: v.string(),
  requirementKey: nullableString,
  capabilityKeys: v.array(v.string()),
  outcome: vVerifiedAssignmentOutcome,
  summary: v.string(),
  at: v.number(),
});

export const vReservedBy = v.object({
  objectiveKey: v.string(),
  requirementKey: nullableString,
  assignmentId: v.string(),
  heldUntil: v.number(),
});

export const vWorkerRecord = v.object({
  workerKey: v.string(),
  displayName: v.string(),
  capabilityKeys: v.array(v.string()),
  dynamicCapabilities: v.array(vCapabilitySpec),
  responsibility: v.string(),
  lifecycle: vWorkerLifecycle,
  reservedBy: v.union(vReservedBy, v.null()),
  verifiedAssignments: v.array(vVerifiedAssignmentRecord),
  contextRefs: v.array(v.string()),
  createdByObjective: nullableString,
  createdAt: v.number(),
  updatedAt: v.number(),
});

// ── Staffing decision ────────────────────────────────────────────────────────

export const vCreateReason = v.union(
  v.literal("availability"),
  v.literal("specialization"),
  v.literal("context_setup_cost"),
  v.literal("parallelism"),
  v.literal("completion_time"),
  v.literal("business_reason"),
);

export const vStaffingDecision = v.union(
  v.object({
    outcome: v.literal("reuse"),
    workerKey: v.string(),
    reason: v.string(),
    considered: v.array(v.string()),
    facts: v.object({
      availability: v.string(),
      setupMinutes: v.union(v.number(), v.null()),
      reuseValue: v.string(),
    }),
  }),
  v.object({
    outcome: v.literal("create"),
    workerKey: v.string(),
    reason: v.string(),
    createReason: vCreateReason,
    considered: v.array(v.string()),
  }),
  v.object({
    outcome: v.literal("no_staffing_possible"),
    reason: v.string(),
    blockers: v.array(v.string()),
  }),
);

// ── Assignments ──────────────────────────────────────────────────────────────

export const vAssignmentState = v.union(
  v.literal("authorized"),
  v.literal("dispatched"),
  v.literal("running"),
  v.literal("result_submitted"),
  v.literal("verified"),
  v.literal("failed"),
  v.literal("superseded"),
);

export const vAssignmentKind = v.union(
  v.literal("internal_make"),
  v.literal("internal_component_of_hybrid"),
);

export const vAssignment = v.object({
  assignmentId: v.string(),
  objectiveKey: v.string(),
  requirementKey: v.string(),
  contractRevision: v.number(),
  decisionId: v.string(),
  workerKey: v.string(),
  kind: vAssignmentKind,
  state: vAssignmentState,
  attempt: v.number(),
  runId: nullableString,
  // WorkContract imported from objectiveValidators to mirror the M2 shape
  workContract,
  resultSummary: nullableString,
  idempotencyScope: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// ── Execution intents ────────────────────────────────────────────────────────

export const vExecutionIntentState = v.union(
  v.literal("authorized"),
  v.literal("handed_off"),
  v.literal("awaiting_m3"),
  v.literal("result_recorded"),
  v.literal("verified"),
  v.literal("failed"),
  v.literal("reconciliation_required"),
);

export const vIntentKind = v.union(
  v.literal("external_acquisition"),
  v.literal("external_effect"),
);

export const vIntentStrategy = v.union(
  v.literal("BUY"),
  v.literal("HYBRID"),
);

export const vIntentTarget = v.object({
  offeringId: nullableString,
  providerId: nullableString,
  serviceId: nullableString,
  resourceClass: nullableString,
  endpointRef: nullableString,
});

export const vIntentTerms = v.object({
  priceUsd: v.union(v.number(), v.null()),
  priceProvenance: vFactProvenance,
  requiresApproval: v.boolean(),
  approvalId: nullableString,
});

export const vExecutionIntent = v.object({
  intentId: v.string(),
  idempotencyKey: v.string(),
  objectiveKey: v.string(),
  requirementKey: v.string(),
  contractRevision: v.number(),
  decisionId: v.string(),
  kind: vIntentKind,
  strategy: vIntentStrategy,
  target: vIntentTarget,
  terms: vIntentTerms,
  state: vExecutionIntentState,
  attempts: v.number(),
  lastEventId: nullableString,
  resultEvidenceId: nullableString,
  verificationEvidenceId: nullableString,
  boundaryNote: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  needDedupeKey: v.optional(nullableString),
  resourceNeedId: v.optional(nullableString),
  purpose: v.optional(nullableString),
  requestedPurposeKind: v.optional(nullableString),
});

// ── Wake events ──────────────────────────────────────────────────────────────

export const vWakeReason = v.union(
  v.literal("objective_submitted"),
  v.literal("founder_input"),
  v.literal("objective_revised"),
  v.literal("worker_result"),
  v.literal("worker_failure"),
  v.literal("worker_capability_request"),
  v.literal("worker_resource_request"),
  v.literal("approval_resolved"),
  v.literal("provider_result"),
  v.literal("resource_acquired"),
  v.literal("verification_result"),
  v.literal("decision_applied"),
  v.literal("timeout"),
  v.literal("recovery_event"),
  v.literal("no_progress"),
);

export const vRefKind = v.union(
  v.literal("assignment"),
  v.literal("intent"),
  v.literal("requirement"),
  v.literal("contract"),
  v.literal("approval"),
  v.literal("evidence"),
  v.literal("objective"),
  v.literal("artifact"),
);

export const vWakeEvent = v.object({
  eventId: v.string(),
  objectiveKey: v.string(),
  reason: vWakeReason,
  refKind: vRefKind,
  refId: v.string(),
  summary: v.string(),
  at: v.number(),
  consumedAt: v.union(v.number(), v.null()),
});

// ── Budget ───────────────────────────────────────────────────────────────────

export const vBudgetLimits = v.object({
  maxWorkersCreated: v.number(),
  maxActiveAssignments: v.number(),
  maxManagementDecisions: v.number(),
  maxWorkerAttemptsPerRequirement: v.number(),
  maxRetriesPerIntent: v.number(),
  maxElapsedMs: v.number(),
  maxModelCalls: v.number(),
  maxExternalSpendUsd: v.number(),
  maxNoProgressCycles: v.number(),
});

export const vBudgetUsed = v.object({
  workersCreated: v.number(),
  activeAssignments: v.number(),
  managementDecisions: v.number(),
  modelCalls: v.number(),
  externalSpendCommittedUsd: v.number(),
  noProgressCycles: v.number(),
  attemptsByRequirement: v.record(v.string(), v.number()),
  retriesByIntent: v.record(v.string(), v.number()),
});

export const vObjectiveBudget = v.object({
  objectiveKey: v.string(),
  limits: vBudgetLimits,
  used: vBudgetUsed,
  startedAt: v.number(),
  lastProgressAt: v.number(),
});

export const vBudgetVerdict = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    limit: v.string(),
    detail: v.string(),
    state: vManagementState,
  }),
);

// R3 A4 — the founder's spend authority, as a PERSISTED RECORD.
//
// This is the artifact the authorization kernel needs a name for: the founder
// granted a bounded amount for an objective, and the grant has an id. Without
// it, "no limit" used to mean "no check". A grant is NOT a payment approval —
// M3/R2 remains the only financial authority — it is the bound within which M4
// may authorize an external effect and hand an INTENT to the rail.
//
// `approvalId` is the record identity used as `spendApprovalId` downstream; a
// revoked grant cannot authorize anything, so revocation is a state change on
// the record rather than a delete (provenance stays).
export const vFounderSpendGrant = v.object({
  approvalId: v.string(),
  objectiveKey: v.string(),
  limitUsd: v.number(),
  grantedAt: v.number(),
  revokedAt: v.union(v.number(), v.null()),
  note: v.string(),
});
