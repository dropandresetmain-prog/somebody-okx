// Fresh current-product Convex runtime for the M1 Objective spine.
// Persists the objective aggregate (plan, work item, worker resolution,
// WorkContract, run state, model selection) plus evidence and activity in their
// own tables. Legacy procurement/mission modules are not referenced.
//
// R1 fixes reflected here:
//  - planning is server-side; the client sends only an objective key;
//  - the durable planning mutation re-runs the pure deterministic validation
//    itself, so it never trusts an action's or the client's word;
//  - evidence carries an application-set origin and a re-derived stable source
//    identity, and proof counts DISTINCT identities per source class;
//  - run writes and finalization are fenced by run identity, status AND lease;
//  - the read model exposes application acceptance so the UI cannot present a
//    merely-submitted result as an accepted one;
//  - model execution lives in the "use node" objectiveRunner module, so no
//    query or mutation is defined in a Node-only file.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activityEvent, objectiveRecord } from "./objectiveValidators";
import {
  vEvidenceData,
  vFindingInput,
  vObjectiveRequest,
  vPlannerProposal,
} from "./objectiveArgs";
import type { Id } from "./_generated/dataModel";
import {
  createWorkContract,
  evaluateCompletion,
  decideObjectiveSourcing,
  objectiveStateForSourcing,
  resolveWorker,
  validatePlannerProposal,
} from "../lib/workforce";
import { CURRENT_RESOURCE_INVENTORY, RESEARCH_ROLE } from "../lib/objective/policy";
import { sourceIdentity } from "../lib/objective/contract";
import { toolPermissionsForCapabilities } from "../lib/workforce/permissions";
import {
  M1_ROLE_REQUIREMENTS,
  assertRoleRequirementsSatisfied,
} from "../lib/objective/planner";
import {
  LEASE_MS,
  decideFinalization,
  fenceRunWrite,
} from "../lib/objective/runGuards";
import { providerConfiguration } from "../lib/worker/modelSelection";
import type {
  ActivityEvent,
  ActivityResult,
  EvidenceRecord,
  ObjectiveRecord,
  PlannerProposal,
  ValidatedPlan,
  WorkerSpec,
} from "../lib/workforce";

type ObjectiveRow = { _id: Id<"objectives">; key: string; data: ObjectiveRecord };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadObjective(
  db: QueryCtx["db"],
  key: string,
): Promise<ObjectiveRow> {
  const row = await db
    .query("objectives")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) throw new Error(`Unknown objective: ${key}`);
  return row as ObjectiveRow;
}

async function appendEvent(
  db: MutationCtx["db"],
  objectiveKey: string,
  kind: ActivityEvent["kind"],
  text: string,
  at: number,
) {
  await db.insert("objectiveEvents", {
    objectiveKey,
    data: { at, kind, text },
  });
}

async function recordEvidenceRow(
  db: MutationCtx["db"],
  objectiveKey: string,
  evidence: EvidenceRecord,
) {
  const { id, ...data } = evidence;
  await db.insert("evidence", { objectiveKey, evidenceId: id, data });
}

async function listEvidence(
  db: QueryCtx["db"],
  objectiveKey: string,
): Promise<EvidenceRecord[]> {
  const rows = await db
    .query("evidence")
    .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", objectiveKey))
    .collect();
  return rows
    .map((row) => ({ id: row.evidenceId, ...row.data }) as EvidenceRecord)
    .sort((a, b) => a.observedAt - b.observedAt);
}

async function listEvents(
  db: QueryCtx["db"],
  objectiveKey: string,
): Promise<ActivityEvent[]> {
  const rows = await db
    .query("objectiveEvents")
    .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", objectiveKey))
    .collect();
  return rows.map((row) => row.data).sort((a, b) => a.at - b.at);
}

// Proof is computed from the ACTIVE run's durable evidence, so progress left
// behind by a superseded run cannot be credited to a newer one.
function evidenceForRun(evidence: EvidenceRecord[], runId: string) {
  return evidence.filter((item) => item.runId === runId);
}

// The single write gate for anything a worker does. Uses the same pure fence
// the lifecycle tests prove, so deployment behavior and test behavior agree.
function assertActiveRun(record: ObjectiveRecord, runId: string, now: number) {
  const fence = fenceRunWrite({ run: record.run, runId, now });
  if (!fence.ok) throw new Error(fence.reason);
}

