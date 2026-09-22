// Fresh Somebody-OKX current-product schema. Old procurement/health/unipile
// tables are intentionally not part of the current data plane; their modules
// remain in the repository for provenance until the legacy lane is retired.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  objectiveRecord,
  activityEvent,
} from "./objectiveValidators";
import {
  vWorkerRecord,
  vOutcomeContract,
  vRequirement,
  vManagerialDecision,
  vAssignment,
  vExecutionIntent,
  vWakeEvent,
  vObjectiveBudget,
  vFounderSpendGrant,
} from "./managementValidators";

export default defineSchema({
  // One bounded founder objective per row; the aggregate carries its plan,
  // work items, contract, run state and result atomically.
  objectives: defineTable({ key: v.string(), data: objectiveRecord })
    .index("by_key", ["key"])
    // Ordering for listObjectives: lets it read only the most-recently-updated
    // N documents instead of collecting and sorting every Objective row.
    .index("by_updatedAt", ["data.updatedAt"]),
  objectiveEvents: defineTable({
    objectiveKey: v.string(),
    data: activityEvent,
  }).index("by_objectiveKey", ["objectiveKey"]),
  // Persisted evidence rows keyed by objective + evidence id for provenance.
  // `origin` is set by the application, never by the model: only an
  // "application_observation" may satisfy proof. `sourceId` is the stable
  // source identity used to count DISTINCT sources, so observing the same URL
  // twice in one run cannot inflate the proof count.
  evidence: defineTable({
    objectiveKey: v.string(),
    evidenceId: v.string(),
    data: v.object({
      sourceClass: v.union(
        v.literal("company_record"),
        v.literal("public_web"),
      ),
      label: v.string(),
      text: v.string(),
      url: v.optional(v.string()),
      recordRef: v.optional(v.string()),
      observedAt: v.number(),
      recordedBy: v.string(),
      runId: v.string(),
      origin: v.union(
        v.literal("application_observation"),
        v.literal("model_note"),
      ),
      sourceId: v.string(),
      basedOnEvidenceId: v.optional(v.string()),
    }),
  })
    .index("by_objectiveKey", ["objectiveKey"])
    .index("by_objectiveEvidence", ["objectiveKey", "evidenceId"]),

  // M4 Management Engine tables — persistent workforce and control state
  workers: defineTable({
    workerKey: v.string(),
    data: vWorkerRecord,
  })
    .index("by_workerKey", ["workerKey"]),

  outcomeContracts: defineTable({
    objectiveKey: v.string(),
    contractId: v.string(),
    revision: v.number(),
    data: vOutcomeContract,
  })
    .index("by_contractId", ["contractId"])
    .index("by_objective", ["objectiveKey"])
    .index("by_objectiveRevision", ["objectiveKey", "revision"]),

  requirements: defineTable({
    objectiveKey: v.string(),
    requirementKey: v.string(),
    data: vRequirement,
  })
    .index("by_objectiveKey", ["objectiveKey"])
    .index("by_objectiveRequirement", ["objectiveKey", "requirementKey"]),

  managerialDecisions: defineTable({
    objectiveKey: v.string(),
    decisionId: v.string(),
    data: vManagerialDecision,
  })
    .index("by_objectiveKey", ["objectiveKey"])
    .index("by_decisionId", ["decisionId"]),

  assignments: defineTable({
    assignmentId: v.string(),
    objectiveKey: v.string(),
    data: vAssignment,
  })
    .index("by_assignmentId", ["assignmentId"])
    .index("by_objective", ["objectiveKey"]),

  executionIntents: defineTable({
    intentId: v.string(),
    objectiveKey: v.string(),
    idempotencyKey: v.string(),
    data: vExecutionIntent,
  })
    .index("by_intentId", ["intentId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_objective", ["objectiveKey"]),

  wakeEvents: defineTable({
    eventId: v.string(),
    objectiveKey: v.string(),
    dedupeKey: v.string(),
    data: vWakeEvent,
  })
    .index("by_eventId", ["eventId"])
    .index("by_objective", ["objectiveKey"])
    .index("by_dedupe", ["dedupeKey"]),

  objectiveBudgets: defineTable({
    objectiveKey: v.string(),
    data: vObjectiveBudget,
  }).index("by_objectiveKey", ["objectiveKey"]),

  // R3 A4 — founder-granted spend authority, one bounded record per grant.
  // A monetary external effect may only be authorized (and only handed to the
  // buyer rail as an INTENT) while a live, unrevoked grant covers it. Absence
  // means NO authority, never unlimited. M3/R2 remains the only payment
  // authority; these records bound M4's decision-making only.
  founderSpendGrants: defineTable({
    approvalId: v.string(),
    objectiveKey: v.string(),
    data: vFounderSpendGrant,
  })
    .index("by_approvalId", ["approvalId"])
    .index("by_objective", ["objectiveKey"]),
});
