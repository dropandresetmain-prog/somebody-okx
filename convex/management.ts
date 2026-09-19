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
import { interpretObjective } from "../lib/management/interpretation";
import { planWakeForInterpretation, planWakeForTimer } from "../lib/management/wakes";
import {
  advanceAssignment,
  buildAssignmentContract,
  deriveAssignmentId,
  deriveRunId,
  dispatchTargets,
  targetWorkerKey,
} from "../lib/management/dispatch";
import { createIntentFromAuthorization } from "../lib/management/intents";
import type { ExternalAuthorityMode } from "../lib/management/authorization";
import { createWorkerSpec } from "../lib/workforce/workers";
import { evaluateCompletionGate } from "../lib/management/completion";
import { bindExecutedProofParams } from "../lib/management/contract";
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

// The M3 buyer rail is not integrated in M4. One constant states it, so both
// the decision pass and the dispatch seam share the SAME truth instead of
// repeating a string literal (and so nobody "fixes" one without the other).
const EXTERNAL_AUTHORITY_MODE: ExternalAuthorityMode = "m3_unavailable";

// ── Bounded control notes (R3 A3, persistence side) ─────────────────────────
//
// Control notes are the read model's "what is the engine doing and why" trail.
// They are NOT business truth — contracts, requirements, decisions, assignments
// and intents are — so this list may be bounded without losing any authority.
// Before CP8 it grew unboundedly: every pass appended a `control_state` note and
// every approval-required decision appended another, on a loop that re-woke
// itself at zero delay.
//
// Two rules fix that without deleting history wholesale:
//   1. same identity ⇒ REPLACE in place (advancing `at`), so a state that has
//      not changed does not add a row;
//   2. hard ceiling, oldest first, so a long-running objective cannot grow the
//      aggregate without bound.
export const CONTROL_NOTE_LIMIT = 40;

function noteIdentity(note: Record<string, unknown>): string {
  const type = String(note.type ?? "note");
  // The identity of a control note is its MEANING, not its timestamp: two notes
  // that say the same thing are one note.
  switch (type) {
    case "control_state":
      return `control_state:${String(note.state ?? "")}`;
    case "pending_approval":
      return `pending_approval:${String(note.question ?? "").slice(0, 120)}`;
    case "contract_interpreted":
      return `contract_interpreted:${String(note.contractId ?? "")}`;
    case "interpretation_refused":
      return `interpretation_refused:${String(note.attempt ?? "")}`;
    case "wake_scheduled":
      return `wake_scheduled:${String(note.reason ?? "")}:${String(note.timerKey ?? "")}`;
    default:
      // Unknown shapes fall back to their own keys, sorted, minus the timestamp.
      return `${type}:${Object.keys(note)
        .filter((key) => key !== "at")
        .sort()
        .map((key) => `${key}=${JSON.stringify(note[key])}`)
        .join(",")
        .slice(0, 200)}`;
  }
}