// Deterministic planning validation, authoritative because it runs inside the
// mutation that writes the plan. The model proposal is only ever an input.
function validatePlanningInput(proposal: PlannerProposal): {
  validated: ValidatedPlan;
  grantedPermissions: string[];
} {
  const validated = validatePlannerProposal(proposal);
  const grantedPermissions: string[] = toolPermissionsForCapabilities(
    validated.capabilityKeys,
  );
  // Belt and braces: the catalog grants no external authority, and a plan that
  // somehow carried one must never reach a run.
  for (const permission of grantedPermissions) {
    if (permission === "authorize_external_spend")
      throw new Error(`Plan cannot carry external spend authority`);
  }
  const roleCheck = assertRoleRequirementsSatisfied({
    grantedPermissions,
    role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
  });
  if (!roleCheck.ok)
    throw new Error(
      `RESEARCH_ROLE cannot be satisfied by this plan: missing ${roleCheck.missing.join(", ")}`,
    );
  return { validated, grantedPermissions };
}

// ── Public entry: submit an objective ────────────────────────────────────────

export const submitObjective = mutation({
  args: { request: vObjectiveRequest },
  returns: v.object({ key: v.string() }),
  handler: async (ctx, args) => {
    const request = args.request.trim();
    if (request.length < 8)
      throw new Error("Describe the objective in at least 8 characters");
    if (request.length > 2000)
      throw new Error("Objective is not bounded (max 2000 characters)");
    const now = Date.now();
    const key = `obj_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const record: ObjectiveRecord = {
      key,
      request,
      createdAt: now,
      updatedAt: now,
      state: "received",
      activity: "Objective received.",
      plan: null,
      workItems: [],
      run: null,
      result: null,
    };
    await ctx.db.insert("objectives", { key, data: record });
    await appendEvent(ctx.db, key, "system", "Objective received.", now);
    return { key };
  },
});

// ── Server-side planning (R1 Blocker D) ──────────────────────────────────────

// The client sends ONLY the objective key. The proposal comes from one bounded
// server-side model call and is non-authoritative until the mutation below
// re-validates it. The client can no longer choose capabilities, resources or
// tool requirements.
export const planObjectiveFromModel = action({
  args: { objectiveKey: v.string() },
  returns: v.object({ decision: v.string() }),
  handler: async (ctx, args): Promise<{ decision: string }> => {
    const row = await ctx.runQuery(internal.objectives.getObjectiveInternal, {
      objectiveKey: args.objectiveKey,
    });
    const record = (row as ObjectiveRow).data;
    if (record.state !== "received")
      throw new Error(
        `Objective ${args.objectiveKey} is ${record.state}, expected received`,
      );
    const proposal = await ctx.runAction(
      internal.objectiveRunner.proposePlan,
      { request: record.request },
    );
    return ctx.runMutation(internal.objectives.planObjective, {
      objectiveKey: args.objectiveKey,
      proposal: proposal as PlannerProposal,
    });
  },
});

// ── Planning: validate, source, bind worker + contract ───────────────────────

export const planObjective = internalMutation({
  args: {
    objectiveKey: v.string(),
    proposal: vPlannerProposal,
  },
  returns: v.object({ decision: v.string() }),
  handler: async (ctx, args) => {
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    if (record.state !== "received")
      throw new Error(
        `Objective ${args.objectiveKey} is ${record.state}, expected received`,
      );
    const now = Date.now();

    // 1. Fail-closed capability/resource validation + role satisfiability.
    //    An unknown capability, unknown resource class, smuggled permission,
    //    or a capability set that cannot obtain both required evidence classes
    //    throws here — before any work item, contract or run exists.
    const { validated } = validatePlanningInput({
      capabilityKeys: args.proposal.capabilityKeys,
      responsibility: args.proposal.responsibility,
      requiredResourceClasses: args.proposal.requiredResourceClasses,
      ...(args.proposal.requestedToolPermissions
        ? { requestedToolPermissions: args.proposal.requestedToolPermissions }
        : {}),
    });

    // 2. Factual resource inventory → canonical sourcing decision.
    //    The rule itself lives in lib/sourcing/policy.ts; this seam only
    //    adapts shapes. The model cannot reach this decision: it proposed
    //    capability/resource needs, the controlled catalog derived the
    //    requirements, and only the factual inventory determines ownership.
    const sourcing = decideObjectiveSourcing({
      validated,
      inventory: {
        availableResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
        observedAt: now,
      },
    });

    const plan = {
      objectiveKey: args.objectiveKey,
      validated,
      sourcing,
      decidedAt: now,
    };

    // Only MAKE can spawn internal work here. M2 stops a BUY before any
    // provider call or payment: the decision, the named missing resource and
    // the approved provider path are recorded, nothing more.
    if (sourcing.decision !== "MAKE") {
      // BUY is NOT failure (§8): the plan requires an external resource the
      // company does not control, so the objective enters an explicit waiting
      // state until that resource is acquired. BLOCKED (no approved path)
      // remains terminal-failed because nothing can currently satisfy it.
      // The state rule lives in one pure authority (objectiveStateForSourcing).
      const { state } = objectiveStateForSourcing(sourcing.decision);
      const isBuy = sourcing.decision === "BUY";
      const updated: ObjectiveRecord = {
        ...record,
        state,
        activity: isBuy
          ? `Waiting for external resource: ${sourcing.reason}`
          : `Blocked: ${sourcing.reason}`,
        plan,
        updatedAt: now,
      };
      await ctx.db.patch(row._id, { data: updated });
      await appendEvent(
        ctx.db,
        args.objectiveKey,
        "decision",
        `Sourcing decision ${sourcing.decision}: ${sourcing.reason}`,
        now,
      );
      return { decision: sourcing.decision };
    }

    // 3. Worker resolution over the current internal inventory (MAKE primitive).
    const resolution = resolveWorker({
      requiredCapabilityKeys: validated.capabilityKeys,
      inventory: [], // fresh deployment: no persistent inventory yet → create
    });

    // 4. Bind the WorkContract from the validated plan + role policy. The
    //    contract carries DISTINCT-source proof requirements, so proof is a
    //    property of the assignment rather than a count of persisted rows.
    const assignment = `Evaluate whether the target described in "${record.request}" is a suitable partnership/business target using the company's internal criteria and current public information.`;
    const contract = createWorkContract({
      assignment,
      idempotencyScope: `${args.objectiveKey}:wi-1`,
      worker: resolution.worker as WorkerSpec,
      sourceProofs: RESEARCH_ROLE.sourceProofs.map((proof) => ({ ...proof })),
    });

    const workItemId = `${args.objectiveKey}:wi-1`;
    const updated: ObjectiveRecord = {
      ...record,
      state: "ready_to_execute",
      activity: "Plan validated; internal worker assigned.",
      plan,
      workItems: [
        {
          id: workItemId,
          objectiveKey: args.objectiveKey,
          title: RESEARCH_ROLE.title,
          assignment,
          workerKey: contract.workerKey,
          state: "assigned",
          contract,
          runs: [],
        },
      ],
      run: null,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "decision",
      `MAKE: capabilities [${validated.capabilityKeys.join(", ")}], worker ${contract.workerKey} (${resolution.outcome})`,
      now,
    );
    return { decision: "MAKE" };
  },
});

