// Fresh current-product Convex runtime for the M1 Objective spine.
// Persists the whole objective aggregate (plan, work item, worker resolution,
// WorkContract, run state, model selection) plus evidence and activity in
// their own tables. Legacy procurement/mission modules are not referenced.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  activityEvent,
  objectiveRecord,
} from "./objectiveValidators";
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
  evaluateSourcing,
  resolveWorker,
  validatePlannerProposal,
  CURRENT_RESOURCE_INVENTORY,
  RESEARCH_ROLE,
  companyRecord,
} from "../lib/workforce";
import type {
  ActivityEvent,
  ActivityResult,
  EvidenceRecord,
  FindingInput,
  ObjectiveRecord,
  SourceClass,
  WorkContract,
  WorkerSpec,
} from "../lib/workforce";
import { runWorker } from "../lib/worker/runtime";
import { providerConfiguration } from "../lib/worker/modelSelection";
import { fetchPublicHtml, htmlToExtractableText } from "../lib/web/fetchPublicHtml";

const LEASE_MS = 300_000; // inherited mission lease window

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

// ── Public entry: submit an objective ────────────────────────────────────────

// The M1 planner proposal: bounded capability/resource needs for this
// objective. The UI/planner produces this; validatePlannerProposal decides.
export const planObjectivePublic = mutation({
  args: {
    objectiveKey: v.string(),
    proposal: vPlannerProposal,
  },
  returns: v.object({ decision: v.string() }),
  handler: async (ctx, args): Promise<{ decision: string }> =>
    ctx.runMutation(internal.objectives.planObjective, args),
});

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
    // Bounded, collision-free key from the request content + time.
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

// ── Planning: validate proposal, evaluate sourcing, bind worker + contract ──

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

    // 1. Fail-closed planner validation (model proposes, application disposes).
    const validated = validatePlannerProposal({
      capabilityKeys: args.proposal.capabilityKeys,
      responsibility: args.proposal.responsibility,
      requiredResourceClasses: args.proposal.requiredResourceClasses,
      ...(args.proposal.requestedToolPermissions
        ? { requestedToolPermissions: args.proposal.requestedToolPermissions }
        : {}),
    });

    // 2. Factual resource inventory → sourcing decision.
    const sourcing = evaluateSourcing({
      requiredResourceClasses: validated.requiredResourceClasses,
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

    if (sourcing.decision !== "MAKE") {
      const updated: ObjectiveRecord = {
        ...record,
        state: "failed",
        activity: `Blocked: ${sourcing.reason}`,
        plan,
        updatedAt: now,
      };
      await ctx.db.patch(row._id, { data: updated as never });
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

    // 4. Bind the WorkContract from the validated plan + role policy.
    const assignment = `Evaluate whether the target described in "${record.request}" is a suitable partnership/business target using the company's internal criteria and current public information.`;
    const contract = createWorkContract({
      assignment,
      idempotencyScope: `${args.objectiveKey}:wi-1`,
      worker: resolution.worker as WorkerSpec,
      requiredSourceClasses: [...RESEARCH_ROLE.requiredSourceClasses] as SourceClass[],
      minObservations: RESEARCH_ROLE.minObservations,
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
    await ctx.db.patch(row._id, { data: updated as never });
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
  returns: v.object({ runId: v.string(), model: v.string(), modelSelectionReason: v.string() }),
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

    // Deliberate model selection is persisted with the run.
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
      run: workItem.runs[workItem.runs.length - 1],
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated as never });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "agent",
      `Run started: model ${selection.model} (${selection.modelSelectionReason})`,
      now,
    );
    // Schedule the live worker execution plus the lease-expiry fence, exactly
    // as the inherited mission runtime did for its procurement runs.
    await ctx.scheduler.runAfter(0, internal.objectives.executeRun, {
      objectiveKey: args.objectiveKey,
      runId,
    });
    await ctx.scheduler.runAfter(LEASE_MS, internal.objectives.expireRun, {
      objectiveKey: args.objectiveKey,
      runId,
    });
    return { runId, model: selection.model, modelSelectionReason: selection.modelSelectionReason };
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
    await ctx.db.patch(row._id, { data: updated as never });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "system",
      run.summary,
      now,
    );
    return null;
  },
});

