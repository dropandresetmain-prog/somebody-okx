// Validators mirroring lib/objective/types.ts for the fresh current-product
// tables. Evidence and activity are stored in their own tables and joined in
// the read model.

import { v } from "convex/values";
import { vCapabilityKey, vResourceClass, vToolPermissionId } from "./workforceValidators";

const nullableString = v.union(v.string(), v.null());

export const validatedPlan = v.object({
  capabilityKeys: v.array(vCapabilityKey),
  responsibility: v.string(),
  requiredResourceClasses: v.array(vResourceClass),
  rejectedCapabilityKeys: v.array(v.string()),
  rejectedResourceClasses: v.array(v.string()),
  deniedToolPermissions: v.array(v.string()),
});

// Mirrors SourcingReason in lib/objective/types.ts. The decision + reasonCode
// vocabulary is owned by lib/sourcing; this is only its persisted shape.
// M2 records the sourcing truth and nothing payment-related: the approved
// provider paths describe an approved acquisition ROUTE, not a call, spend or
// receipt.
//
// reasonCode and approvedProviderPaths are OPTIONAL here on purpose. Objectives
// persisted during accepted M1 predate both fields, and this validator is also
// the read/return shape — requiring them would make every existing row fail to
// load. Writers cannot skip them: lib/objective/sourcing.ts always sets both,
// and ObjectiveRecord in lib/objective/types.ts declares them as required.
export const approvedProviderPath = v.object({
  forResourceClass: vResourceClass,
  pathId: v.string(),
});

export const sourcingReason = v.object({
  decision: v.union(
    v.literal("MAKE"),
    v.literal("BUY"),
    v.literal("BLOCKED"),
  ),
  reasonCode: v.optional(
    v.union(
      v.literal("all_resources_controlled"),
      v.literal("missing_with_approved_path"),
      v.literal("missing_without_approved_path"),
    ),
  ),
  satisfied: v.array(vResourceClass),
  missing: v.array(vResourceClass),
  approvedProviderPaths: v.optional(v.array(approvedProviderPath)),
  reason: v.string(),
});

export const capabilityPlan = v.object({
  objectiveKey: v.string(),
  validated: validatedPlan,
  sourcing: sourcingReason,
  decidedAt: v.number(),
});

export const resultRequirements = v.object({
  summary: v.boolean(),
  fit: v.boolean(),
  risks: v.boolean(),
  unknowns: v.boolean(),
  recommendedNextAction: v.boolean(),
});

export const sourceProof = v.object({
  sourceClass: v.union(
    v.literal("company_record"),
    v.literal("public_web"),
  ),
  minDistinctSources: v.number(),
});

export const workContract = v.object({
  assignment: v.string(),
  idempotencyScope: v.string(),
  workerKey: v.string(),
  capabilityKeys: v.array(vCapabilityKey),
  // Tool permissions materialized for this assignment (deny-by-default subset).
  // Stored as strings: the application derives and validates the envelope
  // fail-closed before persisting.
  allowedToolPermissions: v.array(v.string()),
  requiredSourceClasses: v.array(
    v.union(v.literal("company_record"), v.literal("public_web")),
  ),
  minObservations: v.number(),
  // Per-class DISTINCT source requirements. Proof counts distinct source
  // identities from application observations, never raw persisted rows.
  sourceProofs: v.array(sourceProof),
  requiredVerifiedEffectKeys: v.array(v.string()),
  // Authority snapshot for gated actions. Always null in M1 MAKE work.
  approvalVersion: v.union(v.number(), v.null()),
  resultRequirements,
});

export const workerRun = v.object({
  id: v.string(),
  workItemId: v.string(),
  status: v.union(
    v.literal("running"),
    v.literal("stopped"),
    v.literal("failed"),
  ),
  startedAt: v.number(),
  leaseUntil: v.number(),
  model: v.string(),
  modelSelectionReason: v.string(),
  toolCalls: v.number(),
  summary: v.string(),
});

