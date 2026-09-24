// R3 CP-4 (A7 + I2 + I3) — the SHARED, pure decision-input builder.
//
// The decision pass is split begin → propose(action) → apply(mutation) exactly
// like interpretation, because a Convex mutation cannot make the production
// model call. That split only stays honest if BOTH the action (which discovers,
// proposes capabilities, and recommends) and the mutation (which reloads fresh
// truth, revalidates, reauthorizes, and dispatches) build the *same*
// DecisionPassInput from the *same* raw proposal. If they drifted, the eligible
// option ids the model chose among would not be the ids the mutation re-checks,
// and authorization would silently disagree with recommendation.
//
// So this module is the single place that turns
//   (fresh Convex reads) + (a raw model strategy proposal) + (a recommend fn)
// into a DecisionPassInput. It is deterministic and zero-network:
//   - capabilities come from the model-proposed `desiredCapabilities`, parsed by
//     parseStrategyProposal and governed by validateCapabilityKeys (A7 — the
//     hardcoded ["growth_launch_operations"] literal is gone);
//   - resource classes are DERIVED from those capabilities and from the factual
//     controlled inventory (I3 — the hardcoded eligibility arrays are gone);
//   - external grounding comes from createDecisionMarketDiscovery() — under
//     testnet_demo the controlled 3-offering Testnet marketplace; otherwise
//     SNAPSHOT_OFFERINGS + VERIFIED_SERVICE_REGISTRY (never the onchainos binary).
//
// It grants NO authority and writes NO truth: authority is stage-4
// reauthorization inside runManagerialDecisionPass, which the mutation runs
// against fresh Convex truth. The action calls this too, but only to surface
// eligible options to the model and capture its RAW recommendation.

import { parseStrategyProposal } from "./proposals";
import { validateCapabilityKeys } from "../workforce/catalog";
import { toolPermissionsForCapabilities } from "../workforce/permissions";
import {
  buildGroundingContext,
  controlledResourceClassesFor,
  requiredResourceClassesFor,
} from "./grounding";
import { EMPTY_FACTS } from "./options";
import { createSnapshotDiscovery } from "../market/snapshotDiscovery";
import { createTestnetDemoDiscovery } from "../market/testnetDemoMarket";
import { founderMerchantLabelFromOfferingName } from "../integration/persistedEvents";
import { readSomebodyExecutionMode } from "../execution/executionMode";
import type { MarketDiscovery } from "../market/discovery";
import { VERIFIED_SERVICE_REGISTRY } from "../market/registryData";
import { CURRENT_RESOURCE_INVENTORY } from "../objective/policy";
import { RESOURCE_CLASSES } from "../workforce/catalog";
import type { ResourceClass } from "../workforce/types";
import type { DecisionPassInput } from "./decision";
import { deriveExternalSourcingContext } from "./externalSourcing";
import type {
  AuthorizedPurposePolicy,
  EconomicFacts,
  ObjectiveBudget,
  OutcomeContract,
  Requirement,
  WorkerRecord,
} from "./types";

/** Deterministic discovery for decision recomputation — never live CLI I/O. */
export function createDecisionMarketDiscovery(): MarketDiscovery {
  const mode = readSomebodyExecutionMode();
  if (mode === "testnet_demo") return createTestnetDemoDiscovery();
  return createSnapshotDiscovery();
}

// The founder spend grant, read structurally so this lib module never imports
// from convex/. `null` means NO authority (fails closed in the kernel, R3 A4).
export type SpendGrantRead = { limitUsd: number; approvalId: string } | null;