export function boundNotes(
  existing: unknown,
  note: Record<string, unknown>,
): Record<string, unknown>[] {
  const notes = Array.isArray(existing)
    ? (existing as Array<Record<string, unknown>>)
    : [];
  const identity = noteIdentity(note);
  // Replace the newest note with the same identity, preserving its position so
  // an unchanged state does not jump to the end every pass.
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (noteIdentity(notes[i]) === identity) {
      const merged = [...notes];
      merged[i] = note;
      return merged.slice(-CONTROL_NOTE_LIMIT);
    }
  }
  return [...notes, note].slice(-CONTROL_NOTE_LIMIT);
}

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
        externalAuthority: EXTERNAL_AUTHORITY_MODE,
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

    async recordSatisfactionAttempt(state: GraphState, requirementKey: string, at: number): Promise<boolean> {
      const { contract, currentContractRevision } = await ports.loadContract(state.objectiveKey);
      if (!contract) return false;

      const requirements = await ports.loadRequirements(state.objectiveKey, currentContractRevision);
      const requirement = requirements.find((r) => r.requirementKey === requirementKey);
      if (!requirement) return false;

      // R3 A5 — the facts the kernel judges are the CURRENT revision's, scoped
      // through a live delivery (an assignment for this requirement, or an
      // intent FOR THIS REQUIREMENT). Never "whatever is lying around".
      const facts = await readScopedProofFacts(ctx, state.objectiveKey, requirement, currentContractRevision);
      // A wake re-delivery recomputes against the same requirement, which may
      // now carry bindings from the verification pass BEFORE this one;
      // re-binding is idempotent (a bound proof is never re-pointed).
      const bound = bindExecutedProofParams(requirement, facts, at);

      // Determine the event from live delivery rows SCOPED to this requirement
      // and revision. R3 A5: `result_submitted` is not satisfaction, but it IS
      // the thing the verify pass exists to check — and only the application's
      // own re-derived facts decide whether it passes. A submitted row whose
      // proofs recompute gets advanced to `verified` HERE, in the same
      // transaction that records the resolution; nothing else may.
      const assignmentRows = await ctx.db
        .query("assignments")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", state.objectiveKey))
        .collect();
      const scoped = assignmentRows
        .map((row) => (row as AnyRow).data as Assignment)
        .filter(
          (a) =>
            a.requirementKey === requirementKey &&
            a.contractRevision === currentContractRevision,
        );
      const verifiedAssignment = scoped.find((a) => a.state === "verified") ?? null;
      const submittedAssignment = verifiedAssignment
        ? null
        : (scoped
            .filter((a) => a.state === "result_submitted")
            .sort((a, b) => a.assignmentId.localeCompare(b.assignmentId))[0] ?? null);
      const acceptedAssignment = verifiedAssignment ?? submittedAssignment;
      // `verifiedIntentIds` in scoped facts is ALREADY requirement- and
      // revision-filtered (see readScopedProofFacts) — the sorted first id is
      // a deterministic pick, never "whatever row came back first".
      const verifiedIntentId = [...facts.verifiedIntentIds].sort()[0] ?? null;

      let event: RequirementEvent;
      if (acceptedAssignment) {
        event = {
          kind: "assignment_verified",
          assignmentId: acceptedAssignment.assignmentId,
          contractRevision: currentContractRevision,
        };
      } else if (verifiedIntentId) {
        event = {
          kind: "external_result_verified",
          intentId: verifiedIntentId,
          contractRevision: currentContractRevision,
        };
      } else {
        event = {
          kind: "assignment_run_finished",
          assignmentId: `synthetic_${requirementKey}`,
          runStopped: true,
        };
      }

      // The bindings go to storage WHETHER OR NOT the attempt passes: they
      // restate where the existing obligations point (ids the application
      // verified), and the completion gate re-derives proof against THIS
      // revision — carrying a stale claim into a new revision gains nothing.
      if (bound.proofs.some((proof, index) => proof !== requirement.proofs[index])) {
        await ctx.runMutation(internal.internal.workforce.putRequirement, {
          objectiveKey: bound.objectiveKey,
          requirementKey: bound.requirementKey,
          data: bound,
          currentContractRevision,
        });
      }

      const attempt = attemptRequirementSatisfaction({
        requirement: bound,
        event,
        facts,
        resolutionId: `res_${requirementKey}_${at}`,
        acceptedDecisionId: null,
        acceptedAssignmentId: acceptedAssignment ? acceptedAssignment.assignmentId : null,
        acceptedIntentId: verifiedIntentId,
        proofRefs: [...facts.applicationObservationIds, ...facts.verifiedIntentIds],
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
        // The delivery that carried this proof is now application-verified:
        // the assignment row follows the resolution in the same transaction,
        // the worker returns to the shelf, and the active-assignment slot is
        // released. A replay finds `verified` and the kernel no-ops.
        if (submittedAssignment) {
          const moved = advanceAssignment(
            submittedAssignment,
            "verified",
            at,
            { resultSummary: "application-verified against the current revision's proof obligations" },
          );
          if (moved.ok) {
            await ctx.runMutation(internal.internal.workforce.putAssignment, {
              assignmentId: submittedAssignment.assignmentId,
              objectiveKey: state.objectiveKey,
              data: moved.assignment,
            });
            await ctx.runMutation(internal.internal.workforce.recordVerifiedAssignment, {
              workerKey: submittedAssignment.workerKey,
              record: {
                assignmentId: submittedAssignment.assignmentId,
                objectiveKey: state.objectiveKey,
                requirementKey: submittedAssignment.requirementKey,
                capabilityKeys: [...submittedAssignment.workContract.capabilityKeys],
                outcome: "accepted",
                summary: moved.assignment.resultSummary ?? "verified",
                at,
              },
              at,
            });
          }
          await ctx.runMutation(internal.internal.workforce.releaseWorker, {
            workerKey: submittedAssignment.workerKey,
            assignmentId: submittedAssignment.assignmentId,
            at,
          });
          await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
            objectiveKey: state.objectiveKey,
            spend: { kind: "assignment_finish", requirementKey: null, intentId: null, at },
          });
        }
        // The KERNEL's verdict, reported for progress accounting only.
        return true;
      }
      // If not satisfied (including assignment_run_finished refusal), persist nothing.
      return false;
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

      // R3 A5 — reload the CURRENT revision fresh and RECOMPUTE every required
      // proof against scoped application facts. The gate's input is facts, not
      // the persisted resolutions: a row whose stored `state`/`resolution` says
      // "satisfied" but whose proofs do not recompute NOW is refused out loud,
      // and a legitimately satisfied row passes on its proofs, not its prose.
      const requirements = await ports.loadRequirements(proposal.objectiveKey, currentContractRevision);

      const factsByRequirementKey = new Map<string, ProofFacts>();
      for (const requirement of requirements) {
        if (requirement.contractRevision !== currentContractRevision) continue;
        factsByRequirementKey.set(
          requirement.requirementKey,
          await readScopedProofFacts(ctx, proposal.objectiveKey, requirement, currentContractRevision),
        );
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
        factsByRequirementKey,
        unresolvedEffectIds,
        unresolvedResourceIds,
        at,
      });

      // R3 A5 — the rejected verdict is PERSISTED below (the gate decision row)
      // and the reducer honours it: rule 7a routes "gate rejected with every
      // required row claiming satisfied" to recovery_required, so a forged
      // `satisfied` can neither complete the objective nor re-propose. No new
      // write authority is invented here — the engine only ever READS claims
      // and re-DERIVES; rejection is loud and durable, never self-healing.

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

    // ── R3 A3: a TIMER, never a re-wake ────────────────────────────────────────
    //
    // The rule this enforces: (a) the delay must be non-zero, (b) at most ONE
    // outstanding timer per logical condition, (c) arming the next one requires
    // the previous to have been CONSUMED by a real pass, so a timer can never
    // fan out into a swarm, and (d) the wake it appends is `timeout`, which the
    // graph classifies as a SELF wake and therefore counts as no progress.
    async scheduleTimer(objectiveKey, reason, delayMs, timerKey, at): Promise<boolean> {
      if (delayMs <= 0)
        throw new Error(`scheduleTimer requires a non-zero delay (got ${delayMs}ms for ${timerKey})`);
      const state = (await ctx.runQuery(internal.internal.workforce.timerState, {
        objectiveKey,
        timerKey,
      })) as { outstanding: boolean; armed: number };
      // One outstanding timer per condition. A previous one already consumed
      // means this is sequence+1 — a genuinely new deadline, not a duplicate.
      if (state.outstanding) return false;
      const wake = planWakeForTimer({
        objectiveKey,
        timerKey,
        sequence: state.armed + 1,
        at,
      });
      const appended = (await ctx.runMutation(internal.internal.workforce.appendWakeEvent, {
        eventId: wake.eventId,
        objectiveKey,
        dedupeKey: wake.dedupeKey,
        data: wake.event,
      })) as { ok: boolean; duplicate?: boolean };
      if (!appended.ok) return false;
      await ctx.scheduler.runAfter(delayMs, internal.management.runManagementPass, {
        objectiveKey,
        reason,
      });
      return true;
    },

    // R3 A3 — the pass result is recorded against the PERSISTED no-progress
    // budget, which is what makes the finite ceiling reachable at all.
    async recordPassProgress(objectiveKey, progressed, at): Promise<void> {
      await ctx.runMutation(internal.internal.workforce.applyPassProgress, {
        objectiveKey,
        progressed,
        at,
      });
    },

    // ── R3 A2: dispatch — make an authorized plan real, exactly once ───────────
    //
    // Zero production callers existed before CP8: `reserveWorker`, `putAssignment`,
    // `createIntentFromAuthorization` and `putIntent` were reachable only from
    // tests. This is the seam. It holds NO authority of its own: it reads the
    // persisted AUTHORIZED decision (never re-decides), derives effect identities
    // from that decision's stable business identity, and defers rather than
    // duplicating. A replayed wake therefore cannot create a second assignment,
    // a second intent, or a second run.
    async dispatchRequirement(state, requirementKey, at): Promise<string | null> {
      const { contract, currentContractRevision } = await ports.loadContract(state.objectiveKey);
      if (!contract) return null;
      const requirements = await ports.loadRequirements(state.objectiveKey, currentContractRevision);
      const requirement = requirements.find((r) => r.requirementKey === requirementKey);
      if (!requirement || requirement.state !== "active" || requirement.strategy === null)
        return null;

      const persisted = (await ctx.runQuery(internal.internal.workforce.latestAuthorizedDecision, {
        objectiveKey: state.objectiveKey,
        requirementKey,
        contractRevision: currentContractRevision,
      })) as AuthorizedDecisionRow | null;
      if (!persisted)
        return await noteDispatchDeferred(ctx, state.objectiveKey, requirementKey, at,
          "no authorized decision row exists for the current revision");

      // The option the authorization names is recovered from that same decision
      // row (persistDecision stores the grounded set with it), so the dispatch
      // acts on the option the application actually built — never a new one.
      const option = (decodeOptions(persisted.coarsePlanSummary).find(
        (candidate) => candidate.optionId === persisted.authorization.optionId,
      ) ?? null) as GroundedOption | null;
      if (!option)
        return await noteDispatchDeferred(ctx, state.objectiveKey, requirementKey, at,
          `authorized option ${persisted.authorization.optionId} is not recorded on its decision`);

      const targets = dispatchTargets(persisted.authorization, option);
      let effectId: string | null = null;
      for (const target of targets) {
        if (!target.ok)
          return await noteDispatchDeferred(ctx, state.objectiveKey, requirementKey, at, target.reason);
        effectId = target.kind === "internal"
          ? await dispatchInternal(ctx, state.objectiveKey, requirement, persisted, option, at)
          : await dispatchExternal(ctx, state.objectiveKey, persisted, option, at);
        // A null means "deferred, nothing written" — stop and let a later,
        // meaningful wake finish the job rather than half-delivering a HYBRID.
        if (effectId === null) return null;
      }
      return effectId;
    },
  };

  return ports;
}