// ── Run lifecycle ────────────────────────────────────────────────────────────

export const startRun = internalMutation({
  args: { objectiveKey: v.string() },
  returns: v.object({
    runId: v.string(),
    model: v.string(),
    modelSelectionReason: v.string(),
  }),
  handler: async (ctx, args) => {
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    if (record.state !== "ready_to_execute")
      throw new Error(
        `Objective ${args.objectiveKey} is ${record.state}, expected ready_to_execute`,
      );
    // Stale-run fencing: refuse while another live run holds the lease.
    if (
      record.run &&
      record.run.status === "running" &&
      record.run.leaseUntil > Date.now()
    )
      throw new Error(
        `Run ${record.run.id} still holds the lease until ${new Date(record.run.leaseUntil).toISOString()}`,
      );

    // Deliberate model selection is persisted with the run, and fails closed
    // unless live AI is explicitly enabled with a selected tool-capable model.
    const selection = providerConfiguration(process.env);
    const now = Date.now();
    const runId = `run_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const workItem = { ...record.workItems[0] };
    workItem.state = "running";
    workItem.runs = [
      ...workItem.runs,
      {
        id: runId,
        workItemId: workItem.id,
        status: "running" as const,
        startedAt: now,
        leaseUntil: now + LEASE_MS,
        model: selection.model,
        modelSelectionReason: selection.modelSelectionReason,
        toolCalls: 0,
        summary: "",
      },
    ];
    const updated: ObjectiveRecord = {
      ...record,
      state: "executing",
      activity: `Run ${runId} started with ${selection.model}.`,
      workItems: [workItem],
      run: workItem.runs[workItem.runs.length - 1],
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "agent",
      `Run started: model ${selection.model} (${selection.modelSelectionReason})`,
      now,
    );
    // Execution happens in the Node runtime with an abort budget strictly
    // inside the lease; the expiry fence is the scheduled backstop.
    await ctx.scheduler.runAfter(0, internal.objectiveRunner.executeWorker, {
      objectiveKey: args.objectiveKey,
      runId,
    });
    await ctx.scheduler.runAfter(LEASE_MS, internal.objectives.expireRun, {
      objectiveKey: args.objectiveKey,
      runId,
    });
    return {
      runId,
      model: selection.model,
      modelSelectionReason: selection.modelSelectionReason,
    };
  },
});

// Public trigger for the M1 UI: start a run against a ready objective.
export const startRunPublic = mutation({
  args: { objectiveKey: v.string() },
  returns: v.object({ runId: v.string() }),
  handler: async (ctx, args): Promise<{ runId: string }> => {
    const started: { runId: string; model: string; modelSelectionReason: string } =
      await ctx.runMutation(internal.objectives.startRun, {
        objectiveKey: args.objectiveKey,
      });
    return { runId: started.runId };
  },
});

// Lease-expiry fence: only acts when the lease has actually lapsed.
export const expireRun = internalMutation({
  args: { objectiveKey: v.string(), runId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    if (
      !record.run ||
      record.run.id !== args.runId ||
      record.run.status !== "running" ||
      record.run.leaseUntil > Date.now()
    )
      return null;
    const now = Date.now();
    const workItem = { ...record.workItems[0] };
    const runs = [...workItem.runs];
    const runIndex = runs.findIndex((candidate) => candidate.id === args.runId);
    const run = { ...runs[runIndex] };
    run.status = "failed";
    run.summary =
      "Worker lease expired. Durable progress (evidence, result) is retained; a new run can resume.";
    runs[runIndex] = run;
    workItem.runs = runs;
    workItem.state = "failed";
    const updated: ObjectiveRecord = {
      ...record,
      state: "failed",
      activity: run.summary,
      workItems: [workItem],
      run,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(ctx.db, args.objectiveKey, "system", run.summary, now);
    return null;
  },
});

// ── Durable worker writes (all fenced) ───────────────────────────────────────

// Persist one observation or note. `origin` and `sourceId` are NOT taken on
// trust: source identity is re-derived here from the source fields, and an
// asserted application observation whose identity does not match is rejected.
// This is what makes fabricated proof impossible at the persistence boundary.
export const recordFinding = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    finding: vFindingInput,
    // Sibling argument rather than part of the finding: it is a reference the
    // application validates, not content the model asserts.
    basedOnEvidenceId: v.optional(v.string()),
  },
  returns: v.object({ evidenceId: v.string() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    assertActiveRun(row.data, args.runId, now);
    const record = row.data;

    const derived = sourceIdentity({
      sourceClass: args.finding.sourceClass,
      ...(args.finding.url ? { url: args.finding.url } : {}),
      ...(args.finding.recordRef ? { recordRef: args.finding.recordRef } : {}),
    });
    const runEvidence = evidenceForRun(
      await listEvidence(ctx.db, args.objectiveKey),
      args.runId,
    );
    if (args.finding.origin === "application_observation") {
      if (!derived)
        throw new Error(
          "An application observation must carry a resolvable source identity (recordRef or url)",
        );
      if (derived !== args.finding.sourceId)
        throw new Error(
          `Source identity mismatch: asserted ${args.finding.sourceId}, derived ${derived}`,
        );
    } else {
      if (!args.finding.sourceId.startsWith("note:"))
        // A note may carry any label, but its identity must stay in the note
        // namespace so it can never collide with a real source identity.
        throw new Error(
          "A model note must use a note-namespaced source identity",
        );
      // A note may annotate a real observation, but only one this run actually
      // fetched. Re-deriving nothing here: the citation must already exist.
      if (args.basedOnEvidenceId) {
        const cited = runEvidence.find(
          (item) =>
            item.id === args.basedOnEvidenceId &&
            item.origin === "application_observation",
        );
        if (!cited)
          throw new Error(
            `record_finding: ${args.basedOnEvidenceId} is not an application observation in this run`,
          );
      }
    }

    const evidenceId = `ev_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const evidence: EvidenceRecord = {
      ...args.finding,
      id: evidenceId,
      recordedBy: record.workItems[0].workerKey,
      runId: args.runId,
      ...(args.basedOnEvidenceId
        ? { basedOnEvidenceId: args.basedOnEvidenceId }
        : {}),
    };
    await recordEvidenceRow(ctx.db, args.objectiveKey, evidence);
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "evidence",
      evidence.origin === "application_observation"
        ? `Observation recorded from ${evidence.sourceClass}: ${evidence.label}`
        : `Note recorded (analysis, not proof): ${evidence.label}`,
      now,
    );
    return { evidenceId };
  },
});