// Everything the builder needs that must be read FRESH from Convex by the caller
// (an action via ctx.runQuery, a mutation via ctx.runQuery/ctx.db). Grouped so
// both callers pass identical values and cannot drift.
export type DecisionPassReads = {
  contract: OutcomeContract;
  currentContractRevision: number;
  requirement: Requirement;
  inventory: readonly WorkerRecord[];
  creationAllowed: boolean;
  budget: ObjectiveBudget | null;
  grant: SpendGrantRead;
  // The objective's actual controlled artifact key, when it has one. Optional so
  // pure callers without a controlled artifact keep their existing behavior.
  artifactKeyForInternalProof?: string | null;
  /** Open worker resource proposals scoped to this requirement (DATA, not authority). */
  openResourceNeeds?: readonly OpenResourceNeedFact[];
  /** Bounded accepted prerequisite results for dependsOn keys (DATA). */
  prerequisiteResults?: readonly PrerequisiteResultFact[];
  /**
   * Resource classes already satisfied by verified scoped acquisitions for this
   * Requirement+revision. Never promotes a class into global owned inventory.
   */
  scopedCoveredResourceClasses?: readonly string[];
  /**
   * Objective-owned external sourcing policy (management.authorizedPurposePolicy).
   * A sourcing ENVELOPE: any causally-ready Requirement of this Objective may
   * CONSIDER external services serving this governed purpose. Read/selection
   * authority only — never spend, signing, payment or satisfaction.
   */
  objectiveSourcingPolicy?: AuthorizedPurposePolicy | null;
  at: number;
  // Deterministic, stable per (objective, requirement, revision, attempt) so a
  // replay rebuilds the same decision row identity.
  decisionId: string;
  /**
   * When true, park compound HYBRID for this pass. Sourced from
   * `management.executionProtocol === "m61_serial_v1"`.
   */
  serialManagerProtocol?: boolean;
  /**
   * Bounded manager-facing result package for reassessment. Untrusted DATA only;
   * never grants permissions or spend authority. No chain-of-thought.
   */
  managerResultPackage?: ManagerResultPackage | null;
};

/** Bounded facts Somebody needs after an action to reassess — not authority. */
export type ManagerResultPackage = {
  /**
   * ONLY output the application accepted for a matching run identity
   * (accepted DELIVERED / validated-gap NEEDS_INPUT). Never a refused,
   * unconfirmed, failed or stale submission — see `latestWorkerDiagnostic`.
   */
  latestAcceptedWorkerOutput: {
    runId: string;
    terminal: "DELIVERED" | "NEEDS_INPUT";
    acceptedAt: number;
    summary: string;
    fit: string;
    recommendedNextAction: string;
  } | null;
  /**
   * Explicitly NON-authoritative worker diagnostic: refused/unconfirmed
   * terminals, failed (EXECUTION_ERROR) actions, or stored output with no
   * matching application acceptance. Inspectable, never accepted output.
   */
  latestWorkerDiagnostic?: WorkerDiagnostic | null;
  scopedVerifiedAcquisitions: Array<{
    resultEvidenceId: string;
    /** Requirement that acquired it: this one or a declared prerequisite. */
    requirementKey?: string;
    resourceClass: string;
    content: string;
    needDedupeKey: string | null;
    truncated: boolean;
  }>;
  currentControlledArtifact: {
    key: string;
    version: number;
    content: string;
    truncated: boolean;
  } | null;
  priorActionResult: {
    runId: string;
    summary: string;
  } | null;
  semanticEvidenceGap: {
    needId: string;
    dedupeKey: string | null;
    purpose: string;
    resourceClass: string;
    status: string;
  } | null;
  finalReviewCritique: string | null;
  provenanceEvidenceIds: string[];
};

export type WorkerDiagnostic = {
  authoritative: false;
  kind:
    | "refused_terminal"
    | "failed_action"
    | "unaccepted_result";
  runId: string;
  terminal: "DELIVERED" | "NEEDS_INPUT" | "EXECUTION_ERROR" | null;
  reason: string;
  summary: string;
  unmetObligations: string[];
};

type StoredResult = {
  runId?: string;
  summary?: string;
  fit?: string;
  recommendedNextAction?: string;
} | null;

/**
 * Deterministic projection of worker output for manager context. Acceptance is
 * read from the application's durable terminal record — never inferred from
 * prose or from the mere presence of a stored result. Legacy (non-serial)
 * objectives have no terminal record and keep their historical projection.
 */