// ── The scheduled entry point ────────────────────────────────────────────────

// R3 A5 — before a pass reads ANY delivery row, the assignments are reconciled
// against what the run actually did. `finishRun`/`expireRun` own the runtime
// aggregate; they must not also own M4 bookkeeping, but until now NOTHING did,
// so `result_submitted` was unreachable from a real wake: the verify node could
// only route rows someone hand-placed. Attribution is by run identity (the
// assignment's own `runId` inside the aggregate's work items), the transitions
// are exactly the legal ones from the dispatch kernel, and failed bookkeeping
// releases the worker and the active-assignment slot the same way a failed
// dispatch does. Reconciling twice is a no-op: each transition consumes the
// condition that triggered it.
async function reconcileAssignmentRunFacts(ctx: MutationCtx, objectiveKey: string, at: number): Promise<void> {
  const row = await ctx.db
    .query("objectives")
    .withIndex("by_key", (q) => q.eq("key", objectiveKey))
    .unique();
  if (!row) return;
  const record = (row as AnyRow).data as Record<string, unknown>;
  const workItems = (record.workItems ?? []) as Array<{
    state: string;
    runs: Array<{ id: string; status: string }>;
  }>;

  const assignmentRows = await ctx.db
    .query("assignments")
    .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
    .collect();

  for (const raw of assignmentRows) {
    const assignment = (raw as AnyRow).data as Assignment;
    if (assignment.state !== "running" && assignment.state !== "dispatched") continue;
    if (!assignment.runId) continue;
    const wi = workItems.find((item) => item.runs.some((run) => run.id === assignment.runId));
    const run = wi?.runs.find((candidate) => candidate.id === assignment.runId);
    if (!wi || !run) continue;

    let next: Assignment["state"] | null = null;
    if (run.status === "failed" || wi.state === "failed") next = "failed";
    else if (run.status === "stopped" && wi.state === "completed") next = "result_submitted";
    else if (assignment.state === "dispatched" && run.status === "running") next = "running";
    if (!next) continue;

    const moved = advanceAssignment(
      assignment,
      next,
      at,
      next === "failed" ? { resultSummary: `run ${run.id} ended failed; the engine records it, the budget bounds retries` } : {},
    );
    if (!moved.ok) continue;
    await ctx.runMutation(internal.internal.workforce.putAssignment, {
      assignmentId: assignment.assignmentId,
      objectiveKey,
      data: moved.assignment,
    });
    if (next === "failed") {
      await ctx.runMutation(internal.internal.workforce.releaseWorker, {
        workerKey: assignment.workerKey,
        assignmentId: assignment.assignmentId,
        at,
      });
      await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
        objectiveKey,
        spend: { kind: "assignment_finish", requirementKey: null, intentId: null, at },
      });
    }
  }
}

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

    // R3 A5 — delivery rows reflect RUN FACTS before the graph reads them, so
    // the verify node routes real submitted/failed results, not hand-placed
    // ones. This is bookkeeping-only: it never starts, stops, or re-decides
    // work, and every transition it makes is one the dispatch kernel already
    // declared legal.
    await reconcileAssignmentRunFacts(ctx, args.objectiveKey, Date.now());

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