// Store the structured result. Submitting it is NOT acceptance.
export const submitResult = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    result: v.object({
      summary: v.string(),
      fit: v.string(),
      risks: v.array(v.string()),
      unknowns: v.array(v.string()),
      recommendedNextAction: v.string(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    assertActiveRun(row.data, args.runId, now);
    const result: ActivityResult = { ...args.result, completedAt: now };
    const data: ObjectiveRecord = { ...row.data, result, updatedAt: now };
    await ctx.db.patch(row._id, { data });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "result",
      "Structured result submitted (awaiting application proof check).",
      now,
    );
    return null;
  },
});

// Internal read port for the worker: observable state plus the durable observed
// text, so the worker's result can be based on what it actually read. Bounding
// for the model's context window happens in the runtime, not here.
export const readWorkerObservation = internalQuery({
  args: { objectiveKey: v.string(), runId: v.string() },
  returns: v.object({
    assignment: v.string(),
    responsibility: v.string(),
    requiredSourceClasses: v.array(v.string()),
    minObservations: v.number(),
    sourceProofs: v.array(
      v.object({
        sourceClass: v.string(),
        minDistinctSources: v.number(),
      }),
    ),
    recordedFindings: v.array(
      v.object({
        id: v.string(),
        sourceClass: v.string(),
        label: v.string(),
        origin: v.string(),
        text: v.string(),
        url: v.optional(v.string()),
        recordRef: v.optional(v.string()),
      }),
    ),
    unmetCompletionRequirements: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    const workItem = record.workItems[0];
    const evidence = evidenceForRun(
      await listEvidence(ctx.db, args.objectiveKey),
      args.runId,
    );
    const check = evaluateCompletion({
      contract: workItem.contract,
      evidence,
      result: record.result,
    });
    return {
      assignment: workItem.contract.assignment,
      responsibility: workItem.contract.assignment,
      requiredSourceClasses: [...workItem.contract.requiredSourceClasses],
      minObservations: workItem.contract.minObservations,
      sourceProofs: workItem.contract.sourceProofs.map((proof) => ({
        sourceClass: proof.sourceClass,
        minDistinctSources: proof.minDistinctSources,
      })),
      recordedFindings: evidence.map((item) => ({
        id: item.id,
        sourceClass: item.sourceClass,
        label: item.label,
        origin: item.origin,
        text: item.text,
        ...(item.url ? { url: item.url } : {}),
        ...(item.recordRef ? { recordRef: item.recordRef } : {}),
      })),
      unmetCompletionRequirements: check.unmet,
    };
  },
});

// ── Application-owned completion ─────────────────────────────────────────────

// R1 Blocker E: only the live, lease-holding run may finalize. A replaced,
// expired or already-finalized run is a deterministic no-op reporting the
// durable state it found, so a late writer can neither turn a partial failure
// into success nor finalize twice.
export const finishRun = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    failed: v.optional(v.boolean()),
    failureReason: v.optional(v.string()),
  },
  returns: v.object({
    completed: v.boolean(),
    unmet: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;

    const decision = decideFinalization({
      run: record.run,
      runId: args.runId,
      state: record.state,
      now,
    });
    if (decision.kind === "no-op") {
      const all = await listEvidence(ctx.db, args.objectiveKey);
      const unmet =
        record.state === "completed"
          ? []
          : record.workItems[0] && record.result
            ? evaluateCompletion({
                contract: record.workItems[0].contract,
                evidence: evidenceForRun(all, args.runId),
                result: record.result,
              }).unmet
            : ["Run was superseded before it could complete"];
      return { completed: decision.completed, unmet };
    }

    const workItem = { ...record.workItems[0] };
    const runs = [...workItem.runs];
    const runIndex = runs.findIndex((candidate) => candidate.id === args.runId);
    const run = { ...runs[runIndex] };

    if (args.failed) {
      run.status = "failed";
      run.summary = args.failureReason ?? "Run failed";
      runs[runIndex] = run;
      workItem.runs = runs;
      workItem.state = "failed";
      const updated: ObjectiveRecord = {
        ...record,
        state: "failed",
        activity: `Run failed: ${args.failureReason ?? "unknown"}`,
        workItems: [workItem],
        run,
        updatedAt: now,
      };
      await ctx.db.patch(row._id, { data: updated });
      await appendEvent(
        ctx.db,
        args.objectiveKey,
        "system",
        `Run failed: ${args.failureReason ?? "unknown"}`,
        now,
      );
      return { completed: false, unmet: [run.summary] };
    }

    // Application-owned completion, from this run's persisted proof only.
    const evidence = evidenceForRun(
      await listEvidence(ctx.db, args.objectiveKey),
      args.runId,
    );
    const check = evaluateCompletion({
      contract: workItem.contract,
      evidence,
      result: record.result,
    });
    run.status = "stopped";
    run.summary = check.complete
      ? "Application accepted completion"
      : `Incomplete: ${check.unmet.join("; ")}`;
    runs[runIndex] = run;
    workItem.runs = runs;
    workItem.state = check.complete ? "completed" : "failed";
    const updated: ObjectiveRecord = {
      ...record,
      state: check.complete ? "completed" : "failed",
      activity: check.complete
        ? "Work completed with verified proof."
        : `Run ended without required proof: ${check.unmet.join("; ")}`,
      workItems: [workItem],
      run,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      check.complete ? "result" : "system",
      check.complete
        ? "Objective completed: proof accepted by the application."
        : `Objective not completed: ${check.unmet.join("; ")}`,
      now,
    );
    return { completed: check.complete, unmet: check.unmet };
  },
});

