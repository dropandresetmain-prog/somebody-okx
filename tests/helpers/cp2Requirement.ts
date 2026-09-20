import type { ParsedRequirementProposal } from "../../lib/management/proposals";
import type { Requirement } from "../../lib/management/types";

/** Default CP2 causal fields for test fixtures. */
export const CP2_REQUIREMENT_FIELDS = {
  dependsOnRequirementKeys: [] as string[],
  requiredResourceClasses: [] as string[],
  expectedOutput: null as string | null,
};

export function cp2ParsedRequirement(
  partial: Omit<
    ParsedRequirementProposal,
    "dependsOnRequirementKeys" | "requiredResourceClasses" | "expectedOutput"
  > &
    Partial<
      Pick<
        ParsedRequirementProposal,
        "dependsOnRequirementKeys" | "requiredResourceClasses" | "expectedOutput"
      >
    >,
): ParsedRequirementProposal {
  return { ...CP2_REQUIREMENT_FIELDS, ...partial };
}

export function cp2Requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "req_01",
    objectiveKey: "obj_test",
    contractId: "contract_test",
    contractRevision: 1,
    priority: "required",
    title: "test",
    mustBeTrue: "true",
    scope: "test",
    proofs: [],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
    ...CP2_REQUIREMENT_FIELDS,
    ...overrides,
  };
}

export const CP2_DECISION_PASS_FIELDS = CP2_REQUIREMENT_FIELDS;