// ── R3 A1: the interpretation entry — where an Objective becomes managed ─────
//
// Before CP8 no production path created an Outcome Contract, persisted
// Requirements, or set `management.contractId`, so every downstream kernel was
// unreachable from `submitObjective`. This closes that seam durably:
//
//   submitObjective (mutation) → schedule proposeInterpretation (action, real
//   model, "use node") → applyInterpretation (this mutation) → persist contract
//   + semantic requirements + management.contractId → appendWakeEvent
//   (objective_submitted, deduped by interpretation identity) → schedule
//   runManagementPass.
//
// The model is only ever an INPUT here: `interpretObjective` re-parses its raw
// output through the same bounded parsers the pure tests use, and this mutation
// writes only what those parsers accept. A rejected interpretation leaves the
// objective exactly as it was — with a typed detail, never a partial contract.

export const applyInterpretation = internalMutation({
  args: {
    objectiveKey: v.string(),
    requestId: v.string(),
    rawContract: v.any(),
    rawRequirements: v.any(),
    founderResolvedQuestions: v.array(v.string()),
    at: v.number(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      contractId: v.string(),
      requirementKeys: v.array(v.string()),
      notes: v.array(v.string()),
    }),
    v.object({ ok: v.literal(false), errors: v.array(v.string()) }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    if (!row) return { ok: false as const, errors: ["objective row missing"] };

    const data = (row as AnyRow).data as Record<string, unknown>;
    const mgmt = (data.management ?? {}) as Record<string, unknown>;
    // Idempotent replay: an interpretation already applied for this objective is
    // not applied twice. The wake/scheduler can redeliver; the contract cannot
    // be silently re-interpreted underneath a running engine.
    if (typeof mgmt.contractId === "string" && mgmt.contractId) {
      return {
        ok: true as const,
        contractId: mgmt.contractId,
        requirementKeys: [],
        notes: ["interpretation already applied for this objective"],
      };
    }

    const interpreted = interpretObjective({
      objectiveKey: args.objectiveKey,
      requestId: args.requestId,
      rawContract: args.rawContract,
      rawRequirements: args.rawRequirements,
      founderResolvedQuestions: args.founderResolvedQuestions,
      at: args.at,
    });
    if (!interpreted.ok) {
      // Typed refusal, persisted as a cursor so the loop cannot retry-storm a
      // model that keeps producing unusable output.
      await ctx.db.patch(row._id, {
        data: {
          ...data,
          management: {
            ...mgmt,
            contractId: null,
            interpretationStatus: "refused",
            interpretationRequestId: args.requestId,
            interpretationAttempts: ((mgmt.interpretationAttempts as number | undefined) ?? 0) + 1,
            interpretationDetail: interpreted.errors.join("; ").slice(0, 600),
            controlNotes: boundNotes(mgmt.controlNotes, {
              type: "interpretation_refused",
              errors: interpreted.errors.slice(0, 6),
              at: args.at,
            }),
          },
        },
      } as never);
      return { ok: false as const, errors: interpreted.errors };
    }

    const { contract, requirements, notes } = interpreted;

    await ctx.runMutation(internal.internal.workforce.putContract, {
      objectiveKey: args.objectiveKey,
      contractId: contract.contractId,
      revision: contract.revision,
      data: contract,
    });
    for (const requirement of requirements) {
      await ctx.runMutation(internal.internal.workforce.putRequirement, {
        objectiveKey: args.objectiveKey,
        requirementKey: requirement.requirementKey,
        data: requirement,
      });
    }
    // Budget row: the engine's ceilings exist from the moment work is managed.
    await ctx.runMutation(internal.internal.workforce.initBudget, {
      objectiveKey: args.objectiveKey,
      at: args.at,
    });

    // THE seam R3 said was missing: management.contractId now points at the
    // current contract, so the spine treats this row as M4-managed and the pass
    // can load contract + requirements from it.
    await ctx.db.patch(row._id, {
      data: {
        ...data,
        management: {
          ...mgmt,
          contractId: contract.contractId,
          currentContractRevision: contract.revision,
          interpretationStatus: "done",
          interpretationRequestId: args.requestId,
          interpretationDetail: null,
          controlNotes: boundNotes(mgmt.controlNotes, {
            type: "contract_interpreted",
            contractId: contract.contractId,
            revision: contract.revision,
            requirements: requirements.map((requirement) => requirement.requirementKey),
            at: args.at,
          }),
        },
      },
    } as never);
    await ctx.db.insert("objectiveEvents", {
      objectiveKey: args.objectiveKey,
      data: {
        at: args.at,
        kind: "decision",
        text: `Outcome Contract ${contract.contractId} recorded with ${requirements.length} requirement(s); minimum completion bar is "${contract.minimumCompletionBar}".`,
      },
    });

    // Durable wake: identity is the interpretation, so a replayed application
    // cannot start a second management loop.
    const wake = planWakeForInterpretation({
      objectiveKey: args.objectiveKey,
      contractId: contract.contractId,
      at: args.at,
    });
    await ctx.runMutation(internal.internal.workforce.appendWakeEvent, {
      eventId: wake.eventId,
      objectiveKey: args.objectiveKey,
      dedupeKey: wake.dedupeKey,
      data: wake.event,
    });
    await ctx.scheduler.runAfter(0, internal.management.runManagementPass, {
      objectiveKey: args.objectiveKey,
      reason: "objective_submitted",
    });

    return {
      ok: true as const,
      contractId: contract.contractId,
      requirementKeys: requirements.map((requirement) => requirement.requirementKey),
      notes,
    };
  },
});

