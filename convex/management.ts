"use strict";

// CP7 — Production Convex-backed ManagementPorts adapter.
//
// Every port reads Convex fresh on each call (the reload rule). No caching.
// External authority defaults to "m3_unavailable"; the recommendation seam is
// injected and defaults to deterministic null (which parseManagerialRecommendation
// parses into a typed refusal).
//
// Storage homes:
//   - Grounded options: inside managerialDecisions rows' data column (extra
//     field `options` alongside the ManagerialDecision shape).
//   - Completion verdicts: inside managerialDecisions rows with kind
//     "completion_proposal" and decisionId "gate_<objectiveKey>_r<revision>".
//   - Pending approvals: inside the objective row's management.controlNotes
//     array as entries with type "pending_approval".

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

import { buildManagementGraph } from "../lib/management/graph";
import type { ManagementPorts } from "../lib/management/graph";
import { runManagerialDecisionPass } from "../lib/management/decision";
import type { DecisionPassResult } from "../lib/management/decision";
import type { FounderSpendGrant } from "./internal/workforce";
import { evaluateCompletionGate } from "../lib/management/completion";
import { attemptRequirementSatisfaction } from "../lib/management/requirements";
import type { ProofFacts, RequirementEvent } from "../lib/management/requirements";
import { checkBudget } from "../lib/management/budget";
import { EMPTY_FACTS } from "../lib/management/options";
import type {
  Assignment,
  BudgetVerdict,
  CompletionProposal,
  CompletionVerdict,
  ExecutionIntent,
  GraphOutcome,
  GraphState,
  GroundedOption,
  ManagementState,
  ObjectiveBudget,
  OutcomeContract,
  Requirement,
  WakeEvent,
  WakeReason,
  WorkerRecord,
} from "../lib/management/types";

// ── Module-level recommendation seam ─────────────────────────────────────────
// Default null → runDecisionPass passes recommend: async () => null.
// parseManagerialRecommendation(null) returns {ok:false} → typed refusal.

type RecommenderFn = (eligible: readonly GroundedOption[]) => Promise<unknown>;
let _recommender: RecommenderFn | null = null;

export function setManagementRecommender(fn: RecommenderFn | null): void {
  _recommender = fn;
}

// ── Row shape helpers (loose reads — the schema carries the real types) ──────

type AnyRow = { _id: unknown; [k: string]: unknown };

// ── The adapter ──────────────────────────────────────────────────────────────

