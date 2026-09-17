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

export const vFindingInput = v.object({
  sourceClass: v.union(v.literal("company_record"), v.literal("public_web")),
  label: v.string(),
  text: v.string(),
  url: v.optional(v.string()),
  recordRef: v.optional(v.string()),
  observedAt: v.number(),
});

export const vEvidenceData = v.object({
  sourceClass: v.string(),
  label: v.string(),
  text: v.string(),
  url: v.optional(v.string()),
  recordRef: v.optional(v.string()),
  observedAt: v.number(),
  recordedBy: v.string(),
  runId: v.string(),
});

export const vObjectiveKey = v.string();

export { vCapabilityKey, vResourceClass, vToolPermissionId };
