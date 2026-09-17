// Fresh Somebody-OKX current-product schema. Old procurement/health/unipile
// tables are intentionally not part of the current data plane; their modules
// remain in the repository for provenance until the legacy lane is retired.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { objectiveRecord, activityEvent } from "./objectiveValidators";

export default defineSchema({
  // One bounded founder objective per row; the aggregate carries its plan,
  // work items, contract, run state and result atomically.
  objectives: defineTable({ key: v.string(), data: objectiveRecord })
    .index("by_key", ["key"]),
  objectiveEvents: defineTable({
    objectiveKey: v.string(),
    data: activityEvent,
  }).index("by_objectiveKey", ["objectiveKey"]),
  // Persisted evidence rows keyed by objective + evidence id for provenance.
  evidence: defineTable({
    objectiveKey: v.string(),
    evidenceId: v.string(),
    data: v.object({
      sourceClass: v.string(),
      label: v.string(),
      text: v.string(),
      url: v.optional(v.string()),
      recordRef: v.optional(v.string()),
      observedAt: v.number(),
      recordedBy: v.string(),
      runId: v.string(),
    }),
  })
    .index("by_objectiveKey", ["objectiveKey"])
    .index("by_objectiveEvidence", ["objectiveKey", "evidenceId"]),
});
