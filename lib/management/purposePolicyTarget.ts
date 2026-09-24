/**
 * Shared STRUCTURAL resolver for the Requirement an application-owned
 * AuthorizedPurposePolicy targets. Used by BOTH the semantic audit
 * (requirementSemanticAudit) and the binder (bindAuthorizedPurposePolicy), so
 * the audit can never pass a graph the binder would then silently skip.
 *
 * `requirementKind` separates output (deliverable) from evidence gates
 * (input). It does NOT distinguish the final founder output from intermediate
 * outputs, so a valid decomposition may hold several deliverables. When more
 * than one Requirement matches a `deliverable` target, the target is the
 * UNIQUE TERMINAL match: a matching Requirement that no other current
 * Requirement depends on (dependsOnRequirementKeys).
 *
 * Dependency structure only — never titles, keywords, keys, array position,
 * provider availability or any worker/model-proposed purpose.
 *
 *   exactly one kind match            → that Requirement
 *   several deliverable matches       → the unique terminal match, if exactly one
 *   zero matches                      → unbound (fail closed)
 *   several terminal (or input) matches → ambiguous (fail closed)
 */

import type { RequirementKind } from "./types";

type TargetableRequirement = {
  requirementKey: string;
  requirementKind?: RequirementKind;
  dependsOnRequirementKeys?: readonly string[];
};

export type PurposePolicyTargetResolution<R extends TargetableRequirement> =
  | { ok: true; target: R; via: "unique_kind_match" | "unique_terminal_deliverable" }
  | {
      ok: false;
      reason: "unbound" | "ambiguous";
      matchKeys: string[];
      /** Terminal matches considered (deliverable targets only). */
      terminalKeys: string[];
    };

export function resolvePurposePolicyTarget<R extends TargetableRequirement>(
  requirements: readonly R[],
  targetRequirementKind: RequirementKind,
): PurposePolicyTargetResolution<R> {
  const matches = requirements.filter(
    (requirement) => requirement.requirementKind === targetRequirementKind,
  );
  const matchKeys = matches.map((m) => m.requirementKey);
  if (matches.length === 0)
    return { ok: false, reason: "unbound", matchKeys, terminalKeys: [] };
  if (matches.length === 1)
    return { ok: true, target: matches[0]!, via: "unique_kind_match" };
  if (targetRequirementKind !== "deliverable")
    return { ok: false, reason: "ambiguous", matchKeys, terminalKeys: [] };

  const dependedOn = new Set<string>();
  for (const requirement of requirements) {
    for (const dep of requirement.dependsOnRequirementKeys ?? []) {
      if (dep !== requirement.requirementKey) dependedOn.add(dep);
    }
  }
  const terminals = matches.filter((m) => !dependedOn.has(m.requirementKey));
  const terminalKeys = terminals.map((m) => m.requirementKey);
  if (terminals.length === 1)
    return { ok: true, target: terminals[0]!, via: "unique_terminal_deliverable" };
  return { ok: false, reason: "ambiguous", matchKeys, terminalKeys };
}
