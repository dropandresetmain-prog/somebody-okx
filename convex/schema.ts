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
});
