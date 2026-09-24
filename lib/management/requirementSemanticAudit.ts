/**
 * Application-owned semantic audit of Requirement decomposition.
 *
 * Structural JSON validity (proposals.ts) is not enough. After Call 2, the
 * application must refuse a Requirement graph that:
 *   - defeats causal ordering via incoherent dependencies;
 *   - declares an external resource class with no usable sourcing path shape;
 *   - cannot unambiguously bind the Objective's application-owned purpose policy.
 *
 * This module grants no authority and invents no Requirements. It only names
 * invariant failures the repair path may quote exactly once.
 */

import { isGovernedPurposeKind } from "../workforce/catalog";
import { KNOWN_RESOURCE_CLASSES } from "../sourcing/policy";
import { resolvePurposePolicyTarget } from "./purposePolicyTarget";
import type {
  AuthorizedPurposePolicy,
  Requirement,
  RequirementKind,
} from "./types";

const knownResourceClassSet = new Set<string>(KNOWN_RESOURCE_CLASSES);

export type SemanticAuditIssue = {
  code:
    | "dependency_unknown"
    | "dependency_cycle"
    | "dependency_order"
    | "external_class_unknown"
    | "purpose_policy_unbound"
    | "purpose_policy_ambiguous"
    | "purpose_policy_ungoverned";
  detail: string;
};

export type SemanticAuditResult =
  | { ok: true }
  | { ok: false; issues: SemanticAuditIssue[] };

/**
 * Audit a just-built Requirement batch against semantic invariants.
 * `policy` is the Objective's application-owned purpose policy (may be null).
 */
export function auditRequirementSemantics(input: {
  requirements: readonly Requirement[];
  authorizedPurposePolicy?: AuthorizedPurposePolicy | null;
}): SemanticAuditResult {
  const issues: SemanticAuditIssue[] = [];
  const requirements = input.requirements;
  const byKey = new Map(requirements.map((r) => [r.requirementKey, r]));
  const indexByKey = new Map(
    requirements.map((r, index) => [r.requirementKey, index] as const),
  );

  // C1 — dependency coherence
  for (const requirement of requirements) {
    for (const dep of requirement.dependsOnRequirementKeys ?? []) {
      if (!byKey.has(dep)) {
        issues.push({
          code: "dependency_unknown",
          detail: `${requirement.requirementKey} depends on unknown ${dep}`,
        });
        continue;
      }
      const selfIndex = indexByKey.get(requirement.requirementKey) ?? -1;
      const depIndex = indexByKey.get(dep) ?? -1;
      // Causal order: dependencies must appear earlier in the decomposition
      // (req_01 before req_02). A later dependency defeats ordering.
      if (depIndex >= selfIndex && selfIndex >= 0) {
        issues.push({
          code: "dependency_order",
          detail: `${requirement.requirementKey} depends on ${dep} which does not causally precede it`,
        });
      }
    }
  }
  const cycle = findDependencyCycle(requirements);
  if (cycle) {
    issues.push({
      code: "dependency_cycle",
      detail: `dependency cycle: ${cycle.join(" → ")}`,
    });
  }

  // C2 — declared external resource classes must be known governed classes.
  // Market discovery / eligibility later decide whether a BUY path exists;
  // interpretation must not silently accept an invented class name.
  for (const requirement of requirements) {
    for (const resourceClass of requirement.requiredResourceClasses ?? []) {
      if (!knownResourceClassSet.has(resourceClass)) {
        issues.push({
          code: "external_class_unknown",
          detail: `${requirement.requirementKey} declares unknown resource class ${resourceClass}`,
        });
      }
    }
  }

  // C3 — purpose-policy bindability (never silent)
  const policy = input.authorizedPurposePolicy;
  if (policy) {
    if (!isGovernedPurposeKind(policy.purposeKind)) {
      issues.push({
        code: "purpose_policy_ungoverned",
        detail: `authorized purpose policy purposeKind ${policy.purposeKind} is not governed`,
      });
    } else {
      // Same structural resolver as bindAuthorizedPurposePolicy: several
      // deliverables are legitimate when exactly one is terminal.
      const target = resolvePurposePolicyTarget(
        requirements,
        policy.targetRequirementKind,
      );
      if (!target.ok && target.reason === "unbound") {
        issues.push({
          code: "purpose_policy_unbound",
          detail: `authorized purpose policy targetRequirementKind=${policy.targetRequirementKind} matched zero Requirements`,
        });
      } else if (!target.ok) {
        issues.push({
          code: "purpose_policy_ambiguous",
          detail:
            policy.targetRequirementKind === "deliverable"
              ? `authorized purpose policy targetRequirementKind=deliverable matched ${target.matchKeys.length} Requirements (${target.matchKeys.join(", ")}) with ${target.terminalKeys.length} terminal deliverables (${target.terminalKeys.join(", ") || "none"}); exactly one terminal deliverable (one no other Requirement depends on) is required`
              : `authorized purpose policy targetRequirementKind=${policy.targetRequirementKind} matched ${target.matchKeys.length} Requirements (${target.matchKeys.join(", ")}); exactly one structural target is required`,
        });
      }
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true };
}

function findDependencyCycle(
  requirements: readonly Requirement[],
): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const byKey = new Map(
    requirements.map((r) => [r.requirementKey, r] as const),
  );

  const dfs = (key: string): string[] | null => {
    if (visiting.has(key)) {
      const start = stack.indexOf(key);
      return start >= 0 ? [...stack.slice(start), key] : [key, key];
    }
    if (visited.has(key)) return null;
    visiting.add(key);
    stack.push(key);
    const requirement = byKey.get(key);
    for (const dep of requirement?.dependsOnRequirementKeys ?? []) {
      if (!byKey.has(dep)) continue;
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(key);
    visited.add(key);
    return null;
  };

  for (const requirement of requirements) {
    const cycle = dfs(requirement.requirementKey);
    if (cycle) return cycle;
  }
  return null;
}

/** Format audit issues for a single bounded Requirements-only repair prompt. */
export function formatSemanticAuditFailure(
  issues: readonly SemanticAuditIssue[],
): string {
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.code}: ${issue.detail}`)
    .join("; ");
}

/** Count Requirements of a given kind — used by tests and repair prompts. */
export function countRequirementKind(
  requirements: readonly { requirementKind?: RequirementKind }[],
  kind: RequirementKind,
): number {
  return requirements.filter((r) => r.requirementKind === kind).length;
}