// Internal: record a structured finding as evidence (tool-mediated).
export const recordFinding = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    finding: vFindingInput,
  },
  returns: v.object({ evidenceId: v.string() }),
  handler: async (ctx, args) => {
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    assertActiveRun(record, args.runId);
    const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const evidence: EvidenceRecord = {
      ...args.finding,
      id: evidenceId,
      recordedBy: record.run!.model
        ? record.workItems[0].workerKey
        : record.workItems[0].workerKey,
      runId: args.runId,
    };
    await recordEvidenceRow(ctx.db, args.objectiveKey, evidence);
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "evidence",
      `Finding recorded from ${args.finding.sourceClass}: ${args.finding.label}`,
      Date.now(),
    );
    return { evidenceId };
  },
});

// Internal: store the structured result (tool-mediated).
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
    const row = await loadObjective(ctx.db, args.objectiveKey);
    assertActiveRun(row.data, args.runId);
    const result: ActivityResult = { ...args.result, completedAt: Date.now() };
    const data: ObjectiveRecord = {
      ...row.data,
      result,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(row._id, { data: data as never });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "result",
      "Structured result submitted.",
      Date.now(),
    );
    return null;
  },
});

function assertActiveRun(record: ObjectiveRecord, runId: string) {
  if (!record.run || record.run.id !== runId || record.run.status !== "running")
    throw new Error(`Run ${runId} is not the active run for this objective`);
}

