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

export const sourcingReason = v.object({
  decision: v.union(
    v.literal("MAKE"),
    v.literal("BUY"),
    v.literal("BLOCKED"),
  ),
  satisfied: v.array(vResourceClass),
  missing: v.array(vResourceClass),
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

export const workContract = v.object({
  assignment: v.string(),
  idempotencyScope: v.string(),
  workerKey: v.string(),
  capabilityKeys: v.array(vCapabilityKey),
  allowedToolPermissions: v.array(vToolPermissionId),
  requiredSourceClasses: v.array(
    v.union(v.literal("company_record"), v.literal("public_web")),
  ),
  minObservations: v.number(),
  requiredVerifiedEffectKeys: v.array(v.string()),
  approvalVersion: nullableString,
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
    v.literal("completed"),
    v.literal("failed"),
  ),
  activity: v.string(),
  plan: v.union(capabilityPlan, v.null()),
  workItems: v.array(workItem),
  run: v.union(workerRun, v.null()),
  result: v.union(activityResult, v.null()),
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
