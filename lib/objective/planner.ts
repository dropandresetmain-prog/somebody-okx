// Planner boundary: the model proposes bounded capability/resource needs,
// application code validates fail-closed. The model cannot invent capability
// keys, resource classes, tool permissions or any spend authority.

import {
  CONTROLLED_CAPABILITIES,
  assertCatalogIntegrity,
  requireCapability,
  validateCapabilityKeys,
} from "../workforce/catalog";
import { enforcePermissionEnvelope } from "../workforce/permissions";
import type { CapabilityKey, ResourceClass } from "../workforce/types";
import type { CompanyResourceInventory, PlannerProposal, ValidatedPlan } from "./types";

// Guard the catalog at module load so a bad definition fails at the source.
assertCatalogIntegrity();

export const RESOURCE_CLASS_VALUES: readonly ResourceClass[] =
  CONTROLLED_CAPABILITIES.flatMap((capability) => capability.requiredResources);
const knownResourceClasses = new Set<ResourceClass>(RESOURCE_CLASS_VALUES);

export function isKnownResourceClass(value: string): value is ResourceClass {
  return knownResourceClasses.has(value as ResourceClass);
}

// The requestedToolPermissions field is deliberately ignored for grants: the
// permission envelope is derived from validated capabilities only. Any
// requested-but-not-derivable permission is reported as denied so tampering is
// observable rather than silently dropped.
export function validatePlannerProposal(
  proposal: PlannerProposal,
): ValidatedPlan {
  const responsibility = (proposal.responsibility ?? "").trim();
  if (!responsibility)
    throw new Error("Planner proposal is missing a bounded responsibility");
  if (responsibility.length > 400)
    throw new Error("Planner responsibility is not bounded (max 400 chars)");

  const capabilities = validateCapabilityKeys(proposal.capabilityKeys ?? []);
  if (!capabilities.accepted.length)
    throw new Error(
      `Planner proposed no controlled capability. Rejected: ${capabilities.rejected.join(", ") || "none"}`,
    );

  // Every accepted capability's resource requirements are application truth.
  // The proposal's resource list is validated (unknown classes fail closed)
  // but never widens what the capabilities require.
  const rejectedResources = (proposal.requiredResourceClasses ?? [])
    .filter((value) => !isKnownResourceClass(value))
    .sort();
  const requiredResources = new Set<ResourceClass>();
  for (const key of capabilities.accepted)
    for (const resource of requireCapability(key).requiredResources)
      requiredResources.add(resource);

  // Model-proposed permissions can only ever narrow or equal the envelope.
  const envelope = enforcePermissionEnvelope({
    capabilityKeys: capabilities.accepted,
    requestedPermissions: proposal.requestedToolPermissions ?? [],
  });

  return {
    capabilityKeys: capabilities.accepted,
    responsibility,
    requiredResourceClasses: [...requiredResources].sort(),
    rejectedCapabilityKeys: capabilities.rejected,
    rejectedResourceClasses: rejectedResources,
    deniedToolPermissions: envelope.denied,
  };
}

// Factual inventory check: MAKE only when every required resource class is
// actually available right now. Catalog membership is not ownership.
export function evaluateSourcing(input: {
  requiredResourceClasses: readonly ResourceClass[];
  inventory: CompanyResourceInventory;
}): import("./types").SourcingReason {
  const available = new Set(input.inventory.availableResourceClasses);
  const satisfied: ResourceClass[] = [];
  const missing: ResourceClass[] = [];
  for (const resource of input.requiredResourceClasses) {
    if (available.has(resource)) satisfied.push(resource);
    else missing.push(resource);
  }
  if (missing.length === 0)
    return {
      decision: "MAKE",
      satisfied,
      missing,
      reason: "The company currently controls every required resource class",
    };
  return {
    decision: "BLOCKED",
    satisfied,
    missing,
    reason: `Missing resources the company does not currently control: ${missing.join(", ")}`,
  };
}
