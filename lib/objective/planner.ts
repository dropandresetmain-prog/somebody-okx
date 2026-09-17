// Planner boundary: the model proposes bounded capability/resource needs,
// application code validates fail-closed. The model cannot invent capability
// keys, resource classes, tool permissions or any spend authority.

import {
  CONTROLLED_CAPABILITIES,
  assertCatalogIntegrity,
  getToolPermission,
  requireCapability,
  validateCapabilityKeys,
} from "../workforce/catalog";
import { enforcePermissionEnvelope, toolPermissionsForCapabilities } from "../workforce/permissions";
import type { CapabilityKey, ResourceClass, ToolPermissionId } from "../workforce/types";
import type { PlannerProposal, ValidatedPlan } from "./types";

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

// Sourcing is NOT decided here. The MAKE/BUY/BLOCKED rule lives in exactly one
// place — lib/sourcing/policy.ts — and the Objective layer reaches it through
// decideObjectiveSourcing() in lib/objective/sourcing.ts. An earlier M1
// MAKE/BLOCKED rule lived in this file; it was removed rather than left beside
// the canonical policy, because two sourcing authorities always diverge.

// ── Role-capability satisfiability (contract §7) ────────────────────────────

// The role's observation requirements: which tool permissions must be present
// in the validated capability envelope for the role to function.
export type RoleObservationRequirement = {
  roleKey: string;
  requiredToolPermissions: ToolPermissionId[];
};

// Check whether the granted permission envelope (derived from validated
// capabilities) satisfies the role's required tool permissions. Returns
// `{ ok: true }` if all required permissions are present, or
// `{ ok: false, missing: [...] }` listing the missing permissions.
export function assertRoleRequirementsSatisfied(input: {
  grantedPermissions: readonly string[];
  role: RoleObservationRequirement;
}): { ok: true } | { ok: false; missing: string[] } {
  const granted = new Set(input.grantedPermissions);
  const missing = input.role.requiredToolPermissions.filter(
    (permission) => !granted.has(permission),
  );
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing };
}

// M1 controlled role-requirement vocabulary. RESEARCH_ROLE requires
// read_company_record AND read_public_web (plus record_finding for evidence).
// document_drafting alone or public_information_research alone must NOT
// satisfy RESEARCH_ROLE — the capability envelope must include both read
// permissions.
export const M1_ROLE_REQUIREMENTS: Record<string, RoleObservationRequirement> = {
  RESEARCH_ROLE: {
    roleKey: "RESEARCH_ROLE",
    requiredToolPermissions: ["read_company_record", "read_public_web", "record_finding"],
  },
};

// ── Server-side planning seam (contract §7) ─────────────────────────────────

// Injected model interface: bounded structured-output call. The model proposes
// a PlannerProposal; application code validates deterministically. No live SDK
// dependency — tests inject a stub.
export type PlanningModel = {
  proposePlan(input: { request: string; roleKey: string }): Promise<PlannerProposal>;
};

export type PlanObjectiveWithModelInput = {
  request: string;
  role: RoleObservationRequirement;
  model: PlanningModel;
};

// Bounded server-side planning: the model proposes, application validates.
// Returns the validated plan or throws. The model's output is NON-AUTHORITATIVE
// until deterministic validation. Unknown capability keys, unknown resource
// classes, and permissions outside the envelope are filtered out by
// validatePlannerProposal (fail closed). After validation, the derived
// permission envelope is checked against the role's required permissions.
// It is impossible for the returned plan to carry spend authority or any
// externalAuthority permission.
export async function planObjectiveWithModel(
  input: PlanObjectiveWithModelInput,
): Promise<ValidatedPlan> {
  // 1. Bounded structured-output call to the injected model.
  const proposal = await input.model.proposePlan({
    request: input.request,
    roleKey: input.role.roleKey,
  });

  // 2. Deterministic validation (reuses existing logic — fail closed).
  const validated = validatePlannerProposal(proposal);

  // 3. Derive the permission envelope from validated capabilities.
  const grantedPermissions = toolPermissionsForCapabilities(validated.capabilityKeys);

  // 4. Assert no external-authority permission can leak through.
  for (const permission of grantedPermissions) {
    const def = getToolPermission(permission);
    if (def?.externalAuthority) {
      throw new Error(`Plan cannot carry external-authority permission: ${permission}`);
    }
  }
  // Explicit guard: authorize_external_spend must never materialize.
  if (grantedPermissions.includes("authorize_external_spend")) {
    throw new Error("Plan cannot carry external spend authority");
  }

  // 5. Check role requirements against the derived envelope.
  const roleCheck = assertRoleRequirementsSatisfied({
    grantedPermissions,
    role: input.role,
  });
  if (!roleCheck.ok) {
    throw new Error(
      `Role ${input.role.roleKey} requirements not satisfied: missing ${roleCheck.missing.join(", ")}`,
    );
  }

  return validated;
}
