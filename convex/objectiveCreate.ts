// Shared authoritative Objective creation primitive.
// Used by both the legacy public submitObjective mutation and the V6 Product
// Command adapter (createObjectiveV1). Do not diverge these paths.

import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { ObjectiveRecord } from "../lib/workforce";
import { normalizeObjectiveRequest } from "../lib/product/objectiveRequest";
import { createArtifact } from "../lib/objective/artifact";
import { GENERIC_OBJECTIVE_DELIVERABLE } from "../lib/objective/seedData";
import type { AuthorizedPurposePolicy } from "../lib/management/types";
import { isGovernedPurposeKind, isGovernedResourceClass } from "../lib/workforce/catalog";

export {
  OBJECTIVE_REQUEST_MAX_CHARS,
  OBJECTIVE_REQUEST_MIN_CHARS,
  normalizeObjectiveRequest,
} from "../lib/product/objectiveRequest";

export type CreateReceivedObjectiveOptions = {
  /**
   * Explicit, application-owned purpose-scope policy bound to THIS Objective.
   * Validated against the governed PURPOSE_SCOPES catalog. Absent = no purpose
   * scope authorized (fail closed). Never inferred from request text, model
   * output, or productVisibility.
   */
  authorizedPurposePolicy?: AuthorizedPurposePolicy | null;
};

/**
 * Validate and normalize an optional create-time purpose policy.
 * Returns null when absent. Throws on malformed / ungoverned input so callers
 * cannot smuggle free-text authority through this seam.
 */
export function validateCreateAuthorizedPurposePolicy(
  policy: AuthorizedPurposePolicy | null | undefined,
): AuthorizedPurposePolicy | null {
  if (policy == null) return null;
  const purposeKind =
    typeof policy.purposeKind === "string" ? policy.purposeKind.trim() : "";
  const targetRequirementKind = policy.targetRequirementKind;
  if (!isGovernedPurposeKind(purposeKind)) {
    throw new Error(
      `authorizedPurposePolicy.purposeKind is not a governed PURPOSE_SCOPES kind`,
    );
  }
  if (
    targetRequirementKind !== "deliverable" &&
    targetRequirementKind !== "input"
  ) {
    throw new Error(
      `authorizedPurposePolicy.targetRequirementKind must be deliverable or input`,
    );
  }
  // Additive, APPLICATION-OWNED resource-class need (see AuthorizedPurposePolicy
  // in lib/management/types.ts). Ungoverned entries are dropped rather than
  // widening the grant on malformed input — bindAuthorizedPurposePolicy applies
  // the same filter defensively, but this is the create-time boundary.
  const requiredResourceClasses = (policy.requiredResourceClasses ?? []).filter(
    isGovernedResourceClass,
  );
  return {
    purposeKind,
    targetRequirementKind,
    ...(requiredResourceClasses.length ? { requiredResourceClasses } : {}),
  };
}

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
 *
 * Purpose-scope authority is NOT granted by visibility. Only an explicit
 * structured `authorizedPurposePolicy` (validated against PURPOSE_SCOPES)
 * may pre-seed Objective.management.authorizedPurposePolicy for later
 * bindAuthorizedPurposePolicy. Normal visible `/start` passes no policy.
 */
export async function createReceivedObjective(
  ctx: MutationCtx,
  request: string,
  productVisibility: "visible" | "internal",
  options: CreateReceivedObjectiveOptions = {},
): Promise<{ key: string }> {
  // Defense in depth: never persist an un-normalized request even if a caller
  // forgets to validate at the boundary.
  const normalized = normalizeObjectiveRequest(request);
  if (!normalized.ok) throw new Error(normalized.message);

  const authorizedPurposePolicy = validateCreateAuthorizedPurposePolicy(
    options.authorizedPurposePolicy,
  );

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
    // Purpose policy is Objective-bound structured application data only.
    // bindAuthorizedPurposePolicy still fail-closes unless interpretation
    // produces exactly one Requirement matching targetRequirementKind.
    ...(authorizedPurposePolicy
      ? {
          management: {
            contractId: null,
            authorizedPurposePolicy,
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
