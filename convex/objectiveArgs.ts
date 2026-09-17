// Argument validators shared by the objective runtime functions.

import { v } from "convex/values";
import { vCapabilityKey, vResourceClass, vToolPermissionId } from "./workforceValidators";

export const vObjectiveRequest = v.string();

export const vPlannerProposal = v.object({
  capabilityKeys: v.array(v.string()),
  responsibility: v.string(),
  requiredResourceClasses: v.array(v.string()),
  requestedToolPermissions: v.optional(v.array(v.string())),
});

// Evidence origin is part of the argument shape, but the mutation never trusts
// it: `recordFinding` re-derives the source identity from the source fields and
// rejects a mismatch, so neither the model nor a future caller can mint proof
// by asserting `application_observation` or inventing a `sourceId`.
export const vEvidenceOrigin = v.union(
  v.literal("application_observation"),
  v.literal("model_note"),
);

export const vSourceClass = v.union(
  v.literal("company_record"),
  v.literal("public_web"),
);

export const vFindingInput = v.object({
  sourceClass: vSourceClass,
  label: v.string(),
  text: v.string(),
  url: v.optional(v.string()),
  recordRef: v.optional(v.string()),
  observedAt: v.number(),
  origin: vEvidenceOrigin,
  sourceId: v.string(),
});

export const vEvidenceData = v.object({
  sourceClass: vSourceClass,
  label: v.string(),
  text: v.string(),
  url: v.optional(v.string()),
  recordRef: v.optional(v.string()),
  observedAt: v.number(),
  recordedBy: v.string(),
  runId: v.string(),
  origin: vEvidenceOrigin,
  sourceId: v.string(),
  // For a note: the application observation it annotates. Validated by the
  // runtime against the current run, so a note cannot cite a fabricated source.
  basedOnEvidenceId: v.optional(v.string()),
});

export const vObjectiveKey = v.string();

export { vCapabilityKey, vResourceClass, vToolPermissionId };