export const workItem = v.object({
  id: v.string(),
  objectiveKey: v.string(),
  title: v.string(),
  assignment: v.string(),
  workerKey: v.string(),
  state: v.union(
    v.literal("defined"),
    v.literal("assigned"),
    v.literal("running"),
    v.literal("waiting_for_resource"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  contract: workContract,
  runs: v.array(workerRun),
});

export const activityResult = v.object({
  summary: v.string(),
  fit: v.string(),
  risks: v.array(v.string()),
  unknowns: v.array(v.string()),
  recommendedNextAction: v.string(),
  completedAt: v.number(),
});

export const objectiveRecord = v.object({
  key: v.string(),
  request: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  state: v.union(
    v.literal("received"),
    v.literal("planning"),
    v.literal("ready_to_execute"),
    v.literal("executing"),
    v.literal("waiting_for_resource"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  activity: v.string(),
  plan: v.union(capabilityPlan, v.null()),
  workItems: v.array(workItem),
  run: v.union(workerRun, v.null()),
  result: v.union(activityResult, v.null()),
  // M2 mission fields — optional so accepted M1 rows keep loading.
  resourceNeeds: v.optional(v.array(v.any())),
  sourcingDecisions: v.optional(v.array(v.any())),
  candidateAssessments: v.optional(v.array(v.any())),
  marketOfferings: v.optional(v.array(v.any())),
  companyArtifacts: v.optional(v.array(v.any())),
  acquisitionResults: v.optional(v.array(v.any())),
  // M4 management engine fields — optional so M2 rows keep loading.
  // Storage only; business rules live in lib/management/*.
  management: v.optional(
    v.object({
      contractId: v.union(v.string(), v.null()),
      currentContractRevision: v.optional(v.number()),
      controlNotes: v.optional(v.array(v.any())),
      // R3 A1/I2 — the durable interpretation cursor. A management pass with no
      // contract asks for ONE interpretation; this marker is what makes that
      // request idempotent across replayed wakes, so an unbounded number of
      // model calls can never be scheduled for one objective.
      //   pending → an action is in flight (no new action may be scheduled)
      //   refused → typed refusal (malformed output / outage), replanning is
      //             founder-wake driven, never a retry storm
      //   done    → contract + requirements are persisted
      interpretationStatus: v.optional(
        v.union(
          v.literal("pending"),
          v.literal("refused"),
          v.literal("done"),
        ),
      ),
      interpretationRequestId: v.optional(v.union(v.string(), v.null())),
      interpretationAttempts: v.optional(v.number()),
      interpretationDetail: v.optional(v.union(v.string(), v.null())),
      // R3 CP-4 (I2/A7/I3) — the durable DECISION cursor. The decision pass is
      // split begin → propose(action) → apply(mutation) exactly like
      // interpretation, because a mutation cannot make the production model call.
      // `pendingDecision` is the reservation: while it is non-null an action is in
      // flight for exactly one (requirement, contractRevision) pass, so a replayed
      // wake can never schedule a second model call, and applyDecision can tell a
      // matching apply from a stale one. Cleared (set null) when the pass reaches
      // a terminal outcome — authorized, refused, or approval-required.
      pendingDecision: v.optional(
        v.union(
          v.object({
            requestId: v.string(),
            requirementKey: v.string(),
            contractRevision: v.number(),
            attempts: v.number(),
          }),
          v.null(),
        ),
      ),
      // Per-requirement decision attempts, persisted and never reset, so a model
      // that keeps producing unusable output cannot be re-scheduled forever. This
      // is the decision analogue of `interpretationAttempts`; it survives the
      // clearing of `pendingDecision` on each terminal apply.
      decisionAttempts: v.optional(v.record(v.string(), v.number())),
    }),
  ),
});

export const activityEvent = v.object({
  at: v.number(),
  kind: v.union(
    v.literal("system"),
    v.literal("agent"),
    v.literal("evidence"),
    v.literal("decision"),
    v.literal("result"),
  ),
  text: v.string(),
});
