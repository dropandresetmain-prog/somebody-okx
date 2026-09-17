// Generic repeated-resource sourcing orchestration seam.
//
// This file composes the canonical primitives into ONE reusable operation that
// can be invoked repeatedly, once per bounded ResourceNeed:
//
//   ResourceNeed proposal
//   → dedupe against existing needs
//   → need-driven MarketDiscovery
//   → registry compatibility validation (untrusted market data → trusted classes)
//   → generic CandidateAssessment per offering
//   → deterministic offering selection
//   → application-owned approved provider path
//   → the SINGLE canonical sourcing kernel (lib/sourcing/policy.ts)
//   → SourcingDecisionRecord (MAKE / BUY / BLOCKED) + resulting need status
//
// SCENARIO INDEPENDENCE: this file contains NO provider or scenario names. The
// strings Newsliquid / FlyBeacon / xbird / launch never appear here. Provider
// identity EMERGES from discovery + the verified registry DATA + assessment.
// The canonical launch mission is only seed DATA (see ./seedData.ts) and test
// fixtures, never logic in this seam.
//
// AUTHORITY BOUNDARY: a worker may PROPOSE a need. This seam (application code)
// validates, dedupes, discovers, assesses, decides sourcing and sets status. The
// worker never chooses an authoritative provider, approves spend, or marks a
// need fulfilled. Fulfilled is set only by the application after a verified
// external result — not here.

import { evaluateSourcingPolicy } from "../sourcing/policy";
import type {
  ApprovedProviderPath,
  SourcingAuthorizingResult,
} from "../sourcing/types";
import type { ResourceClass } from "../workforce/types";
import {
  createResourceNeed,
  dedupeResourceNeeds,
  transitionNeedStatus,
  buildDecisionRecord,
  type ResourceNeed,
  type SourcingDecisionRecord,
} from "./resourceNeed";
import type { MarketDiscovery, MarketOffering } from "../market/discovery";
import { withRegistryValidation } from "../market/registry";
import type { RegistryEntry } from "../market/registryData";
import {
  assessCandidate,
  selectOffering,
  type CandidateAssessment,
} from "../market/assessment";

// The untrusted shape a worker may propose (mirrors the request_resource tool).
export type ResourceNeedProposal = {
  objectiveKey: string;
  workItemId?: string | null;
  resourceClass: ResourceClass;
  purpose: string;
  reasonOwnedInsufficient: string;
  proposedByRunId?: string | null;
};

export type SourceResourceNeedInput = {
  proposal: ResourceNeedProposal;
  existingNeeds: readonly ResourceNeed[];
  // Factual inventory of resource classes the company controls NOW.
  ownedResourceClasses: readonly ResourceClass[];
  // Verified service registry DATA (maps serviceId → resource classes).
  registry: readonly RegistryEntry[];
  discovery: MarketDiscovery;
  // Injected for determinism: id/timestamp generation happens in the caller.
  needId: string;
  decisionId: string;
  at: number;
  discoveryLimit?: number;
};

export type SourceResourceNeedResult = {
  // The need after dedupe + status transition. When deduped, this is the
  // pre-existing need and `created` is false (no new decision is forced).
  need: ResourceNeed;
  created: boolean;
  // Present only when a NEW need was sourced this invocation.
  decision: SourcingDecisionRecord | null;
  // The assessed candidates (eligible + rejected), for the read model.
  assessments: CandidateAssessment[];
  // The discovered + registry-validated offerings considered.
  offerings: MarketOffering[];
  // For BUY: the selected offering and the approved path handed to the kernel.
  selectedOffering: MarketOffering | null;
  approvedProviderPath: ApprovedProviderPath | null;
  // The raw authorizing kernel result, for evidence/observability.
  kernelResult: SourcingAuthorizingResult | null;
};

// Resolve the application-owned approved provider path for a selected offering.
// The path is resource-specific: it is keyed by the exact missing resource class
// the kernel needs, never a wildcard. pathId is derived from the offering
// identity so it is observable but carries no authority of its own.
function approvedPathFor(
  offering: MarketOffering,
  resourceClass: ResourceClass,
): ApprovedProviderPath {
  return {
    forResourceClass: resourceClass,
    pathId: `${offering.providerId}:${offering.serviceId}`,
  };
}

/**
 * Source ONE bounded resource need. Pure except for the injected discovery
 * call (which is itself bounded and may be a snapshot). Returns the need, the
 * decision record and the candidate evidence. Does NOT persist, pay, call a
 * provider, or mark anything fulfilled.
 */