// Internal read port for the worker: observable state + required sources.
export const readWorkerObservation = internalQuery({
  args: { objectiveKey: v.string() },
  returns: v.object({
    assignment: v.string(),
    responsibility: v.string(),
    requiredSourceClasses: v.array(v.string()),
    minObservations: v.number(),
    recordedFindings: v.array(
      v.object({
        id: v.string(),
        sourceClass: v.string(),
        label: v.string(),
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
    const evidence = await listEvidence(ctx.db, args.objectiveKey);
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
      recordedFindings: evidence.map((item) => ({
        id: item.id,
        sourceClass: item.sourceClass,
        label: item.label,
        ...(item.url ? { url: item.url } : {}),
        ...(item.recordRef ? { recordRef: item.recordRef } : {}),
      })),
      unmetCompletionRequirements: check.unmet,
    };
  },
});

// ── Application-owned completion ─────────────────────────────────────────────

// Called after the runner returns (or on failure): the application re-checks
// the proof from persisted evidence and decides completion. The model's claim
// is never sufficient.
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
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    if (!record.run || record.run.id !== args.runId)
      throw new Error(`Run ${args.runId} is not the active run`);
    const now = Date.now();
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
      await ctx.db.patch(row._id, { data: updated as never });
      await appendEvent(
        ctx.db,
        args.objectiveKey,
        "system",
        `Run failed: ${args.failureReason ?? "unknown"}`,
        now,
      );
      return { completed: false, unmet: [] };
    }

    // Application-owned completion from persisted proof.
    const evidence = await listEvidence(ctx.db, args.objectiveKey);
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
    await ctx.db.patch(row._id, { data: updated as never });
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

// ── Live worker execution (scheduled action) ────────────────────────────────

// The port the runtime talks through; every command lands in Convex as a
// mutation, so all observations/results are application-persisted truth.
function makeConvexPort(ctx: ActionCtx, objectiveKey: string, runId: string) {
  return {
    async read() {
      return ctx.runQuery(internal.objectives.readWorkerObservation, {
        objectiveKey,
      });
    },
    async act(command: {
      type: string;
      finding?: FindingInput;
      source?: string;
      label?: string;
      url?: string;
      recordRef?: string;
      result?: unknown;
    }) {
      switch (command.type) {
        case "record_observation": {
          // Application adapter resolves the observation: company record or
          // bounded public fetch. Untrusted public content is truncated.
          let text: string;
          let label = command.label ?? "Observation";
          if (command.source === "company_record") {
            const record = companyRecord(command.recordRef ?? "");
            if (!record)
              throw new Error(`Unknown company record: ${command.recordRef}`);
            text = record.text;
            label = record.label;
          } else {
            const page = await fetchPublicHtml(command.url ?? "");
            text = htmlToExtractableText(page.html).slice(0, 4000);
          }
          const finding: FindingInput = {
            sourceClass: (command.source === "company_record"
              ? "company_record"
              : "public_web") as SourceClass,
            label,
            text,
            ...(command.url ? { url: command.url } : {}),
            ...(command.recordRef ? { recordRef: command.recordRef } : {}),
            observedAt: Date.now(),
          };
          await ctx.runMutation(internal.objectives.recordFinding, {
            objectiveKey,
            runId,
            finding,
          });
          return `Observation recorded: ${label}`;
        }
        case "record_finding": {
          // Model-recorded finding: bounded text, persisted as-is.
          const finding = command.finding;
          if (!finding) throw new Error("record_finding requires a finding");
          await ctx.runMutation(internal.objectives.recordFinding, {
            objectiveKey,
            runId,
            finding,
          });
          return `Finding recorded: ${finding.label}`;
        }
        case "submit_result": {
          await ctx.runMutation(internal.objectives.submitResult, {
            objectiveKey,
            runId,
            result: command.result as {
              summary: string;
              fit: string;
              risks: string[];
              unknowns: string[];
              recommendedNextAction: string;
            },
          });
          return "Structured result stored; completion still requires application proof";
        }
        case "request_completion": {
          const observation = await ctx.runQuery(
            internal.objectives.readWorkerObservation,
            { objectiveKey },
          );
          if (observation.unmetCompletionRequirements.length > 0)
            throw new Error(
              `Completion refused: ${observation.unmetCompletionRequirements.join("; ")}`,
            );
          return "Application proof requirements met; the run finalizes on return";
        }
        default:
          throw new Error(`Unknown worker command: ${command.type}`);
        }
    },
  };
}

// Scheduled live execution of the assigned worker. Fails closed without
// deliberate model selection (AI_MODEL + LIVE_AI_ENABLED + API key).
export const executeRun = internalAction({
  args: { objectiveKey: v.string(), runId: v.string() },
  returns: v.object({
    completed: v.boolean(),
    unmet: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<{ completed: boolean; unmet: string[] }> => {
    const row = await ctx.runQuery(internal.objectives.getObjectiveInternal, {
      objectiveKey: args.objectiveKey,
    });
    const contract: WorkContract = row.data.workItems[0].contract;
    const port = makeConvexPort(ctx, args.objectiveKey, args.runId);

    let failureReason: string | undefined;
    try {
      await runWorker(port, contract, { env: process.env });
    } catch (error) {
      // Safe provider-error categorization: operational text only.
      const message = error instanceof Error ? error.message : "Worker run failed";
      failureReason = message.slice(0, 500);
    }
    return ctx.runMutation(internal.objectives.finishRun, {
      objectiveKey: args.objectiveKey,
      runId: args.runId,
      ...(failureReason ? { failed: true, failureReason } : {}),
    });
  },
});

// Internal read of the raw record for actions.
export const getObjectiveInternal = internalQuery({
  args: { objectiveKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => loadObjective(ctx.db, args.objectiveKey),
});

// ── Public read model (UI) ──────────────────────────────────────────────────

export const getObjective = query({
  args: { objectiveKey: v.string() },
  returns: v.union(
    v.object({
      record: v.any(),
      evidence: v.array(vEvidenceData),
      events: v.array(activityEvent),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    if (!row) return null;
    const [evidence, events] = await Promise.all([
      listEvidence(ctx.db, args.objectiveKey),
      listEvents(ctx.db, args.objectiveKey),
    ]);
    return {
      record: row.data,
      evidence: evidence.map(({ id, ...data }) => data),
      events,
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
      .map((row) => ({
        key: row.key,
        request: row.data.request,
        state: row.data.state,
        updatedAt: row.data.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  },
});
