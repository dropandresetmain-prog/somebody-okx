// Objective-layer adapter onto the canonical sourcing authority in
// lib/sourcing. This file contains NO make-vs-buy rule of its own: it adapts
// the Objective plan/inventory field names to the kernel input shape, calls
// evaluateSourcingPolicy(), and turns the kernel's structured result into the
// persisted `SourcingReason` presentation shape.
//
// The kernel result is the decision truth. The strings built here are
// rendering only and must never contradict it.

import { evaluateSourcingPolicy } from "../sourcing/policy";
import type {
  ApprovedProviderPath,
  SourcingAuthorizingResult,
  SourcingDecision,
} from "../sourcing/types";
import type {
  CompanyResourceInventory,
  SourcingReason,
  ValidatedPlan,
} from "./types";
import type { ResourceClass } from "../workforce/types";

// ── Application-owned provider-path registry ────────────────────────────────

// Approval of an external provider path is application-owned: the model can
// propose resource needs, but it cannot approve a provider, and no provider
// approval can be inferred from catalog metadata. An entry here means only:
// "the application knows an approved route exists for acquiring this resource".
//
// It does NOT mean payment happened, a wallet exists, a provider was called,
// spend was approved, X Layer executed, or x402 succeeded. That is M3/M4.
//
// EMPTY BY DESIGN: no canonical demo provider has been selected yet
// (DECISIONS_LOG.md — "Canonical demo: OPEN until 18 September 2026"). A real,
// provider-approved entry must be added here by the scenario lane; until then
// every missing resource has no approved path, so the policy yields BLOCKED
// rather than a fabricated BUY.
export const APPROVED_PROVIDER_PATHS: readonly ApprovedProviderPath[] = [];

// The approved path is resource-specific: a path registered for resource A can
// never satisfy a missing resource B. The kernel enforces that by exact-key
// lookup; this lookup keeps the registry read narrow and explicit.
export function approvedPathsFor(
  missing: readonly ResourceClass[],
  registry: readonly ApprovedProviderPath[] = APPROVED_PROVIDER_PATHS,
): ApprovedProviderPath[] {
  const wanted = new Set(missing);
  return registry
    .filter((path) => wanted.has(path.forResourceClass))
    .sort((a, b) => a.forResourceClass.localeCompare(b.forResourceClass));
}

// ── Canonical decision → persisted presentation ─────────────────────────────

function describe(result: SourcingAuthorizingResult): string {
  if (result.decision === "MAKE")
    return "The company currently controls every required resource class";
  if (result.decision === "BUY")
    return `Missing resources the company does not control: ${result.missingResourceClasses.join(", ")}. Every missing resource has an approved external provider path.`;
  return `Missing resources the company does not currently control: ${result.missingResourceClasses.join(", ")}`;
}

// The single sourcing seam used by the Objective layer. Throws on a
// non-authorizing kernel result so an invalid plan can never be persisted as
// MAKE or silently degraded into any decision.
export function decideObjectiveSourcing(input: {
  validated: ValidatedPlan;
  inventory: CompanyResourceInventory;
  approvedProviderPaths?: readonly ApprovedProviderPath[];
}): SourcingReason {
  const result = evaluateSourcingPolicy({
    validatedNeeds: {
      // Identities were already validated fail-closed by the planner; the
      // resources come from the controlled capability catalog, never from the
      // model's proposal list.
      requiredResourceClasses: input.validated.requiredResourceClasses,
      rejectedUnknownClasses: input.validated.rejectedResourceClasses,
    },
    factualInventory: {
      controlledResourceClasses: input.inventory.availableResourceClasses,
    },
    approvedProviderPaths:
      input.approvedProviderPaths ?? APPROVED_PROVIDER_PATHS,
  });

  if (result.outcome !== "authorizing")
    throw new Error(`Sourcing decision refused: ${result.reason}`);

  return {
    decision: result.decision,
    reasonCode: result.reasonCode,
    satisfied: [...result.satisfiedResourceClasses],
    missing: [...result.missingResourceClasses],
    approvedProviderPaths: [...result.approvedProviderPaths],
    reason: describe(result),
  };
}

// ── Objective state after a plan-level sourcing decision ────────────────────
//
// BUY is NOT failure (§8). A plan that requires an external resource the
// company does not control puts the objective into an explicit waiting state
// until that resource is acquired; it does not fail. BLOCKED (no approved
// path) remains terminal-failed because nothing can currently satisfy it. MAKE
// proceeds to execution. This is a pure rule so the Convex runtime and the
// tests share one authority and cannot drift.
export function objectiveStateForSourcing(
  decision: SourcingDecision,
): { state: "executing" | "waiting_for_resource" | "failed"; proceeds: boolean } {
  switch (decision) {
    case "MAKE":
      return { state: "executing", proceeds: true };
    case "BUY":
      return { state: "waiting_for_resource", proceeds: false };
    case "BLOCKED":
      return { state: "failed", proceeds: false };
  }
}