// R3 I2 — a Convex MUTATION cannot perform the production network model call,
// and a module-global injected recommender is not a production architecture: it
// only exists while one process happens to hold it. So the interpretation seam
// is the durable three-step the platform requires:
//
//   beginInterpretation (this mutation)  → loads and grounds the request, and
//                                         RESERVES the pass identity by writing
//                                         the pending cursor. Only one action
//                                         may be in flight per objective, and a
//                                         replayed wake cannot start a second.
//   proposeInterpretation (action, "use node") → the ONLY step that talks to a
//                                         real model. It never mutates business
//                                         truth; it returns raw proposal data.
//   applyInterpretation (mutation above)  → reloads fresh state, parses
//                                         deterministically, persists, wakes.
//
// Malformed output, an outage, or a nonexistent option therefore all land as
// typed refusals persisted on the objective — never as an exception that corrupts
// state, and never as a silently skipped interpretation.

export const BEGIN_INTERPRETATION_CEILING = 2;

export const beginInterpretation = internalMutation({
  args: { objectiveKey: v.string(), at: v.number() },
  returns: v.union(
    v.object({
      proceed: v.literal(true),
      requestId: v.string(),
      request: v.string(),
      resolvedQuestions: v.array(v.string()),
    }),
    v.object({
      proceed: v.literal(false),
      reason: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    if (!row) return { proceed: false as const, reason: "objective row missing" };

    const data = (row as AnyRow).data as Record<string, unknown>;
    const mgmt = (data.management ?? {}) as Record<string, unknown>;
    if (typeof mgmt.contractId === "string" && mgmt.contractId)
      return { proceed: false as const, reason: "already interpreted" };
    if (mgmt.interpretationStatus === "pending")
      return { proceed: false as const, reason: "interpretation already in flight" };
    const attempts = (mgmt.interpretationAttempts as number | undefined) ?? 0;
    if (attempts >= BEGIN_INTERPRETATION_CEILING)
      return {
        proceed: false as const,
        reason: `interpretation ceiling reached (${attempts}/${BEGIN_INTERPRETATION_CEILING}); founder input required`,
      };

    const request = typeof data.request === "string" ? data.request : "";
    if (!request.trim())
      return { proceed: false as const, reason: "objective carries no request text" };

    // The request id IS the reservation: derived from objective + attempt count,
    // so it is stable across a replayed delivery of the same attempt and can
    // never collide with a later one.
    const requestId = `interpret_${args.objectiveKey}_a${attempts + 1}`;
    await ctx.db.patch(row._id, {
      data: {
        ...data,
        management: {
          ...mgmt,
          contractId: (mgmt.contractId as string | null) ?? null,
          interpretationStatus: "pending",
          interpretationRequestId: requestId,
          interpretationAttempts: attempts + 1,
        },
      },
    } as never);

    // Founder answers recorded so far, so a re-interpretation after a resolved
    // ambiguity keeps its risk-based handling instead of re-asking.
    const resolved = notesOfType(mgmt.controlNotes, "founder_answer").map(
      (note) => String(note.question ?? ""),
    );
    // Durable continuation of the chain. The reservation is written BEFORE this
    // is scheduled, so a pass that dies between the two steps leaves a `pending`
    // cursor rather than a silent gap, and a replayed wake cannot reserve twice.
    await ctx.scheduler.runAfter(0, internal.objectiveRunner.proposeInterpretation, {
      objectiveKey: args.objectiveKey,
      requestId,
      request,
      founderResolvedQuestions: resolved,
    });
    return {
      proceed: true as const,
      requestId,
      request,
      resolvedQuestions: resolved,
    };
  },
});

function notesOfType(existing: unknown, type: string): Array<Record<string, unknown>> {
  const notes = Array.isArray(existing) ? (existing as Array<Record<string, unknown>>) : [];
  return notes.filter((note) => note.type === type);
}

// ── R3 A2: the dispatch seam's helpers ──────────────────────────────────────
//
// A dispatch that cannot be honoured is NOT a silent no-op: the reason is
// recorded where the read model shows it, and the objective then rests. It is
// the reducer's own `await_wake`/`blocked` path plus the persisted no-progress
// ceiling that stops a repeated deferral from becoming a loop.

const DISPATCH_HOLD_MS = 60 * 60 * 1000;

type AuthorizedDecisionRow = {
  decisionId: string;
  requirementKey: string;
  contractRevision: number;
  coarsePlanSummary: string;
  authorization: Extract<import("../lib/management/types").AuthorizationResult, { kind: "authorized" }>;
};

// The option set is stored on its own decision row by `persistDecision`; the
// dispatcher reads it back rather than rebuilding it, so what gets dispatched is
// what the application actually grounded.
function decodeOptions(summary: string): GroundedOption[] {
  try {
    const parsed = JSON.parse(summary) as { extra?: { options?: GroundedOption[] } };
    return parsed.extra?.options ?? [];
  } catch {
    return [];
  }
}

// ── R3 A5: scoped proof facts ────────────────────────────────────────────────
//
// The ONE way the satisfaction kernel and the completion gate learn what is
// factually provable for a requirement. Everything here names a row the
// APPLICATION persisted, and everything is SCOPED to this requirement's own
// live deliveries at the current revision:
//   - observations: evidence rows whose `origin` the runtime itself wrote,
//     produced by a run belonging to an assignment FOR THIS REQUIREMENT;
//   - verified intents: `state === "verified"` rows FOR THIS REQUIREMENT AND
//     REVISION (only M3 reconciliation may verify an external result);
//   - artifacts: current versions whose `provenanceRunId` is one of those
//     scoped runs.
// An observation from another requirement's delivery can no longer leak into
// this one's proof, and no id list is ever "everything on the objective".
// `founderConfirmationRefs` stays empty because no production founder-answer
// seam exists yet — an ASK_FOUNDER proof therefore fails closed rather than
// accepting a fabricated ref.
const PROOF_SCOPED_ASSIGNMENT_STATES: Assignment["state"][] = [
  "dispatched",
  "running",
  "result_submitted",
  "verified",
];

async function readScopedProofFacts(
  ctx: MutationCtx,
  objectiveKey: string,
  requirement: Requirement,
  currentContractRevision: number,
): Promise<ProofFacts> {
  const assignmentRows = await ctx.db
    .query("assignments")
    .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
    .collect();
  const deliveries = assignmentRows
    .map((row) => (row as AnyRow).data as Assignment)
    .filter(
      (a) =>
        a.requirementKey === requirement.requirementKey &&
        a.contractRevision === currentContractRevision &&
        PROOF_SCOPED_ASSIGNMENT_STATES.includes(a.state),
    );
  const runIds = new Set(
    deliveries.map((a) => a.runId).filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const observationIds: string[] = [];
  if (runIds.size > 0) {
    const evidenceRows = await ctx.db
      .query("evidence")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", objectiveKey))
      .collect();
    for (const row of evidenceRows) {
      const data = (row as AnyRow).data as Record<string, unknown>;
      if (data.origin !== "application_observation") continue;
      if (!runIds.has(String(data.runId ?? ""))) continue;
      // R3 A5 vocabulary: both public identities of the same application row.
      observationIds.push((row as AnyRow).evidenceId as string);
      observationIds.push(String(data.sourceId ?? ""));
    }
  }

  const intentRows = await ctx.db
    .query("executionIntents")
    .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
    .collect();
  const verifiedIntentIds = intentRows
    .map((row) => (row as AnyRow).data as ExecutionIntent)
    .filter(
      (intent) =>
        intent.requirementKey === requirement.requirementKey &&
        intent.contractRevision === currentContractRevision &&
        intent.state === "verified",
    )
    .map((intent) => intent.intentId);

  const artifactVersions: Record<string, number> = {};
  if (runIds.size > 0) {
    const objectiveRow = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", objectiveKey))
      .unique();
    if (objectiveRow) {
      const data = (objectiveRow as AnyRow).data as Record<string, unknown>;
      const artifacts = (data.companyArtifacts ?? []) as Array<Record<string, unknown>>;
      for (const artifact of artifacts) {
        if (runIds.has(String(artifact.provenanceRunId ?? "")))
          artifactVersions[artifact.key as string] = artifact.version as number;
      }
    }
  }

  return {
    artifactVersions,
    applicationObservationIds: observationIds,
    verifiedIntentIds,
    founderConfirmationRefs: [],
  };
}

async function noteDispatchDeferred(
  ctx: MutationCtx,
  objectiveKey: string,
  requirementKey: string,
  at: number,
  reason: string,
): Promise<null> {
  const row = await ctx.db
    .query("objectives")
    .withIndex("by_key", (q) => q.eq("key", objectiveKey))
    .unique();
  if (row) {
    const data = (row as AnyRow).data as Record<string, unknown>;
    const mgmt = (data.management ?? {}) as Record<string, unknown>;
    await ctx.db.patch(row._id, {
      data: {
        ...data,
        management: {
          ...mgmt,
          contractId: (mgmt.contractId as string | null) ?? null,
          controlNotes: boundNotes(mgmt.controlNotes, {
            type: "dispatch_deferred",
            requirementKey,
            reason: reason.slice(0, 400),
            at,
          }),
        },
      },
    } as never);
  }
  await ctx.db.insert("objectiveEvents", {
    objectiveKey,
    data: { at, kind: "decision", text: `Dispatch deferred for ${requirementKey}: ${reason}`.slice(0, 900) },
  });
  return null;
}

// MAKE / HYBRID-internal: one assignment, one reserved worker, one bounded run.
// Every identity below is derived from the authorization, never invented, so a
// replayed wake lands on the same rows and the storage upserts collapse it.
async function dispatchInternal(
  ctx: MutationCtx,
  objectiveKey: string,
  requirement: Requirement,
  persisted: AuthorizedDecisionRow,
  option: GroundedOption,
  at: number,
): Promise<string | null> {
  const assignmentId = deriveAssignmentId({
    objectiveKey,
    requirementKey: requirement.requirementKey,
    contractRevision: requirement.contractRevision,
    decisionId: persisted.decisionId,
  });

  // Replay guard: the effect already exists. A DELIVERED-or-in-flight row is
  // reported as-is (idempotent no-op). A row that already ended failed is NOT
  // a success to replay: returning its id would read as progress forever while
  // the reducer keeps seeing "not delivered". It defers loudly instead, and a
  // retry is a NEW authorized decision (a new assignment identity), which only
  // the decision pass may mint.
  const existing = (await ctx.runQuery(internal.internal.workforce.findAssignment, {
    objectiveKey,
    assignmentId,
  })) as Assignment | null;
  if (existing) {
    if (existing.state === "failed" || existing.state === "superseded")
      return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
        `assignment ${assignmentId} already ${existing.state}; a retry needs a fresh authorization`);
    return existing.assignmentId;
  }

  const workerKey = targetWorkerKey(option);
  if (!workerKey)
    return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
      "authorized option resolves to no stable worker identity");

  // The worker must exist before it can be reserved: REUSE names a live row,
  // CREATE is funded by the persisted worker-creation ceiling (the same budget
  // the staffing decision consulted — spend is applied here, atomically).
  const inventory = (await ctx.runQuery(internal.internal.workforce.listWorkers, {})) as WorkerRecord[];
  let worker = inventory.find((candidate) => candidate.workerKey === workerKey) ?? null;
  if (!worker) {
    const spend = (await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
      objectiveKey,
      spend: { kind: "worker_creation", requirementKey: null, intentId: null, at },
    })) as { ok: boolean; verdict?: unknown };
    if (!spend.ok)
      return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
        `worker creation is not affordable under the objective budget`);
    const spec = createWorkerSpec(option.internal?.capabilityKeys ?? []);
    const record: WorkerRecord = {
      workerKey: spec.workerKey,
      displayName: spec.workerKey,
      capabilityKeys: [...spec.capabilityKeys],
      dynamicCapabilities: [],
      responsibility: spec.responsibility,
      lifecycle: "available",
      reservedBy: null,
      verifiedAssignments: [],
      contextRefs: [],
      createdByObjective: objectiveKey,
      createdAt: at,
      updatedAt: at,
    };
    await ctx.runMutation(internal.internal.workforce.upsertWorker, {
      workerKey: record.workerKey,
      data: record,
      at,
    });
    worker = record;
  }

  // Attempt ceiling: each dispatch attempt for a requirement is charged against
  // `maxWorkerAttemptsPerRequirement` BEFORE anything is written, so an
  // undeliverable plan escalates instead of re-arming forever.
  const attemptSpend = (await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
    objectiveKey,
    spend: { kind: "requirement_attempt", requirementKey: requirement.requirementKey, intentId: null, at },
  })) as { ok: boolean; verdict?: unknown };
  if (!attemptSpend.ok)
    return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
      "attempt ceiling reached for this requirement");

  const reserved = (await ctx.runMutation(internal.internal.workforce.reserveWorker, {
    workerKey,
    objectiveKey,
    requirementKey: requirement.requirementKey,
    assignmentId,
    heldUntil: at + DISPATCH_HOLD_MS,
    at,
  })) as { ok: boolean; reason?: string; replayed?: boolean };
  if (!reserved.ok) {
    await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
      objectiveKey,
      spend: { kind: "assignment_finish", requirementKey: null, intentId: null, at },
    });
    return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
      `worker ${workerKey} refused the reservation (${reserved.reason ?? "unknown"})`);
  }

  const built = buildAssignmentContract({
    requirement,
    option,
    assignmentId,
    workerKey,
    worker,
    at,
  });
  if (!built.ok) {
    await ctx.runMutation(internal.internal.workforce.releaseWorker, { workerKey, assignmentId, at });
    return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
      built.errors.join("; "));
  }

  const runId = deriveRunId(assignmentId);
  const assignment: Assignment = {
    assignmentId,
    objectiveKey,
    requirementKey: requirement.requirementKey,
    contractRevision: requirement.contractRevision,
    decisionId: persisted.decisionId,
    workerKey,
    kind: requirement.strategy === "HYBRID" ? "internal_component_of_hybrid" : "internal_make",
    // `dispatched` until the run row exists: the state says what is true, and
    // nothing here claims `running` before the runtime actually started.
    state: "dispatched",
    attempt: 1,
    runId,
    workContract: built.contract,
    resultSummary: null,
    idempotencyScope: built.contract.idempotencyScope,
    createdAt: at,
    updatedAt: at,
  };
  await ctx.runMutation(internal.internal.workforce.putAssignment, {
    assignmentId,
    objectiveKey,
    data: assignment,
  });
  const activeSpend = (await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
    objectiveKey,
    spend: { kind: "assignment_start", requirementKey: requirement.requirementKey, intentId: null, at },
  })) as { ok: boolean; verdict?: unknown };
  if (!activeSpend.ok) {
    // The assignment row stays as the durable record of what was attempted; the
    // worker goes back on the shelf and the pass reports the ceiling honestly.
    await ctx.runMutation(internal.internal.workforce.releaseWorker, { workerKey, assignmentId, at });
    const moved = advanceAssignment(assignment, "failed", at, {
      resultSummary: "active assignment ceiling reached before the run could start",
    });
    if (moved.ok)
      await ctx.runMutation(internal.internal.workforce.putAssignment, {
        assignmentId,
        objectiveKey,
        data: moved.assignment,
      });
    return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
      "active assignment ceiling reached");
  }

  const started = (await ctx.runMutation(internal.objectives.startManagedRun, {
    objectiveKey,
    assignmentId,
    runId,
    workerKey,
    title: requirement.title,
    // The persisted shape is validated by the mutation; the TS type of the
    // builder and the validator agree because both come from lib/objective.
    contract: built.contract as never,
    at,
  })) as { started: boolean; reason?: string; replayed?: boolean };
  if (!started.started && !started.replayed) {
    const moved = advanceAssignment(assignment, "failed", at, {
      resultSummary: started.reason ?? "run could not be started",
    });
    if (moved.ok)
      await ctx.runMutation(internal.internal.workforce.putAssignment, {
        assignmentId,
        objectiveKey,
        data: moved.assignment,
      });
    await ctx.runMutation(internal.internal.workforce.releaseWorker, { workerKey, assignmentId, at });
    await ctx.runMutation(internal.internal.workforce.applyBudgetSpend, {
      objectiveKey,
      spend: { kind: "assignment_finish", requirementKey: null, intentId: null, at },
    });
    return await noteDispatchDeferred(ctx, objectiveKey, requirement.requirementKey, at,
      started.reason ?? "run could not be started");
  }

  // The runtime accepted (or already had) this run. `started` moves the
  // assignment to running; a REPLAY means the run row already existed — this
  // pass did not start new work, so the assignment stays where it truthfully
  // is (dispatched, or running from the pass that really started it).
  if (started.started) {
    const replayMoved = advanceAssignment(assignment, "running", at);
    if (replayMoved.ok)
      await ctx.runMutation(internal.internal.workforce.putAssignment, {
        assignmentId,
        objectiveKey,
        data: replayMoved.assignment,
      });
  }
  return assignmentId;
}

