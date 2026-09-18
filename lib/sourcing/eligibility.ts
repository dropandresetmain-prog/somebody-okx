// Stage 1 of the economic decision model: hard eligibility. This is the
// evolution of the accepted M2 sourcing kernel (lib/sourcing/policy.ts) into
// the per-requirement option check. It stays in the SAME module family as the
// M2 kernel on purpose — ARCHITECTURE.md §21 forbids a second competing
// policy authority. The M2 kernel keeps serving M2 rows/tests unchanged.
//
// Deterministic, pure, side-effect free. The model NEVER calls this with
// wishes: application grounding supplies the inputs from governed facts.
//
// What hard eligibility checks (ARCHITECTURE.md §7 Stage 1):
//   capability/output scope → required primitives must be governed
//   security/authority      → external-authority primitives are not composable
//   deadline/mandatory proof
//   provider identity/endpoint compatibility (exact resource class binding)
//   worker/resource availability
//   budget / financial authority bounds
//
// Internal availability does NOT force MAKE: a fully-controlled internal path
// is ELIGIBLE, not mandated. Choosing among eligible options is Stage 3.

import { getToolPermission } from "../workforce/catalog";
import { KNOWN_RESOURCE_CLASSES } from "./policy";
import type {
  EligibilityInput,
  EligibilityResult,
  IneligibilityReason,
} from "../management/types";

const knownResourceClassSet = new Set<string>(KNOWN_RESOURCE_CLASSES);

// Governed primitive check: exists in the tool-permission catalog AND carries
// no external authority. externalAuthority permissions (e.g.
// authorize_external_spend) are reserved for the application's own rails and
// can never be part of an option's composable surface.
function primitiveProblem(primitive: string): IneligibilityReason | null {
  const definition = getToolPermission(primitive);
  if (!definition) return "capability_not_governed";
  if (definition.externalAuthority) return "authority_not_granted";
  return null;
}

export function evaluateOptionEligibility(
  input: EligibilityInput,
): EligibilityResult {
  const reasons = new Set<IneligibilityReason>();
  const passed: string[] = [];
  const detail: string[] = [];

  // Identity validation for resource classes (mirrors the M2 kernel rule):
  // unknown classes fail closed rather than silently passing.
  for (const resource of input.requiredResourceClasses) {
    if (!knownResourceClassSet.has(resource)) {
      reasons.add("capability_not_governed");
      detail.push(`unknown resource class ${resource}`);
    }
  }

  // 1. Governed primitives — the option can only execute through tools that
  //    exist under governance today. A missing primitive is a typed blocker.
  //    An option with NO executable primitives at all is not executable.
  let primitivesClear = input.requiredPrimitives.length > 0;
  for (const primitive of input.requiredPrimitives) {
    const problem = primitiveProblem(primitive);
    if (problem) {
      reasons.add(problem);
      detail.push(`primitive ${primitive} is not a governed composable tool`);
      primitivesClear = false;
    }
  }
  // An option that executes no governed primitive at all is not executable —
  // except a pure external option, which executes through the intent seam.
  if (!primitivesClear && input.kind !== "external") {
    if (input.requiredPrimitives.length === 0) {
      reasons.add("capability_not_governed");
      detail.push("internal option declares no executable primitives");
    }
  }
  if (primitivesClear) passed.push("primitives_governed");

  // 2. Resource control (internal paths only). External options intentionally
  //    consume classes the company does NOT control — that is the point.
  if (input.kind !== "external") {
    const controlled = new Set(input.controlledResourceClasses);
    const missing = input.requiredResourceClasses.filter(
      (resource) => !controlled.has(resource),
    );
    if (missing.length) {
      reasons.add("capability_not_governed");
      detail.push(`internal path needs uncontrolled resources: ${missing.join(", ")}`);
    } else passed.push("resources_controlled");
  }

  // 3. Deadline feasibility.
  if (input.deadlineAt !== null) {
    if (input.now >= input.deadlineAt) {
      reasons.add("deadline_infeasible");
      detail.push("deadline already passed");
    } else if (
      input.estimatedMinutes !== null &&
      input.now + input.estimatedMinutes * 60_000 > input.deadlineAt
    ) {
      reasons.add("deadline_infeasible");
      detail.push(`estimated ${input.estimatedMinutes}m exceeds remaining window`);
    } else passed.push("deadline_feasible");
  }

  // 4. Mandatory proof availability.
  if (input.requiresMandatoryProof) {
    if (!input.proofAvailable) {
      reasons.add("proof_unavailable");
      detail.push("required proof method not currently available");
    } else passed.push("proof_available");
  }

  // 5. External identity/endpoint compatibility (exact-class binding, same
  //    discipline as the M2 approved-provider-path rule).
  if (input.kind === "external" || input.kind === "hybrid") {
    const external = input.external;
    if (!external || !external.offeringId) {
      reasons.add("provider_incompatible");
      detail.push("external half names no concrete offering");
    } else {
      if (!external.registryVerified) {
        reasons.add("unverified_source");
        detail.push(`offering ${external.offeringId} is not registry-verified`);
      }
      if (!external.compatibleResourceClass) {
        reasons.add("provider_incompatible");
        detail.push(
          `offering ${external.offeringId} does not supply the exact required resource class`,
        );
      }
      if (
        external.registryVerified &&
        external.compatibleResourceClass
      )
        passed.push("provider_identity_compatible");
    }

    // 6. Financial bounds. Null price stays unknown, not zero: it cannot be
    //    checked against the cap, and an unknown-price external purchase is
    //    not authorizable without a quote.
    if (external && input.kind === "external") {
      if (external.priceUsd === null) {
        reasons.add("provider_incompatible");
        detail.push("no current price quote for external option");
      } else {
        const cap = minDefined(
          input.budgetRemainingUsd,
          input.spendAuthorityUsd === null ? undefined : input.spendAuthorityUsd,
        );
        if (cap !== undefined && external.priceUsd > cap) {
          reasons.add("budget_exceeded");
          detail.push(
            `price $${external.priceUsd} exceeds remaining authority $${cap}`,
          );
        } else passed.push("financial_bounds");
      }
    }
  }

  // 7. Worker availability for an internal option that targets an existing worker.
  if (input.workerAvailable === false) {
    reasons.add("worker_unavailable");
    detail.push("target worker is reserved or not eligible");
  } else if (input.workerAvailable === true) passed.push("worker_available");

  if (reasons.size)
    return {
      eligible: false,
      reasons: [...reasons].sort(),
      detail: detail.join("; "),
    };
  return { eligible: true, checksPassed: passed.sort() };
}

function minDefined(
  a: number | null | undefined,
  b: number | null | undefined,
): number | undefined {
  const values = [a, b].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (!values.length) return undefined;
  return Math.min(...values);
}

// Exact-class provider path helper preserved from the M2 discipline: a path
// approved for resource X can never satisfy a missing resource Y.
export function pathCoversResource(
  pathResourceClass: string | null | undefined,
  requiredResourceClass: string,
): boolean {
  return (
    typeof pathResourceClass === "string" &&
    pathResourceClass === requiredResourceClass
  );
}
