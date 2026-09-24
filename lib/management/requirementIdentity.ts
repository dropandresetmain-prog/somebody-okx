/**
 * Application-owned requirement identity assignment.
 *
 * Models may emit requirementKey values. The parser already enforces bounded
 * unique keys. For this patch we PRESERVE model keys (safer for existing
 * persistence / test seams that address Requirements by the key interpretation
 * emitted). Remapping to req_01… remains available when a caller wants a
 * strictly sequential identity.
 */

import type { ParsedRequirementProposal } from "./proposals";

/** Zero-pad a 1-based index into req_NN (req_01 … req_99). */
export function requirementKeyAt(index: number): string {
  const n = Math.max(1, Math.floor(index));
  return `req_${String(n).padStart(2, "0")}`;
}

/**
 * Preserve validated proposal keys. Optionally remap to req_01… when
 * `forceSequential` is true (rewrites dependsOn edges).
 */
export function assignApplicationRequirementKeys(
  proposals: readonly ParsedRequirementProposal[],
  options: { forceSequential?: boolean } = {},
): ParsedRequirementProposal[] {
  if (!options.forceSequential) {
    return proposals.map((proposal) => ({ ...proposal }));
  }
  const keyMap = new Map<string, string>();
  proposals.forEach((proposal, index) => {
    keyMap.set(proposal.requirementKey, requirementKeyAt(index + 1));
  });
  return proposals.map((proposal, index) => ({
    ...proposal,
    requirementKey: requirementKeyAt(index + 1),
    dependsOnRequirementKeys: [
      ...new Set(
        (proposal.dependsOnRequirementKeys ?? [])
          .map((dep) => keyMap.get(dep) ?? dep)
          .filter((dep) => dep !== requirementKeyAt(index + 1)),
      ),
    ],
  }));
}
