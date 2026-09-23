/**
 * Builds the bounded semantic state Jev sees. Only comparable facts the
 * application already computed — no proofs, no resolution, no authority
 * fields, no dependsOnRequirementKeys. Jev compares; it does not audit.
 */
import type { GroundedOption } from "../types";
import type { JevRequirementContext } from "./types";

function describeOptionForState(option: GroundedOption) {
  return {
    optionId: option.optionId,
    kind: option.kind,
    strategy: option.strategy,
    internal: option.internal
      ? {
          capabilityKeys: option.internal.capabilityKeys,
          responsibility: option.internal.responsibility,
          workerKey: option.internal.workerKey,
        }
      : null,
    external: option.external
      ? {
          offeringId: option.external.offeringId,
          providerId: option.external.providerId,
          resourceClass: option.external.resourceClass,
          priceUsd: option.external.priceUsd,
        }
      : null,
    facts: option.facts,
  };
}

export function buildOptionSelectionState(
  requirement: JevRequirementContext,
  eligible: readonly GroundedOption[],
): Record<string, unknown> {
  return {
    requirement: {
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      mustBeTrue: requirement.mustBeTrue,
      scope: requirement.scope,
      expectedOutput: requirement.expectedOutput,
      requiredResourceClasses: requirement.requiredResourceClasses,
    },
    options: eligible.map(describeOptionForState),
  };
}

/**
 * Pure serialization of the exact Jev eval input (requirement context +
 * eligible GroundedOption[]). Read-only helper for offline eval tooling;
 * does not touch runtime routing, Convex, or telemetry.
 */
export function serializeJevEvalInput(
  requirement: JevRequirementContext,
  eligible: readonly GroundedOption[],
): Record<string, unknown> {
  return buildOptionSelectionState(requirement, eligible);
}
