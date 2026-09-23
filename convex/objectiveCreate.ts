// Shared authoritative Objective creation primitive.
// Used by both the legacy public submitObjective mutation and the V6 Product
// Command adapter (createObjectiveV1). Do not diverge these paths.

import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { ObjectiveRecord } from "../lib/workforce";
import { normalizeObjectiveRequest } from "../lib/product/objectiveRequest";
import { CANONICAL_LAUNCH_ARTIFACT } from "../lib/objective/seedData";
import { createArtifact } from "../lib/objective/artifact";

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
 * Seeds the same governed launch artifact the canonical demo setup uses, so
 * Intern MAKE can change a real company-owned version instead of refusing with
 * "No company artifact seeded".
 */
export async function createReceivedObjective(
  ctx: MutationCtx,
  request: string,
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
    plan: null,
    workItems: [],
    run: null,
    result: null,
    companyArtifacts: [
      createArtifact({
        key: CANONICAL_LAUNCH_ARTIFACT.key,
        objectiveKey: key,
        label: CANONICAL_LAUNCH_ARTIFACT.label,
        content: CANONICAL_LAUNCH_ARTIFACT.initialContent,
        runId: "seed",
        at: now,
      }),
    ],
  };
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