export function buildConvexManagementPorts(ctx: MutationCtx): ManagementPorts {
  const ports: ManagementPorts = {
    // ── Authoritative reads ───────────────────────────────────────────────────

    async loadContract(objectiveKey: string): Promise<{ contract: OutcomeContract | null; currentContractRevision: number }> {
      const rows = await ctx.db
        .query("outcomeContracts")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
        .collect();
      if (rows.length === 0) return { contract: null, currentContractRevision: 0 };
      const latest = rows.reduce((max, row) => {
        const maxRev = (max as AnyRow).revision as number;
        const rowRev = (row as AnyRow).revision as number;
        return rowRev > maxRev ? row : max;
      });
      return {
        contract: (latest as AnyRow).data as OutcomeContract,
        currentContractRevision: (latest as AnyRow).revision as number,
      };
    },

    async loadRequirements(objectiveKey: string, revision: number): Promise<Requirement[]> {
      const rows = await ctx.db
        .query("requirements")
        .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", objectiveKey))
        .collect();
      return rows
        .filter((row) => ((row as AnyRow).data as Requirement).contractRevision === revision)
        .map((row) => (row as AnyRow).data as Requirement);
    },

    async loadGrounded(objectiveKey: string, revision: number): Promise<Map<string, GroundedOption[]>> {
      const rows = await ctx.db
        .query("managerialDecisions")
        .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", objectiveKey))
        .collect();
      const byKey = new Map<string, { at: number; options: GroundedOption[] }>();
      for (const row of rows) {
        const data = (row as AnyRow).data as Record<string, unknown>;
        if ((data.contractRevision as number) !== revision) continue;
        const key = data.requirementKey as string | undefined;
        if (!key) continue;

        // Decode options from coarsePlanSummary JSON
        let options: GroundedOption[] | undefined;
        try {
          const parsed = JSON.parse(data.coarsePlanSummary as string);
          if (parsed.extra && parsed.extra.options) {
            options = parsed.extra.options;
          }
        } catch {
          // If parsing fails, skip
          continue;
        }

        if (!options) continue;
        const at = data.at as number;
        const existing = byKey.get(key);
        if (!existing || at > existing.at) {
          byKey.set(key, { at, options });
        }
      }
      const result = new Map<string, GroundedOption[]>();
      for (const [key, value] of byKey) result.set(key, value.options);
      return result;
    },

    async loadAssignments(objectiveKey: string): Promise<Assignment[]> {
      const rows = await ctx.db
        .query("assignments")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
        .collect();
      return rows.map((row) => (row as AnyRow).data as Assignment);
    },

    async loadIntents(objectiveKey: string): Promise<ExecutionIntent[]> {
      const rows = await ctx.db
        .query("executionIntents")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
        .collect();
      return rows.map((row) => (row as AnyRow).data as ExecutionIntent);
    },

    async loadBudgetVerdict(objectiveKey: string, at: number): Promise<BudgetVerdict> {
      const budget = await ctx.runQuery(internal.internal.workforce.readBudget, { objectiveKey }) as ObjectiveBudget | null;
      if (!budget) return { ok: true };
      return checkBudget(budget, at);
    },

    async loadPendingApproval(objectiveKey: string): Promise<{ question: string } | null> {
      const row = await ctx.db
        .query("objectives")
        .withIndex("by_key", (q) => q.eq("key", objectiveKey))
        .unique();
      if (!row) return null;
      const data = (row as AnyRow).data as Record<string, unknown>;
      const mgmt = data.management as Record<string, unknown> | undefined;
      const notes = (mgmt?.controlNotes ?? []) as Array<Record<string, unknown>>;
      for (let i = notes.length - 1; i >= 0; i--) {
        if (notes[i].type === "pending_approval") return { question: notes[i].question as string };
      }
      return null;
    },

    async loadCompletionVerdict(objectiveKey: string): Promise<CompletionVerdict | null> {
      const rows = await ctx.db
        .query("managerialDecisions")
        .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", objectiveKey))
        .collect();
      const gateDecisions = rows.filter((row) => ((row as AnyRow).data as Record<string, unknown>).kind === "completion_proposal");
      if (gateDecisions.length === 0) return null;
      const latest = gateDecisions.reduce((max, row) => {
        const maxRev = ((max as AnyRow).data as Record<string, unknown>).contractRevision as number;
        const rowRev = ((row as AnyRow).data as Record<string, unknown>).contractRevision as number;
        return rowRev > maxRev ? row : max;
      });
      const latestData = (latest as AnyRow).data as Record<string, unknown>;
      // Decode verdict from coarsePlanSummary JSON
      try {
        const parsed = JSON.parse(latestData.coarsePlanSummary as string);
        if (parsed.gateVerdict) return parsed.gateVerdict as CompletionVerdict;
      } catch {
        // fall through
      }
      return null;
    },

    async loadWakeEvents(objectiveKey: string): Promise<WakeEvent[]> {
      const rows = await ctx.db
        .query("wakeEvents")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
        .collect();
      return rows.map((row) => (row as AnyRow).data as WakeEvent);
    },

    // ── Effects ───────────────────────────────────────────────────────────────

    async consumeWakeEvents(_objectiveKey: string, eventIds: string[], at: number): Promise<void> {
      await ctx.runMutation(internal.internal.workforce.markWakeConsumed, { eventIds, at });
    },

    async spendDecisionCall(objectiveKey: string, at: number): Promise<void> {
      await ctx.runMutation(internal.internal.workforce.initBudget, { objectiveKey, at });
      await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
        objectiveKey,
        spend: { kind: "decision", requirementKey: null, intentId: null, at },
      });
    },

    async runDecisionPass(state: GraphState, _ports: ManagementPorts, at: number): Promise<DecisionPassResult | null> {
      if (!state.focusRequirementKey) return null;

      const { contract, currentContractRevision } = await ports.loadContract(state.objectiveKey);
      if (!contract) return null;

      const requirements = await ports.loadRequirements(state.objectiveKey, currentContractRevision);
      const requirement = requirements.find((r) => r.requirementKey === state.focusRequirementKey);
      if (!requirement) return null;

      // Staffing: live inventory + creation allowed per budget worker ceiling
      const inventory = (await ctx.runQuery(internal.internal.workforce.listWorkers, {})) as WorkerRecord[];
      const workerCount = (await ctx.runQuery(internal.internal.workforce.countObjectiveWorkers, { objectiveKey: state.objectiveKey })) as number;
      const budget = (await ctx.runQuery(internal.internal.workforce.readBudget, { objectiveKey: state.objectiveKey })) as ObjectiveBudget | null;
      const creationAllowed = budget ? workerCount < budget.limits.maxWorkersCreated : true;

      // artifactKeyForInternalProof: derive from the requirement's governed proofs
      let artifactKeyForInternalProof: string | null = null;
      for (const proof of requirement.proofs) {
        if (proof.proofKind === "company_artifact_version" && proof.params.artifactKey) {
          artifactKeyForInternalProof = String(proof.params.artifactKey);
          break;
        }
      }

      // grounding.discovered: [] — live registry discovery is the CP2 sourcing seam and arrives as data
      //
      // R3 A4 — founder spend authority is READ, never assumed. No live grant
      // record ⇒ `null`, which the kernel treats as NO authority (fail closed),
      // not as an unlimited ceiling. The persisted budget ceiling stays a
      // separate, engine-side self-limit: `budgetRemainingUsd` measures the
      // objective's committed spend, `spendAuthorityUsd` measures what the
      // founder actually permitted.
      const grant = (await ctx.runQuery(internal.internal.workforce.activeSpendGrant, {
        objectiveKey: state.objectiveKey,
      })) as FounderSpendGrant | null;
      const result = await runManagerialDecisionPass({
        objectiveKey: state.objectiveKey,
        contract,
        currentContractRevision,
        requirementKey: requirement.requirementKey,
        requirementTitle: requirement.title,
        mustBeTrue: requirement.mustBeTrue,
        priority: requirement.priority,
        artifactKeyForInternalProof,
        staffing: {
          objectiveKey: state.objectiveKey,
          requirementKey: requirement.requirementKey,
          requiredCapabilityKeys: ["growth_launch_operations"],
          requiredPermissions: ["update_company_artifact"],
          expectedHoldMs: 60 * 60 * 1000,
          now: at,
          neededContextRefs: [],
          parallelismNeeded: 1,
          specializationNeeded: false,
          inventory,
          creationAllowed,
        },
        grounding: {
          // Live registry discovery is the CP2 sourcing seam and arrives as data;
          // until then, no external offerings are discovered.
          discovered: [],
          internalFacts: EMPTY_FACTS,
          factsForOffering: () => EMPTY_FACTS,
        },
        eligibilityFacts: {
          requiredResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "company_records", "company_tools"],
          controlledResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "company_records", "company_tools"],
          deadlineAt: null,
          now: at,
          estimatedMinutes: null,
          requiresMandatoryProof: true,
          proofAvailable: true,
          workerAvailable: null,
          spendAuthorityUsd: grant ? grant.limitUsd : null,
          budgetRemainingUsd: budget
            ? budget.limits.maxExternalSpendUsd - budget.used.externalSpendCommittedUsd
            : 0,
        },
        recommend: _recommender
          ? async (eligible) => _recommender!(eligible)
          : async () => null,
        at,
        decisionId: `dec_${state.objectiveKey}_${requirement.requirementKey}_${at}`,
        // R3 A4/I3 — persisted founder spend authority. `null` fails closed:
        // a monetary BUY/HYBRID cannot be authorized (and therefore cannot be
        // handed to the rail) until a founder grant record exists. Neither
        // value is invented here; both are read from storage.
        spendAuthorityUsd: grant ? grant.limitUsd : null,
        spendApprovalId: grant ? grant.approvalId : null,
        externalAuthority: "m3_unavailable",
        waiverRequested: false,
      });

      return result;
    },

    async persistDecision(result: DecisionPassResult, at: number): Promise<void> {
      const { decision, boundRequirement, options, recommendation } = result;

      // Encode extra data into coarsePlanSummary as JSON since the schema validator
      // doesn't allow extra fields in the data column
      const extraData = {
        options,
        boundRequirement,
        recommendation,
      };
      const decisionData = {
        ...decision,
        coarsePlanSummary: JSON.stringify({
          original: decision.coarsePlanSummary,
          extra: extraData,
        }),
      };

      await ctx.runMutation(internal.internal.workforce.putDecision, {
        objectiveKey: decision.objectiveKey,
        decisionId: decision.decisionId,
        data: decisionData,
      });

      // If bound requirement, persist it with currentContractRevision for stale-downsert protection
      if (boundRequirement) {
        await ctx.runMutation(internal.internal.workforce.putRequirement, {
          objectiveKey: boundRequirement.objectiveKey,
          requirementKey: boundRequirement.requirementKey,
          data: boundRequirement,
          currentContractRevision: boundRequirement.contractRevision,
        });
      }

      // If authorization requires approval, append a pending-approval control note
      if (result.authorization.kind === "approval_required") {
        const row = await ctx.db
          .query("objectives")
          .withIndex("by_key", (q) => q.eq("key", decision.objectiveKey))
          .unique();
        if (row) {
          const data = (row as AnyRow).data as Record<string, unknown>;
          const mgmt = (data.management ?? {}) as Record<string, unknown>;
          const notes = [...((mgmt.controlNotes ?? []) as Array<Record<string, unknown>>)];
          notes.push({
            type: "pending_approval",
            question: result.authorization.question,
            at,
          });
          await ctx.db.patch(row._id, {
            data: {
              ...data,
              management: {
                ...mgmt,
                contractId: (mgmt.contractId as string | null) ?? null,
                controlNotes: notes,
              },
            },
          } as any);
        }
      }
    },

    async recordSatisfactionAttempt(state: GraphState, requirementKey: string, at: number): Promise<void> {
      const { contract, currentContractRevision } = await ports.loadContract(state.objectiveKey);
      if (!contract) return;

      const requirements = await ports.loadRequirements(state.objectiveKey, currentContractRevision);
      const requirement = requirements.find((r) => r.requirementKey === requirementKey);
      if (!requirement) return;

      // Build ProofFacts from live Convex
      const evidenceRows = await ctx.db
        .query("evidence")
        .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", state.objectiveKey))
        .collect();
      const applicationObservationIds = evidenceRows
        .filter((row) => ((row as AnyRow).data as Record<string, unknown>).origin === "application_observation")
        .map((row) => (row as AnyRow).evidenceId as string);

      const intentRows = await ctx.db
        .query("executionIntents")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", state.objectiveKey))
        .collect();
      const verifiedIntentIds = intentRows
        .filter((row) => ((row as AnyRow).data as ExecutionIntent).state === "verified")
        .map((row) => (row as AnyRow).intentId as string);

      const objectiveRow = await ctx.db
        .query("objectives")
        .withIndex("by_key", (q) => q.eq("key", state.objectiveKey))
        .unique();
      const artifactVersions: Record<string, number> = {};
      if (objectiveRow) {
        const data = (objectiveRow as AnyRow).data as Record<string, unknown>;
        const artifacts = (data.companyArtifacts ?? []) as Array<Record<string, unknown>>;
        for (const artifact of artifacts) {
          artifactVersions[artifact.key as string] = artifact.version as number;
        }
      }

      const facts: ProofFacts = {
        artifactVersions,
        applicationObservationIds,
        verifiedIntentIds,
        founderConfirmationRefs: [],
      };

      // Determine event kind
      const assignmentRows = await ctx.db
        .query("assignments")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", state.objectiveKey))
        .collect();
      const acceptedAssignment = assignmentRows.find(
        (row) => {
          const d = (row as AnyRow).data as Assignment;
          return d.requirementKey === requirementKey && d.state === "verified";
        },
      );

      let event: RequirementEvent;
      if (acceptedAssignment) {
        event = {
          kind: "assignment_verified",
          assignmentId: (acceptedAssignment as AnyRow).assignmentId as string,
          contractRevision: currentContractRevision,
        };
      } else if (verifiedIntentIds.length > 0) {
        event = {
          kind: "external_result_verified",
          intentId: verifiedIntentIds[0],
          contractRevision: currentContractRevision,
        };
      } else {
        event = {
          kind: "assignment_run_finished",
          assignmentId: `synthetic_${requirementKey}`,
          runStopped: true,
        };
      }

      const attempt = attemptRequirementSatisfaction({
        requirement,
        event,
        facts,
        resolutionId: `res_${requirementKey}_${at}`,
        acceptedDecisionId: null,
        acceptedAssignmentId: acceptedAssignment
          ? ((acceptedAssignment as AnyRow).assignmentId as string)
          : null,
        acceptedIntentId: verifiedIntentIds[0] ?? null,
        proofRefs: [...applicationObservationIds, ...verifiedIntentIds],
        currentContractRevision,
        at,
      });

      if (attempt.satisfied) {
        await ctx.runMutation(internal.internal.workforce.putRequirement, {
          objectiveKey: requirement.objectiveKey,
          requirementKey: requirement.requirementKey,
          data: attempt.requirement,
          currentContractRevision,
        });
      }
      // If not satisfied (including assignment_run_finished refusal), persist nothing.
    },

    async proposeCompletion(proposal: CompletionProposal, at: number): Promise<CompletionVerdict> {
      const { contract, currentContractRevision } = await ports.loadContract(proposal.objectiveKey);
      if (!contract) {
        // No contract → rejected verdict WITHOUT persisting
        return {
          accepted: false,
          objectiveState: "planning",
          unmet: ["no Outcome Contract persisted"],
        };
      }

      const requirements = await ports.loadRequirements(proposal.objectiveKey, currentContractRevision);

      // satisfiedProofKeys: from requirement rows' resolutions bound to current revision
      const satisfiedProofKeys = new Map<string, string[]>();
      for (const req of requirements) {
        if (req.resolution && req.resolution.contractRevision === currentContractRevision) {
          satisfiedProofKeys.set(req.requirementKey, req.resolution.proofRefs);
        }
      }

      // Unresolved effects/resources from open executionIntents awaiting M3
      const intents = await ports.loadIntents(proposal.objectiveKey);
      const unresolvedEffectIds = intents
        .filter((intent) => intent.kind === "external_effect" && intent.state !== "verified" && intent.state !== "failed")
        .map((intent) => intent.intentId);
      const unresolvedResourceIds = intents
        .filter((intent) => intent.kind === "external_acquisition" && intent.state !== "verified" && intent.state !== "failed")
        .map((intent) => intent.intentId);

      const verdict = evaluateCompletionGate({
        proposal,
        contract,
        currentContractRevision,
        requirements,
        satisfiedProofKeys,
        unresolvedEffectIds,
        unresolvedResourceIds,
        at,
      });

      // Persist the verdict: putDecision with decisionId gate_<objectiveKey>_r<revision>
      // Encode verdict+proposal into coarsePlanSummary since the schema validator
      // doesn't allow extra fields in the data column
      const decisionId = `gate_${proposal.objectiveKey}_r${currentContractRevision}`;
      await ctx.runMutation(internal.internal.workforce.putDecision, {
        objectiveKey: proposal.objectiveKey,
        decisionId,
        data: {
          decisionId,
          objectiveKey: proposal.objectiveKey,
          contractRevision: currentContractRevision,
          requirementKey: "",
          kind: "completion_proposal" as const,
          strategy: null,
          optionId: null,
          recommendation: null,
          authorization: {
            kind: "refused" as const,
            requirementKey: "",
            contractRevision: currentContractRevision,
            reasons: ["unknown" as const],
            detail: "completion proposal placeholder",
          },
          coarsePlanSummary: JSON.stringify({ gateVerdict: verdict, gateProposal: proposal }),
          consideredOptionIds: [],
          at,
        },
      });

      return verdict;
    },

    async writeObjectiveState(objectiveKey: string, state: ManagementState, summary: string, at: number): Promise<void> {
      const row = await ctx.db
        .query("objectives")
        .withIndex("by_key", (q) => q.eq("key", objectiveKey))
        .unique();
      if (!row) return;
      const data = (row as AnyRow).data as Record<string, unknown>;
      const mgmt = (data.management ?? {}) as Record<string, unknown>;
      const notes = [...((mgmt.controlNotes ?? []) as Array<Record<string, unknown>>)];
      notes.push({ type: "control_state", state, summary, at });
      await ctx.db.patch(row._id, {
        data: {
          ...data,
          management: {
            ...mgmt,
            contractId: (mgmt.contractId as string | null) ?? null,
            controlNotes: notes,
          },
        },
      } as any);
    },

    async scheduleWake(objectiveKey: string, reason: WakeReason, _at: number): Promise<void> {
      await ctx.scheduler.runAfter(0, internal.management.runManagementPass, {
        objectiveKey,
        reason,
      });
    },
  };

  return ports;
}

// ── The scheduled entry point ────────────────────────────────────────────────

export const runManagementPass = internalMutation({
  args: {
    objectiveKey: v.string(),
    reason: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<GraphOutcome> => {
    // Load the objective row (typed loose read)
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();

    if (!row) {
      return {
        objectiveState: "recovery_required" as ManagementState,
        acted: false,
        nextWakeExpected: null,
        summary: "objective row missing",
      };
    }

    const ports = buildConvexManagementPorts(ctx);
    const graph = buildManagementGraph({ ports, now: () => Date.now() });

    const { outcome } = await graph.invoke({
      objectiveKey: args.objectiveKey,
      contractRevision: null,
      focusRequirementKey: null,
      managerDecisionId: null,
      pendingIntentId: null,
      wakeReason: args.reason as WakeReason,
      wakeEventIds: [],
      continuation: {},
      lastNode: null,
      pass: 0,
    });

    return outcome;
  },
});