export async function sourceResourceNeed(
  input: SourceResourceNeedInput,
): Promise<SourceResourceNeedResult> {
  const {
    proposal,
    existingNeeds,
    ownedResourceClasses,
    registry,
    discovery,
    needId,
    decisionId,
    at,
  } = input;

  // 1. Build the proposed need and dedupe against existing needs. Equivalent
  //    duplicate requests collapse to the same dedupeKey and return the
  //    existing need without forcing a second decision.
  const proposed = createResourceNeed({
    id: needId,
    objectiveKey: proposal.objectiveKey,
    workItemId: proposal.workItemId ?? null,
    resourceClass: proposal.resourceClass,
    purpose: proposal.purpose,
    reasonOwnedInsufficient: proposal.reasonOwnedInsufficient,
    proposedByRunId: proposal.proposedByRunId ?? null,
    at,
  });
  const { need: deduped, created } = dedupeResourceNeeds(existingNeeds, proposed);
  if (!created) {
    return {
      need: deduped,
      created: false,
      decision: null,
      assessments: [],
      offerings: [],
      selectedOffering: null,
      approvedProviderPath: null,
      kernelResult: null,
    };
  }

  // 2. Activate the new need (proposed → active → sourcing). These are
  //    application-owned transitions, not worker authority.
  let need = transitionNeedStatus(deduped, "active", at);
  need = transitionNeedStatus(need, "sourcing", at);

  // 3. Need-driven discovery. The task description is the need's purpose; the
  //    resource class scopes it. Provider identity is not an input.
  const discovered = await discovery.discover({
    resourceClass: proposal.resourceClass,
    taskDescription: proposal.purpose,
    limit: input.discoveryLimit ?? 5,
  });

  // 4. Registry validation turns UNTRUSTED market metadata into trusted
  //    compatible resource classes. Unverified offerings get [] and are
  //    rejected downstream as untrusted.
  const offerings = discovered.map((o) => withRegistryValidation(o, registry));

  // 5. Generic candidate assessment per offering.
  const assessments = offerings.map((offering) =>
    assessCandidate({
      offering,
      need: { resourceClass: proposal.resourceClass },
      ownedResourceClasses,
    }),
  );

  // 6. Deterministic selection of the single best eligible offering.
  const selectedOffering = selectOffering(assessments, offerings);
  const rejectedOfferingIds = assessments
    .filter((a) => a.verdict !== "eligible_buy")
    .map((a) => a.offeringId);

  // 7. Application-owned approved provider path, only when an eligible offering
  //    was selected. The kernel still requires this path to be keyed by the
  //    exact missing resource class.
  const approvedProviderPath = selectedOffering
    ? approvedPathFor(selectedOffering, proposal.resourceClass)
    : null;

  // 8. The SINGLE canonical sourcing kernel decides MAKE / BUY / BLOCKED. This
  //    seam never re-derives the decision; it only feeds the kernel the
  //    validated needs, the factual inventory and any approved path.
  const kernelRaw = evaluateSourcingPolicy({
    validatedNeeds: {
      requiredResourceClasses: [proposal.resourceClass],
      rejectedUnknownClasses: [],
    },
    factualInventory: {
      controlledResourceClasses: [...ownedResourceClasses],
    },
    approvedProviderPaths: approvedProviderPath ? [approvedProviderPath] : [],
  });

  if (kernelRaw.outcome !== "authorizing") {
    // Fail-closed: an invalid kernel result is never persisted as a decision.
    throw new Error(`Sourcing decision refused: ${kernelRaw.reason}`);
  }
  const kernelResult = kernelRaw;

  // 9. Build the decision record from the kernel truth.
  const decision = buildDecisionRecord({
    id: decisionId,
    need,
    result: kernelResult,
    selectedOfferingId: selectedOffering ? selectedOffering.serviceId : null,
    rejectedOfferingIds,
    decidedAt: at,
  });

  // 10. Move the need to its post-decision status. BUY is NOT failure: the need
  //     becomes buy_pending (the objective waits for acquisition). MAKE means
  //     the resource is internally satisfiable, so the need is rejected as an
  //     external acquisition (it never needed a purchase). BLOCKED also leaves
  //     the need unresolved but is recorded honestly.
  if (kernelResult.decision === "BUY") {
    need = transitionNeedStatus(need, "buy_pending", at);
  } else {
    // MAKE (internally satisfiable) or BLOCKED (no path): the external
    // acquisition need does not proceed to buy_pending.
    need = transitionNeedStatus(need, "rejected", at);
  }

  return {
    need,
    created: true,
    decision,
    assessments,
    offerings,
    selectedOffering,
    approvedProviderPath,
    kernelResult,
  };
}