// Internal read of the raw record for actions.
export const getObjectiveInternal = internalQuery({
  args: { objectiveKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => loadObjective(ctx.db, args.objectiveKey),
});

// ── Public read model (UI) ──────────────────────────────────────────────────

// `completion` is derived from durable proof by application code, never from a
// model claim, so the UI can state truthfully whether a result was accepted.
export const getObjective = query({
  args: { objectiveKey: v.string() },
  returns: v.object({
    record: v.union(objectiveRecord, v.null()),
    evidence: v.array(vEvidenceData),
    events: v.array(activityEvent),
    completion: v.object({
      accepted: v.boolean(),
      unmet: v.array(v.string()),
    }),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    if (!row)
      return {
        record: null,
        evidence: [],
        events: [],
        completion: { accepted: false, unmet: ["Objective not found"] },
      };
    const [evidence, events] = await Promise.all([
      listEvidence(ctx.db, args.objectiveKey),
      listEvents(ctx.db, args.objectiveKey),
    ]);
    const record = (row as ObjectiveRow).data;
    // Accepted is a durable application decision, not a submission side effect.
    const accepted = record.state === "completed";
    const unmet = accepted
      ? []
      : record.workItems[0]
        ? evaluateCompletion({
            contract: record.workItems[0].contract,
            evidence: record.run
              ? evidenceForRun(evidence, record.run.id)
              : evidence,
            result: record.result,
          }).unmet
        : ["No work item has been planned yet"];
    return {
      record,
      evidence: evidence.map(({ id, ...data }) => data),
      events,
      completion: { accepted, unmet },
    };
  },
});

export const listObjectives = query({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      request: v.string(),
      state: v.string(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("objectives").collect();
    return rows
      .map((row) => {
        const data = (row as { key: string; data: ObjectiveRecord }).data;
        return {
          key: row.key,
          request: data.request,
          state: data.state,
          updatedAt: data.updatedAt,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  },
});
