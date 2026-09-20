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
//   - external grounding comes from createSnapshotDiscovery() over the static
//     VERIFIED_SERVICE_REGISTRY + SNAPSHOT_OFFERINGS (I3 — `discovered: []` made
//     a genuine BUY unreachable; this is snapshot data, NOT the onchainos binary).
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
import { VERIFIED_SERVICE_REGISTRY } from "../market/registryData";
import { CURRENT_RESOURCE_INVENTORY } from "../objective/policy";
import { RESOURCE_CLASSES } from "../workforce/catalog";
import type { ResourceClass } from "../workforce/types";
import type { DecisionPassInput } from "./decision";
import type {
  EconomicFacts,
  ObjectiveBudget,
  OutcomeContract,
  Requirement,
  WorkerRecord,
} from "./types";

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
  at: number;
  // Deterministic, stable per (objective, requirement, revision, attempt) so a
  // replay rebuilds the same decision row identity.
  decisionId: string;
  /**
   * When true, park compound HYBRID for this pass. Sourced from
   * `management.executionProtocol === "m61_serial_v1"`.
   */
  serialManagerProtocol?: boolean;
};

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
};

export type PrerequisiteResultFact = {
  requirementKey: string;
  state: string;
  proofRefs: string[];
  findings: string[];
  unknowns: string[];
};

export type BuildDecisionPassInputResult =
  | { ok: true; input: DecisionPassInput }
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

  // Discover for the validated gap first. Do not let an unrelated model-selected
  // needsExternalResourceClass override a validated gap. Proposed-only needs
  // never drive discovery. Verified scoped acquisitions also remove covered
  // classes from "missing" without declaring them globally owned.
  const missing = requiredResourceClasses.filter(
    (resource) =>
      !controlledResourceClasses.includes(resource) &&
      !scopedCovered.has(resource.toLowerCase()),
  );
  const validatedGapClass = validatedNeeds
    .map((need) => need.resourceClass)
    .find((value) => isKnownResourceClass(value) && missing.includes(value as ResourceClass));
  const proposedExternal = parsedProposal.value.needsExternalResourceClass;
  const externalClass: ResourceClass | null = isKnownResourceClass(validatedGapClass ?? null)
    ? (validatedGapClass as ResourceClass)
    : validatedGapClass == null && missing.length > 0
      ? (missing[0] as ResourceClass)
      : // Only fall back to model proposal when no validated/declared gap exists.
        validatedNeeds.length === 0 && missing.length === 0 && isKnownResourceClass(proposedExternal)
        ? (proposedExternal as ResourceClass)
        : null;

  // Discovery task text prefers the validated gap's bounded purpose/scope.
  const discoveryPurpose =
    validatedNeeds.find((need) => need.resourceClass === externalClass)?.purpose ??
    `${requirement.title} ${requirement.mustBeTrue}`;

  // ── I3: grounding from the static snapshot registry — zero network ──────────
  // createSnapshotDiscovery() reads SNAPSHOT_OFFERINGS + VERIFIED_SERVICE_REGISTRY
  // (application-owned DATA). It never spawns the onchainos binary; that is
  // createOkxDiscovery()'s default runner, deliberately avoided here.
  const grounding = externalClass
    ? buildGroundingContext({
        registry: VERIFIED_SERVICE_REGISTRY,
        discovered: await createSnapshotDiscovery().discover({
          resourceClass: externalClass,
          taskDescription: discoveryPurpose.slice(0, 400),
        }),
        requiredResourceClass: externalClass,
        at: reads.at,
        // No live internal-cost measurement exists; UNKNOWN facts are honest and
        // the kernel/eligibility treat null as unknown, never as zero.
        internalFacts: EMPTY_FACTS as EconomicFacts,
      })
    : {
        discovered: [],
        internalFacts: EMPTY_FACTS as EconomicFacts,
        factsForOffering: () => EMPTY_FACTS as EconomicFacts,
      };

  // artifactKeyForInternalProof: the governed internal proof this requirement
  // binds, derived from what the AUTHORIZED ENVELOPE can actually do. A semantic
  // requirement starts proof-free (R3 A1); when the model proposes a capability
  // whose envelope may mutate company state, proof binds to the objective's real
  // controlled artifact (read fresh by the caller) so artifact-producing work can
  // never be satisfied by advice alone. Everything else stays proof-free here;
  // strategy-derived proofs attach at authorization (decision.ts).
  const artifactKeyForInternalProof = requiredPermissions.includes(
    "update_company_artifact",
  )
    ? (reads.artifactKeyForInternalProof ?? null)
    : null;

  const grant = reads.grant;
  const budget = reads.budget;

  return {
    ok: true,
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
    },
  };
}