// BUY / HYBRID-external: one persisted intent that STOPS at the M3 boundary.
// There is no production buyer rail in M4 and this file must not pretend there
// is one: the intent rests in `awaiting_m3` with its truthful boundaryNote, which
// is why `attemptHandoff` is deliberately not called here.
async function dispatchExternal(
  ctx: MutationCtx,
  objectiveKey: string,
  persisted: AuthorizedDecisionRow,
  option: GroundedOption,
  at: number,
): Promise<string | null> {
  const created = createIntentFromAuthorization({
    objectiveKey,
    authorization: persisted.authorization,
    option,
    at,
    mode: EXTERNAL_AUTHORITY_MODE,
  });
  if (!created.ok)
    return await noteDispatchDeferred(ctx, objectiveKey, persisted.requirementKey, at, created.reason);

  const existing = (await ctx.runQuery(internal.internal.workforce.findIntent, {
    objectiveKey,
    intentId: created.intent.intentId,
  })) as ExecutionIntent | null;
  // Replay: never overwrite a row that has already moved on, and never report
  // a DEAD intent as a delivered effect — same rule as the assignment guard:
  // `failed`/`reconciliation_required` defers loudly; a retry is a new
  // authorization, which mints a new intent identity.
  if (existing) {
    if (existing.state === "failed" || existing.state === "reconciliation_required")
      return await noteDispatchDeferred(ctx, objectiveKey, persisted.requirementKey, at,
        `intent ${existing.intentId} is ${existing.state}; a retry needs a fresh authorization`);
    return existing.intentId;
  }

  await ctx.runMutation(internal.internal.workforce.putIntent, {
    intentId: created.intent.intentId,
    objectiveKey,
    idempotencyKey: created.intent.idempotencyKey,
    data: created.intent,
  });
  return created.intent.intentId;
}
