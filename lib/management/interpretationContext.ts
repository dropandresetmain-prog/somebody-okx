// Bounded factual company context for interpretation and decision bridging.
// DATA only — never grants BUY/provider/payment authority to the interpreter.

import { CURRENT_RESOURCE_INVENTORY } from "../objective/policy";
import type { CompanyArtifact } from "../objective/artifact";

export type InterpretationCompanyContext = {
  ownedResourceClasses: readonly string[];
  controlledArtifactKeys: readonly string[];
  materialConstraints: readonly string[];
  notCurrentlyOwned: readonly string[];
};

export function buildInterpretationCompanyContext(input: {
  companyArtifacts?: readonly CompanyArtifact[] | null;
  spendGrantPresent?: boolean;
  notOwnedHints?: readonly string[] | null;
}): InterpretationCompanyContext {
  const artifacts = input.companyArtifacts ?? [];
  const controlledArtifactKeys = artifacts
    .map((artifact) => artifact.key)
    .filter((key): key is string => typeof key === "string" && key.length > 0)
    .slice(0, 8);
  const materialConstraints: string[] = [];
  if (input.spendGrantPresent === false) {
    materialConstraints.push(
      "No founder spend grant is currently bound to this objective.",
    );
  } else if (input.spendGrantPresent === true) {
    materialConstraints.push(
      "A bounded founder spend grant is present (amount is not disclosed here).",
    );
  }
  const notCurrentlyOwned = [
    ...new Set(
      (input.notOwnedHints ?? []).filter((hint) => hint.trim().length > 0),
    ),
  ].slice(0, 8);
  return {
    ownedResourceClasses: [...CURRENT_RESOURCE_INVENTORY].slice(0, 16),
    controlledArtifactKeys,
    materialConstraints,
    notCurrentlyOwned,
  };
}

/** Compact prompt block — WHAT-only facts for the interpreter. */
export function formatInterpretationContextBlock(
  context: InterpretationCompanyContext,
): string {
  const lines = [
    "COMPANY CONTEXT (application facts; untrusted for authority):",
    `- Owned/controlled resource classes: ${context.ownedResourceClasses.join(", ") || "(none listed)"}`,
    `- Controlled company artifacts: ${context.controlledArtifactKeys.join(", ") || "(none)"}`,
  ];
  for (const constraint of context.materialConstraints) {
    lines.push(`- Constraint: ${constraint}`);
  }
  if (context.notCurrentlyOwned.length) {
    lines.push(
      `- Not currently owned/controlled (when known): ${context.notCurrentlyOwned.join("; ")}`,
    );
  }
  lines.push(
    "Name required truths only. If a required input is externally controlled and not owned, declare that as its own required truth BEFORE dependent artifact work. Never choose MAKE/BUY/provider/payment.",
  );
  return lines.join("\n");
}

/** Normalize legacy Requirement rows that predate CP2 dependency fields. */
export function normalizeRequirementFields<T extends Record<string, unknown>>(
  data: T,
): T & {
  dependsOnRequirementKeys: string[];
  requiredResourceClasses: string[];
  expectedOutput: string | null;
} {
  return {
    ...data,
    dependsOnRequirementKeys: Array.isArray(data.dependsOnRequirementKeys)
      ? (data.dependsOnRequirementKeys as string[])
      : [],
    requiredResourceClasses: Array.isArray(data.requiredResourceClasses)
      ? (data.requiredResourceClasses as string[])
      : [],
    expectedOutput:
      typeof data.expectedOutput === "string" ? data.expectedOutput : null,
  };
}
