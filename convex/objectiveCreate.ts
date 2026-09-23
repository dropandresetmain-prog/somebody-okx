// Shared authoritative Objective creation primitive.
// Used by both the legacy public submitObjective mutation and the V6 Product
// Command adapter (createObjectiveV1). Do not diverge these paths.

import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { ObjectiveRecord } from "../lib/workforce";
import { normalizeObjectiveRequest } from "../lib/product/objectiveRequest";
import { createArtifact } from "../lib/objective/artifact";
import { GENERIC_OBJECTIVE_DELIVERABLE } from "../lib/objective/seedData";
import { EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND } from "../lib/workforce/catalog";

export {
  OBJECTIVE_REQUEST_MAX_CHARS,
  OBJECTIVE_REQUEST_MIN_CHARS,
  normalizeObjectiveRequest,
} from "../lib/product/objectiveRequest";

/**
 * Persist a new Objective in `received`, write the initial system event, and
 * schedule management interpretation. Returns the new Objective key.
 *
 * Callers must pass an already-normalized request (trimmed + length-checked).
 *
 * Seeds a scenario-neutral Objective-owned deliverable workspace so MAKE can
 * write a governed artifact. Canonical demo setup still seeds the Somebody
 * launch artifact explicitly — this path must not.
 *
 * `productVisibility` is required (never defaulted) so every caller states
 * explicitly whether this Objective belongs in the founder product sidebar
 * ("visible") or is internal/gate/eval/demo traffic ("internal"). This is an
 * application-owned decision, never inferred from the request text.
 */
export async function createReceivedObjective(
  ctx: MutationCtx,
  request: string,
  productVisibility: "visible" | "internal",
): Promise<{ key: string }> {
  // Defense in depth: never persist an un-normalized request even if a caller
  // forgets to validate at the boundary.
  const normalized = normalizeObjectiveRequest(request);
  if (!normalized.ok) throw new Error(normalized.message);

  const now = Date.now();
  const key = `obj_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const record: ObjectiveRecord = {
    key,
    request: normalized.request,
    createdAt: now,
    updatedAt: now,
    state: "received",
    activity: "Objective received.",
    productVisibility,
    plan: null,
    workItems: [],
    run: null,
    result: null,
    companyArtifacts: [
      createArtifact({
        key: GENERIC_OBJECTIVE_DELIVERABLE.key,
        objectiveKey: key,
        label: GENERIC_OBJECTIVE_DELIVERABLE.label,
        content: GENERIC_OBJECTIVE_DELIVERABLE.initialContent,
        runId: GENERIC_OBJECTIVE_DELIVERABLE.provenanceRunId,
        at: now,
      }),
    ],
    // Real founder `/start` path ONLY (productVisibility "visible"). Narrow,
    // application-owned purpose-scope authority, set BEFORE interpretation
    // runs, mirroring how setupCanonicalDemoObjective pre-seeds its own
    // (different) policy — see CANONICAL_AUTHORIZED_PURPOSE_POLICY. This only
    // ever binds if interpretation produces exactly one Requirement with
    // requirementKind "deliverable" (bindAuthorizedPurposePolicy stays
    // fail-closed otherwise, unchanged). Internal/gate/eval Objectives
    // (productVisibility "internal", e.g. the legacy submitObjective mutation)
    // intentionally get NO policy here and remain fail-closed as before.
    ...(productVisibility === "visible"
      ? {
          management: {
            contractId: null,
            authorizedPurposePolicy: {
              purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
              targetRequirementKind: "deliverable" as const,
            },
          },
        }
      : {}),
  } as ObjectiveRecord;
  await ctx.db.insert("objectives", { key, data: record });
  await ctx.db.insert("objectiveEvents", {
    objectiveKey: key,
    data: { at: now, kind: "system", text: "Objective received." },
  });
  await ctx.scheduler.runAfter(0, internal.management.beginInterpretation, {
    objectiveKey: key,
    at: now,
  });
  return { key };
}