export function projectWorkerOutput(input: {
  serialProtocol: boolean;
  result: StoredResult;
  acceptedTerminal?: {
    runId: string;
    terminal: "DELIVERED" | "NEEDS_INPUT" | "EXECUTION_ERROR";
    acceptedAt: number;
    outcome: "accepted";
  } | null;
  lastUnconfirmedTerminal?: {
    runId: string;
    terminal: "DELIVERED" | "NEEDS_INPUT" | "EXECUTION_ERROR";
    reason: string;
    summary?: string;
    unmetObligations?: string[];
  } | null;
  summaryCap?: number;
}): {
  latestAcceptedWorkerOutput: ManagerResultPackage["latestAcceptedWorkerOutput"];
  latestWorkerDiagnostic: WorkerDiagnostic | null;
} {
  const cap = input.summaryCap ?? 1500;
  const result = input.result;
  const hasResult = Boolean(result && typeof result.summary === "string");
  const packageOf = (
    terminal: "DELIVERED" | "NEEDS_INPUT",
    acceptedAt: number,
  ) => ({
    runId: String(result?.runId ?? ""),
    terminal,
    acceptedAt,
    summary: String(result?.summary ?? "").slice(0, cap),
    fit: String(result?.fit ?? "").slice(0, 800),
    recommendedNextAction: String(result?.recommendedNextAction ?? "").slice(0, 500),
  });

  if (!input.serialProtocol) {
    return {
      latestAcceptedWorkerOutput: hasResult ? packageOf("DELIVERED", 0) : null,
      latestWorkerDiagnostic: null,
    };
  }

  const accepted = input.acceptedTerminal;
  const matches =
    hasResult &&
    accepted?.outcome === "accepted" &&
    accepted.runId === result!.runId;
  if (matches && accepted!.terminal !== "EXECUTION_ERROR") {
    return {
      latestAcceptedWorkerOutput: packageOf(accepted!.terminal, accepted!.acceptedAt),
      latestWorkerDiagnostic: null,
    };
  }
  if (matches) {
    return {
      latestAcceptedWorkerOutput: null,
      latestWorkerDiagnostic: {
        authoritative: false,
        kind: "failed_action",
        runId: String(result!.runId),
        terminal: "EXECUTION_ERROR",
        reason: "worker reported EXECUTION_ERROR; not delivered output",
        summary: String(result!.summary).slice(0, 800),
        unmetObligations: [],
      },
    };
  }
  const unconfirmed = input.lastUnconfirmedTerminal;
  if (unconfirmed) {
    return {
      latestAcceptedWorkerOutput: null,
      latestWorkerDiagnostic: {
        authoritative: false,
        kind: "refused_terminal",
        runId: unconfirmed.runId,
        terminal: unconfirmed.terminal,
        reason: unconfirmed.reason.slice(0, 300),
        summary: String(unconfirmed.summary ?? "").slice(0, 800),
        unmetObligations: (unconfirmed.unmetObligations ?? []).slice(0, 8),
      },
    };
  }
  if (hasResult) {
    return {
      latestAcceptedWorkerOutput: null,
      latestWorkerDiagnostic: {
        authoritative: false,
        kind: "unaccepted_result",
        runId: String(result!.runId ?? ""),
        terminal: null,
        reason: "stored worker result has no matching application-accepted terminal",
        summary: String(result!.summary).slice(0, 800),
        unmetObligations: [],
      },
    };
  }
  return { latestAcceptedWorkerOutput: null, latestWorkerDiagnostic: null };
}

export type OpenResourceNeedFact = {
  needId: string;
  resourceClass: string;
  purpose: string;
  reasonOwnedInsufficient: string;
  status: string;
  /** True only for application-validated gaps that bind eligibility. */
  validated?: boolean;
  inputCheckId?: string | null;
  contractRevision?: number | null;
  /** Purpose-scoped ResourceNeed identity when present. */
  dedupeKey?: string | null;
  /**
   * V7 review R4 — the need's APPLICATION-VALIDATED requested scope kind
   * (ResourceNeed.requestedScope). Null = no validated scope.
   */
  requestedPurposeKind?: string | null;
  /**
   * True when the need carried a requested scope that did NOT validate. Such a
   * need is never re-scoped by the Objective sourcing policy (fails closed).
   */
  requestedScopeRejected?: boolean;
};

