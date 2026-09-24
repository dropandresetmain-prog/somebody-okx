// Bounded factual company context for interpretation and decision bridging.
// DATA only — never grants BUY/provider/payment authority to the interpreter.

import { CURRENT_RESOURCE_INVENTORY } from "../objective/policy";
import { externalResourceClassesForPurposeKind, isGovernedPurposeKind } from "../workforce/catalog";
import type { CompanyArtifact } from "../objective/artifact";
import type { AuthorizedPurposePolicy, RequirementKind } from "./types";

export type InterpretationCompanyContext = {
  ownedResourceClasses: readonly string[];
  controlledArtifactKeys: readonly string[];
  materialConstraints: readonly string[];
  notCurrentlyOwned: readonly string[];
  /** Structural kind the application-owned purpose policy targets (context only). */
  purposePolicyTargetKind?: RequirementKind | null;
};

/**
 * Inventory truth for the Objective's application-owned purpose policy: the
 * governed resource classes of its purpose kind (PURPOSE_SCOPES) that the
 * company does NOT control today (CURRENT_RESOURCE_INVENTORY). A fact only —
 * it creates no Requirement, ResourceNeed, strategy, provider choice or spend.
 */
export function policyNotOwnedResourceClasses(
  policy: AuthorizedPurposePolicy | null | undefined,
): string[] {
  if (!policy || !isGovernedPurposeKind(policy.purposeKind)) return [];
  const owned = new Set<string>(CURRENT_RESOURCE_INVENTORY);
  return externalResourceClassesForPurposeKind(policy.purposeKind).filter(
    (resourceClass) => !owned.has(resourceClass),
  );
}

export function buildInterpretationCompanyContext(input: {
  companyArtifacts?: readonly CompanyArtifact[] | null;
  spendGrantPresent?: boolean;
  /** Serial: disclose the actual bounded founder spend limit as factual context. */
  spendLimitUsd?: number | null;
  notOwnedHints?: readonly string[] | null;
  /** Objective-owned policy; contributes inventory truth + target kind only. */
  authorizedPurposePolicy?: AuthorizedPurposePolicy | null;
}): InterpretationCompanyContext {
  const artifacts = input.companyArtifacts ?? [];
  const controlledArtifactKeys = artifacts
    .map((artifact) => artifact.key)
    .filter((key): key is string => typeof key === "string" && key.length > 0)
    .slice(0, 8);
  const materialConstraints: string[] = [];
  if (input.spendGrantPresent === false) {
    // Describes the existing control flow; grants nothing.
    materialConstraints.push(
      "No founder spend grant is currently bound to this objective. That does not block planning or work from owned/public resources. If a later, grounded external acquisition needs money, the runtime asks the founder for explicit approval at that point, before any payment or external effect. Do not raise a material ambiguity asking the founder to pre-authorize hypothetical spend just to define outcomes or Requirements.",
    );
  } else if (
    input.spendGrantPresent === true &&
    typeof input.spendLimitUsd === "number" &&
    Number.isFinite(input.spendLimitUsd)
  ) {
    // Serial / factual disclosure: the bound is not a secret. Authorization
    // still rechecks the grant before any external intent.
    materialConstraints.push(
      `A bounded founder spend grant of USD ${input.spendLimitUsd} is bound to this objective (scope: external acquisition within that limit when justified). This is factual working context, not unlimited authority. Do not invent a higher limit. Unrelated material ambiguities are not resolved merely because a grant is present.`,
    );
  } else if (input.spendGrantPresent === true) {
    materialConstraints.push(
      "A bounded founder spend grant is present (amount is not disclosed here). Do NOT raise material ambiguities about the grant amount, whether spend within the grant needs further founder approval, or what the grant may be spent on — treat the grant as an ordinary working assumption. Only spend beyond the bound would be material.",
    );
  }
  const notCurrentlyOwned = [
    ...new Set(
      [
        ...policyNotOwnedResourceClasses(input.authorizedPurposePolicy),
        ...(input.notOwnedHints ?? []),
      ].filter((hint) => hint.trim().length > 0),
    ),
  ].slice(0, 8);
  return {
    ownedResourceClasses: [...CURRENT_RESOURCE_INVENTORY].slice(0, 16),
    controlledArtifactKeys,
    materialConstraints,
    notCurrentlyOwned,
    purposePolicyTargetKind:
      input.authorizedPurposePolicy &&
      isGovernedPurposeKind(input.authorizedPurposePolicy.purposeKind)
        ? input.authorizedPurposePolicy.targetRequirementKind
        : null,
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
      `- Not currently owned/controlled resource classes (inventory fact; the company has no company-controlled records or access for these): ${context.notCurrentlyOwned.join("; ")}`,
    );
  }
  if (context.purposePolicyTargetKind === "deliverable") {
    lines.push(
      "- Application policy target (structural context, grants nothing): the final founder-facing deliverable, i.e. the one deliverable Requirement no other Requirement depends on.",
    );
  } else if (context.purposePolicyTargetKind === "input") {
    lines.push(
      "- Application policy target (structural context, grants nothing): the one input Requirement.",
    );
  }
  lines.push(
    "Name required truths only. If the objective needs an input the company does not own or control, declare it as its own required truth (with that resource class) BEFORE dependent artifact work; do not declare a not-owned class the objective does not actually need. Never choose MAKE/BUY/provider/payment.",
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