export type PrerequisiteResultFact = {
  requirementKey: string;
  state: string;
  proofRefs: string[];
  findings: string[];
  unknowns: string[];
};

export type MarketDiscoveryWitness = {
  requirementKey: string;
  epochKey: string;
  resourceNeed: string;
  offeringNames: string[];
};

export type BuildDecisionPassInputResult =
  | { ok: true; input: DecisionPassInput; marketDiscovery?: MarketDiscoveryWitness | null }
  // A raw strategy proposal that does not parse is a typed refusal BEFORE the
  // kernel runs: no capabilities, no options, no model recommendation. The
  // caller (the action) forwards this to applyDecision so the mutation persists
  // the refusal from fresh truth; it is never silently defaulted.
  | { ok: false; errors: string[] };

// The FULL ResourceClass union (catalog-owned DATA), not the capability-derived
// RESOURCE_CLASS_VALUES: no controlled capability requires an external class, so
// validating a model-proposed needsExternalResourceClass against capability
// requirements would make every genuine BUY unreachable (the exact I3 defect).
const knownResourceClasses = new Set<string>(RESOURCE_CLASSES.map((r) => r.class));

function isKnownResourceClass(value: string | null): value is ResourceClass {
  return value !== null && knownResourceClasses.has(value);
}

// Build the DecisionPassInput both the action and the mutation use. `recommend`
// is the ONLY non-deterministic part and is supplied by the caller:
//   - the action passes a fn that calls the model and returns its RAW output;
//   - the mutation passes `async () => storedRawRecommendation` so the kernel
//     revalidates the stored selection against freshly-recomputed eligible ids.
export async function buildDecisionPassInput(
  reads: DecisionPassReads,
  rawStrategyProposal: unknown,
  recommend: (eligible: readonly import("./types").GroundedOption[]) => Promise<unknown>,
): Promise<BuildDecisionPassInputResult> {
  const { contract, currentContractRevision, requirement } = reads;

  // ── A7: capabilities are model-PROPOSED then GOVERNED, never hardcoded ──────
  const parsedProposal = parseStrategyProposal(rawStrategyProposal);
  if (!parsedProposal.ok)
    return { ok: false, errors: parsedProposal.errors };

  const { accepted } = validateCapabilityKeys(parsedProposal.value.desiredCapabilities);
  // accepted may be empty (the model proposed only ungoverned keys). That is a
  // legitimate, meaningful state: no internal option can be built, so only an
  // external path (or WAIT/ASK/BLOCK) can win. It is NOT defaulted to a launch
  // capability — that hardcoded literal is exactly what A7 removes.
  const requiredCapabilityKeys = accepted;
  const requiredPermissions = toolPermissionsForCapabilities(requiredCapabilityKeys);

  // ── I3: resource classes are DERIVED, never hardcoded arrays ────────────────
  // Capability-derived classes PLUS requirement-declared inputs PLUS
  // application-VALIDATED input gaps (not mere worker proposals). Proposed /
  // unconfirmed needs may appear in context but must not exclude MAKE.
  const validatedNeeds = (reads.openResourceNeeds ?? []).filter(
    (need) => need.validated === true,
  );
  const declaredClasses = [
    ...requiredResourceClassesFor(requiredCapabilityKeys),
    ...(requirement.requiredResourceClasses ?? []),
    ...validatedNeeds.map((need) => need.resourceClass),
  ];
  const requiredResourceClasses = [
    ...new Set(declaredClasses.filter((value): value is ResourceClass => isKnownResourceClass(value))),
  ];
  const controlledResourceClasses = controlledResourceClassesFor(CURRENT_RESOURCE_INVENTORY);
  const scopedCovered = new Set(
    (reads.scopedCoveredResourceClasses ?? []).map((value) => value.toLowerCase()),
  );

  // External sourcing is a SEPARATE axis from the MAKE inputs above: the
  // Requirement's requiredResourceClasses say what our own worker needs and are
  // never reinterpreted as what a merchant must supply. The external class +
  // purpose come ONLY from a validated ResourceNeed or the Objective-owned
  // sourcing policy (via the governed catalogue). No context ⇒ no merchant can
  // become compatible. Read/selection context only — never spend authority.
  const sourcing = deriveExternalSourcingContext({
    openResourceNeeds: validatedNeeds,
    controlledResourceClasses,
    scopedCoveredResourceClasses: [...scopedCovered],
    objectivePolicy: reads.objectiveSourcingPolicy ?? null,
    requirementAuthorizedPurposeKinds: requirement.authorizedPurposeKinds ?? null,
  });
  const externalClass: ResourceClass | null = sourcing?.resourceClass ?? null;
  // Unowned, not-yet-acquired MAKE inputs — used below only as an awareness
  // hint for which listings to show, never as an external fulfillment class.
  const missing = requiredResourceClasses.filter(
    (resource) =>
      !controlledResourceClasses.includes(resource) &&
      !scopedCovered.has(resource.toLowerCase()),
  );
  const testnetDemo = readSomebodyExecutionMode() === "testnet_demo";

  // Discovery task text prefers the validated gap's bounded purpose; the
  // purpose kind is the context's governed kind — never inferred from prose.
  const discoveryPurpose =
    sourcing?.needPurpose ??
    `${requirement.title} ${requirement.mustBeTrue}`;
  const requestedPurposeKind = sourcing?.purposeKind ?? null;
  const boundNeedDedupeKey = sourcing?.needDedupeKey ?? null;
  const boundResourceNeedId = sourcing?.resourceNeedId ?? null;

  // ── I3: grounding from the deterministic decision discovery — zero network ─
  // testnet_demo → controlled 3-offering Testnet marketplace (full market)
  // otherwise → SNAPSHOT_OFFERINGS + VERIFIED_SERVICE_REGISTRY
  // Never spawns the onchainos binary; that is createOkxDiscovery()'s path.
  // Under testnet_demo the controlled market is always inspected (application-
  // owned awareness); without a sourcing context every offering grounds as
  // incompatible (requiredResourceClass null), so awareness never becomes
  // eligibility.
  //
  // Awareness-only hints (an unowned Requirement input, a model-proposed
  // class) may choose WHICH listings are shown, never whether any is
  // compatible: grounding below receives only the governed externalClass.
  const proposedExternal = parsedProposal.value.needsExternalResourceClass;
  const awarenessClass: ResourceClass | null =
    externalClass ??
    (missing[0] as ResourceClass | undefined) ??
    (isKnownResourceClass(proposedExternal) ? proposedExternal : null) ??
    (testnetDemo ? ("proprietary_data" as ResourceClass) : null);
  const shouldDiscover = awarenessClass !== null;
  const discoveredOfferings = shouldDiscover
    ? await createDecisionMarketDiscovery().discover({
        resourceClass: awarenessClass,
        taskDescription: discoveryPurpose.slice(0, 400),
      })
    : [];
  const grounding = shouldDiscover
    ? buildGroundingContext({
        registry: VERIFIED_SERVICE_REGISTRY,
        discovered: discoveredOfferings,
        requiredResourceClass: externalClass,
        at: reads.at,
        purpose: discoveryPurpose,
        purposeKind: requestedPurposeKind,
        // No live internal-cost measurement exists; UNKNOWN facts are honest and
        // the kernel/eligibility treat null as unknown, never as zero.
        internalFacts: EMPTY_FACTS as EconomicFacts,
      })
    : {
        discovered: [],
        internalFacts: EMPTY_FACTS as EconomicFacts,
        factsForOffering: () => EMPTY_FACTS as EconomicFacts,
      };

  // Founder-facing deliverable proof targets are stable. Capability choice may
  // refuse an inexecutable MAKE (assessInternalContractExecutability) but must
  // not erase the governed artifact key from a deliverable requirement.
  // Action-specific (input) rows still bind artifact proof only when the
  // proposed envelope can mutate company state.
  const isDeliverable =
    requirement.requirementKind === "deliverable" ||
    (requirement.requirementKind == null &&
      Boolean(requirement.expectedOutput));
  const artifactKeyForInternalProof = isDeliverable
    ? (reads.artifactKeyForInternalProof ?? null)
    : requiredPermissions.includes("update_company_artifact")
      ? (reads.artifactKeyForInternalProof ?? null)
      : null;

  const grant = reads.grant;
  const budget = reads.budget;

  const marketDiscovery: MarketDiscoveryWitness | null =
    discoveredOfferings.length > 0
      ? {
          requirementKey: requirement.requirementKey,
          epochKey: reads.decisionId,
          resourceNeed: discoveryPurpose.slice(0, 400),
          offeringNames: discoveredOfferings.map((offering) =>
            founderMerchantLabelFromOfferingName(offering.name),
          ),
        }
      : null;

  return {
    ok: true,
    marketDiscovery,
    input: {
      objectiveKey: contract.objectiveKey,
      contract,
      currentContractRevision,
      requirementKey: requirement.requirementKey,
      requirementTitle: requirement.title,
      mustBeTrue: requirement.mustBeTrue,
      priority: requirement.priority,
      dependsOnRequirementKeys: [...(requirement.dependsOnRequirementKeys ?? [])],
      requiredResourceClasses: [...(requirement.requiredResourceClasses ?? [])],
      expectedOutput: requirement.expectedOutput ?? null,
      ...(requirement.requirementKind
        ? { requirementKind: requirement.requirementKind }
        : {}),
      // V7 review R4 final correction — carried forward from the current
      // persisted Requirement row so a decision-pass rebuild never drops
      // already-authorized purpose scope.
      authorizedPurposeKinds: [...(requirement.authorizedPurposeKinds ?? [])],
      artifactKeyForInternalProof,
      staffing: {
        objectiveKey: contract.objectiveKey,
        requirementKey: requirement.requirementKey,
        requiredCapabilityKeys,
        requiredPermissions,
        expectedHoldMs: 60 * 60 * 1000,
        now: reads.at,
        neededContextRefs: [],
        parallelismNeeded: 1,
        specializationNeeded: false,
        inventory: reads.inventory,
        creationAllowed: reads.creationAllowed,
      },
      grounding,
      eligibilityFacts: {
        requiredResourceClasses,
        controlledResourceClasses: [
          ...new Set([
            ...controlledResourceClasses,
            ...(reads.scopedCoveredResourceClasses ?? []).filter(
              (value): value is ResourceClass => isKnownResourceClass(value),
            ),
          ]),
        ],
        deadlineAt: null,
        now: reads.at,
        estimatedMinutes: null,
        requiresMandatoryProof: true,
        proofAvailable: true,
        workerAvailable: null,
        // R3 A4: founder authority is READ, never assumed. null fails closed.
        spendAuthorityUsd: grant ? grant.limitUsd : null,
        budgetRemainingUsd: budget
          ? budget.limits.maxExternalSpendUsd - budget.used.externalSpendCommittedUsd
          : 0,
        workerAttemptSlotsRemaining: budget
          ? Math.max(
              0,
              budget.limits.maxWorkerAttemptsPerRequirement -
                (budget.used.attemptsByRequirement[requirement.requirementKey] ?? 0),
            )
          : null,
      },
      recommend,
      at: reads.at,
      decisionId: reads.decisionId,
      spendAuthorityUsd: grant ? grant.limitUsd : null,
      spendApprovalId: grant ? grant.approvalId : null,
      // M6.1: the accepted M4×M3 production driver is available as a bounded
      // hand-off boundary, so authorized external intents may be born hand-off-
      // eligible (with the founder approval record bound). M3 remains the ONLY
      // financial authority: this mode grants no payment, and this module never
      // contacts M3. "m3_unavailable" remains the truthful mode where the
      // boundary is genuinely absent.
      externalAuthority: "m3_available_bounded",
      waiverRequested: false,
      serialManagerProtocol: reads.serialManagerProtocol === true,
      boundNeedDedupeKey,
      boundResourceNeedId,
    },
  };
}
