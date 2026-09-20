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
import { activityEvent, objectiveRecord, workContract } from "./objectiveValidators";
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
import { CURRENT_RESOURCE_INVENTORY, RESEARCH_ROLE, GROWTH_ROLE } from "../lib/objective/policy";
import { sourceIdentity } from "../lib/objective/contract";
import { toolPermissionsForCapabilities } from "../lib/workforce/permissions";
import { createWorkerSpec } from "../lib/workforce/workers";
import {
  M1_ROLE_REQUIREMENTS,
  assertRoleRequirementsSatisfied,
  roleKeyForGrantedPermissions,
} from "../lib/objective/planner";
import {
  LEASE_MS,
  decideFinalization,
  fenceRunWrite,
} from "../lib/objective/runGuards";
import { providerConfiguration } from "../lib/worker/modelSelection";
import {
  CANONICAL_LAUNCH_ARTIFACT,
  CANONICAL_OBJECTIVE_REQUEST,
} from "../lib/objective/seedData";
import { createArtifact, applyArtifactChange } from "../lib/objective/artifact";
import type { ResourceClass } from "../lib/workforce/types";
import type {
  ActivityEvent,
  ActivityResult,
  EvidenceRecord,
  ObjectiveRecord,
  PlannerProposal,
  ValidatedPlan,
  WorkerRun,
  WorkContract,
  WorkerSpec,
  WorkItem,
} from "../lib/workforce";
import type { ResourceNeed } from "../lib/objective/resourceNeed";
import type { SourcingDecisionRecord } from "../lib/objective/resourceNeed";
import type { CandidateAssessment } from "../lib/market/assessment";
import type { MarketOffering } from "../lib/market/discovery";
import {
  currentUnresolvedValidatedGap,
  listInputObligations,
  validateMissingInputProposal,
  type MissingInputProposal,
  type UnconfirmedInputFinding,
} from "../lib/objective/inputDiagnosis";
import {
  checkInputAvailability,
} from "../lib/objective/inputAvailability";
import type { Requirement } from "../lib/management/types";
import type { CompanyArtifact } from "../lib/objective/artifact";
import type { WorkerRecord } from "../lib/management/types";

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
function validatePlanningInput(
  proposal: PlannerProposal,
): {
  validated: ValidatedPlan;
  grantedPermissions: string[];
  roleKey: "RESEARCH_ROLE" | "GROWTH_ROLE";
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
  const roleKey = roleKeyForGrantedPermissions(grantedPermissions);
  const role = M1_ROLE_REQUIREMENTS[roleKey];
  const roleCheck = assertRoleRequirementsSatisfied({
    grantedPermissions,
    role,
  });
  if (!roleCheck.ok)
    throw new Error(
      `${roleKey} cannot be satisfied by this plan: missing ${roleCheck.missing.join(", ")}`,
    );
  return { validated, grantedPermissions, roleKey };
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
    // R3 A1 — a submitted objective enters the MANAGEMENT engine, not only the
    // M2 planner. Interpretation is the durable chain
    //   beginInterpretation (reserve) → proposeInterpretation (model, "use node")
    //   → applyInterpretation (persist contract + semantic requirements + wake).
    // It never changes `state`, so the accepted M2 planning path keeps working on
    // a "received" row; what it adds is the Outcome Contract the engine needs.
    await ctx.scheduler.runAfter(0, internal.management.beginInterpretation, {
      objectiveKey: key,
      at: now,
    });
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
    //    throws here — before any work item, contract or run exists. The role
    //    is DERIVED from the validated capability envelope (not from a keyword
    //    scan of the request text), so the runtime carries no scenario routing.
    const { validated, roleKey } = validatePlanningInput({
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

    // 3. Worker resolution over the REAL persistent inventory (MAKE primitive).
    //    The M2 empty-inventory defect is fixed: the `workers` table is the
    //    inventory, so a capable, unleased worker is genuinely REUSED across
    //    objectives instead of being synthesized fresh on every plan. Records
    //    are mapped to the WorkerSpec shape resolveWorker sanitizes.
    const workerRows = await ctx.db.query("workers").collect();
    const inventory: WorkerSpec[] = workerRows.map((row) => {
      const data = (row as { data: WorkerRecord }).data;
      return createWorkerSpec(data.capabilityKeys);
    });
    const resolution = resolveWorker({
      requiredCapabilityKeys: validated.capabilityKeys,
      inventory,
    });
    // Persist the resolution into the workforce so REUSE keeps working on the
    // next plan and worker→worker creation is never needed (M4 workforce rule).
    const workerKey = (resolution.worker as WorkerSpec).workerKey;
    const persisted = inventory.find(
      (candidate) => candidate.workerKey === workerKey,
    );
    if (!persisted) {
      const spec = resolution.worker as WorkerSpec;
      await ctx.db.insert("workers", {
        workerKey,
        data: {
          workerKey,
          displayName: spec.workerKey,
          capabilityKeys: [...spec.capabilityKeys],
          dynamicCapabilities: [],
          responsibility: spec.responsibility,
          lifecycle: "available",
          reservedBy: null,
          verifiedAssignments: [],
          contextRefs: [],
          createdByObjective: args.objectiveKey,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    // 4. Bind the WorkContract from the validated plan + role policy. The
    //    contract carries DISTINCT-source proof requirements, so proof is a
    //    property of the assignment rather than a count of persisted rows.
    const isGrowth = roleKey === "GROWTH_ROLE";
    const rolePolicy = isGrowth ? GROWTH_ROLE : RESEARCH_ROLE;
    // Generic assignment text: the role POLICY owns responsibility, source
    //    proofs and proof counts; the assignment only restates the founder's
    //    request within the bounded responsibility. No scenario vocabulary.
    const assignment = `${rolePolicy.responsibility} Objective (untrusted data): "${record.request}". Stay within the granted tool permissions; the application records and verifies all proof.`;
    const contract = createWorkContract({
      assignment,
      idempotencyScope: `${args.objectiveKey}:wi-1`,
      worker: resolution.worker as WorkerSpec,
      sourceProofs: rolePolicy.sourceProofs.map((proof) => ({ ...proof })),
    });

    const workItemId = `${args.objectiveKey}:wi-1`;
    const seededArtifacts: CompanyArtifact[] = isGrowth
      ? [
          createArtifact({
            key: CANONICAL_LAUNCH_ARTIFACT.key,
            objectiveKey: args.objectiveKey,
            label: CANONICAL_LAUNCH_ARTIFACT.label,
            content: CANONICAL_LAUNCH_ARTIFACT.initialContent,
            runId: "seed",
            at: now,
          }),
        ]
      : [];
    const updated: ObjectiveRecord = {
      ...record,
      state: "ready_to_execute",
      activity: "Plan validated; internal worker assigned.",
      plan,
      workItems: [
        {
          id: workItemId,
          objectiveKey: args.objectiveKey,
          title: rolePolicy.title,
          assignment,
          workerKey: contract.workerKey,
          state: "assigned",
          contract,
          runs: [],
        },
      ],
      run: null,
      ...(seededArtifacts.length > 0
        ? { companyArtifacts: seededArtifacts }
        : {}),
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
    const isM4Managed = Boolean(
      (record as unknown as { management?: { contractId: string | null } }).management
        ?.contractId,
    );
    const updated: ObjectiveRecord = {
      ...record,
      // M4: lease expiry fails the run/assignment, not the whole objective.
      state: isM4Managed ? "executing" : "failed",
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
// Optional missingInputs are validated by reportMissingInput (same authority path
// as request_resource) — never trusted as scarcity facts on their own.
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
      missingInputs: v.optional(
        v.array(
          v.object({
            inputCheckId: v.string(),
            resourceClass: v.string(),
            purpose: v.string(),
            reasonOwnedInsufficient: v.string(),
            supportingEvidenceIds: v.array(v.string()),
          }),
        ),
      ),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    assertActiveRun(row.data, args.runId, now);
    const { missingInputs: _ignored, ...resultFields } = args.result;
    const result: ActivityResult = {
      ...resultFields,
      completedAt: now,
      runId: args.runId,
    };
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
    acquiredInputs: v.array(
      v.object({
        intentId: v.string(),
        resultEvidenceId: v.string(),
        providerId: v.string(),
        serviceId: v.string(),
        resourceClass: v.string(),
        provenance: v.string(),
        responseHash: v.string(),
        text: v.string(),
      }),
    ),
    unmetCompletionRequirements: v.array(v.string()),
    yieldReason: v.union(v.string(), v.null()),
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
      currentRunId: args.runId,
    });
    const unmet = [...check.unmet];
    // Mutation-required assignments (envelope grants update_company_artifact)
    // cannot finish on observations/summary alone — M2 legacy and M4 managed
    // alike. The CONTENT change must come from this run.
    const requiresArtifactMutation = workItem.contract.allowedToolPermissions.includes(
      "update_company_artifact",
    );
    if (requiresArtifactMutation) {
      const artifactChanged = (record.companyArtifacts ?? []).some(
        (a) => a.provenanceRunId === args.runId && a.version > 1,
      );
      if (!artifactChanged) {
        unmet.push("company_artifact: no version change by this run");
      }
      const isM4Managed = (record as unknown as { management?: { contractId: string | null } }).management?.contractId != null;
      if (!isM4Managed) {
        const hasNeed = (record.resourceNeeds ?? []).some(
          (n) => n.proposedByRunId === args.runId,
        );
        if (!hasNeed) {
          unmet.push("resource_need: growth run must propose a resource need");
        }
      }
    }

    const validatedGap = currentUnresolvedValidatedGap(
      (record.resourceNeeds ?? []) as ResourceNeed[],
      (record.acquisitionResults ?? []).map((a) => ({
        requirementKey: a.requirementKey,
        contractRevision: a.contractRevision,
        resourceClass: a.resourceClass,
        verifiedAt: a.verifiedAt,
      })),
    );
    // Historical lastDeliveryFailureClass is diagnostic only — it must not
    // authorize a yield for a newly resumed run with no current gap.
    const yieldReason = validatedGap
      ? `INPUT_BLOCKED: validated gap ${validatedGap.resourceClass} — stop and yield to management`
      : null;

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
      acquiredInputs: await verifiedAcquiredInputs(ctx.db, record),
      unmetCompletionRequirements: unmet,
      yieldReason,
    };
  },
});

// M6.1: acquisitions the worker may read are exactly those whose intent reached
// `verified`. A recorded-but-unverified provider result is never presented as
// acquired input, so the worker can only build on truth the application holds.
async function verifiedAcquiredInputs(
  db: QueryCtx["db"],
  record: ObjectiveRecord,
): Promise<
  Array<{
    intentId: string;
    resultEvidenceId: string;
    providerId: string;
    serviceId: string;
    resourceClass: string;
    provenance: string;
    responseHash: string;
    text: string;
  }>
> {
  const acquisitions = record.acquisitionResults ?? [];
  if (acquisitions.length === 0) return [];
  const intentRows = await db
    .query("executionIntents")
    .withIndex("by_objective", (q) => q.eq("objectiveKey", record.key))
    .collect();
  const verified = new Set(
    intentRows
      .filter((row) => row.data.state === "verified")
      .map((row) => row.data.intentId),
  );
  return acquisitions
    .filter((result) => verified.has(result.intentId))
    .map((result) => ({
      intentId: result.intentId,
      resultEvidenceId: result.resultEvidenceId,
      // Intent targets are nullable; the read port reports honest "unknown"
      // placeholders rather than leaking nulls into the worker surface.
      providerId: result.providerId ?? "unknown",
      serviceId: result.serviceId ?? "unknown",
      resourceClass: result.resourceClass ?? "unknown",
      provenance: result.provenance,
      responseHash: result.responseHash,
      text: result.content.slice(0, 2000),
    }));
}

// ── Application-owned M2 mutations (artifact + sourced need persistence) ─────

// Company artifact mutation (growth MAKE proof).
export const updateCompanyArtifact = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    content: v.string(),
    changeNote: v.string(),
    // M6.1: provenance the worker CLAIMS for this revision. Claimed ids must
    // reference acquisition results whose intent is verified with a matching
    // resultEvidenceId; the application owns the truth, never the model.
    usedAcquisitionEvidenceIds: v.optional(v.array(v.string())),
  },
  returns: v.object({ key: v.string(), version: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    assertActiveRun(record, args.runId, now);
    const artifacts = [...(record.companyArtifacts ?? [])];
    if (artifacts.length === 0) {
      throw new Error("No company artifact seeded for this objective");
    }
    // Evidence-ref validation: the verified acquisition set is the authority.
    // If verified acquisitions exist and the revision cites none, the revision
    // would silently discard its own provenance — refuse it.
    const intentRows = await ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    const verifiedIntents = new Map(
      intentRows
        .filter((row) => row.data.state === "verified")
        .map((row) => [row.data.intentId, row.data]),
    );
    const verifiedAcquisitions = (record.acquisitionResults ?? []).filter(
      (result) => {
        const intent = verifiedIntents.get(result.intentId);
        return (
          intent != null && intent.resultEvidenceId === result.resultEvidenceId
        );
      },
    );
    const claimedIds = [...new Set(args.usedAcquisitionEvidenceIds ?? [])];
    if (verifiedAcquisitions.length > 0 && claimedIds.length === 0) {
      throw new Error(
        "Artifact revision must cite the verified acquisition evidence it used (usedAcquisitionEvidenceIds)",
      );
    }
    for (const id of claimedIds) {
      const result = verifiedAcquisitions.find(
        (candidate) => candidate.resultEvidenceId === id,
      );
      if (!result) {
        throw new Error(
          `usedAcquisitionEvidenceIds: ${id} is not a verified acquisition result for this objective`,
        );
      }
    }
    const idx = 0;
    const next = applyArtifactChange(artifacts[idx], {
      content: args.content,
      changeNote: args.changeNote,
      runId: args.runId,
      at: now,
      ...(claimedIds.length > 0 ? { usedAcquisitionEvidenceIds: claimedIds } : {}),
    });
    artifacts[idx] = next;
    const updated: ObjectiveRecord = {
      ...record,
      companyArtifacts: artifacts,
      activity: `Company artifact ${next.key} → v${next.version}`,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "evidence",
      `Artifact ${next.key} updated to version ${next.version} by ${args.runId}${
        claimedIds.length > 0
          ? `; used acquired evidence: ${claimedIds.join(", ")}`
          : ""
      }`,
      now,
    );
    return { key: next.key, version: next.version };
  },
});

// Persist a governed input-availability check as an application observation.
// Only NOT_AVAILABLE results may later support validated missing-input gaps.
export const recordInputAvailabilityCheck = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    inputCheckId: v.string(),
    requirementKey: v.union(v.string(), v.null()),
    workItemId: v.union(v.string(), v.null()),
  },
  returns: v.object({
    status: v.string(),
    inputCheckId: v.string(),
    detail: v.string(),
    evidenceId: v.string(),
    evidenceText: v.string(),
    label: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    assertActiveRun(row.data, args.runId, now);
    const record = row.data;
    const workItem =
      record.workItems.find((wi) => wi.id === args.workItemId) ??
      record.workItems[0];
    if (!workItem) throw new Error("no work item for input availability check");

    let requiredResourceClasses: string[] = [];
    let mustBeTrue = workItem.contract.assignment;
    let expectedOutput: string | null = null;
    let contractRevision: number | null = null;
    if (args.requirementKey) {
      const reqRows = await ctx.db
        .query("requirements")
        .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
        .collect();
      const reqRow = reqRows.find((r) => {
        const data = (r as { data: Requirement }).data;
        return data.requirementKey === args.requirementKey;
      });
      if (reqRow) {
        const requirement = (reqRow as { data: Requirement }).data;
        requiredResourceClasses = requirement.requiredResourceClasses ?? [];
        mustBeTrue = requirement.mustBeTrue;
        expectedOutput = requirement.expectedOutput ?? null;
        contractRevision = requirement.contractRevision;
      }
    }

    const evidence = await listEvidence(ctx.db, args.objectiveKey);
    const obligations = listInputObligations({
      requiredResourceClasses,
      sourceProofs: workItem.contract.sourceProofs,
      mustBeTrue,
      expectedOutput,
    });
    const acquisitions = (record.acquisitionResults ?? []).map((a) => ({
      requirementKey: a.requirementKey,
      contractRevision: a.contractRevision,
      resourceClass: a.resourceClass ?? "unknown",
      verifiedAt: a.verifiedAt,
    }));
    const result = checkInputAvailability({
      inputCheckId: args.inputCheckId,
      obligations,
      sourceProofs: workItem.contract.sourceProofs,
      controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
      evidence,
      runId: args.runId,
      requirementKey: args.requirementKey,
      contractRevision,
      acquisitions,
    });

    const recordRef = `input_check/${result.inputCheckId || "unknown"}/${result.status}`;
    const derived = sourceIdentity({
      sourceClass: "company_record",
      recordRef,
    });
    if (!derived || derived !== `record:${recordRef}`)
      throw new Error("input availability check produced an invalid source identity");

    const evidenceId = `ev_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const evidenceRow: EvidenceRecord = {
      sourceClass: "company_record",
      label: result.label,
      text: result.evidenceText,
      origin: "application_observation",
      sourceId: derived,
      recordRef,
      observedAt: now,
      id: evidenceId,
      recordedBy: workItem.workerKey,
      runId: args.runId,
    };
    await recordEvidenceRow(ctx.db, args.objectiveKey, evidenceRow);
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "evidence",
      `Input availability ${result.status} for ${result.inputCheckId || "unknown"}`,
      now,
    );
    return {
      status: result.status,
      inputCheckId: result.inputCheckId,
      detail: result.detail,
      evidenceId,
      evidenceText: result.evidenceText,
      label: result.label,
    };
  },
});

// Persist a worker missing-input proposal after APPLICATION validation.
// Validated → authoritative ResourceNeed (active) + Requirement class binding.
// Refused → at most an unconfirmed diagnostic; eligibility unchanged.
export const reportMissingInput = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    requirementKey: v.string(),
    workItemId: v.union(v.string(), v.null()),
    proposal: v.object({
      inputCheckId: v.string(),
      resourceClass: v.string(),
      purpose: v.string(),
      reasonOwnedInsufficient: v.string(),
      supportingEvidenceIds: v.array(v.string()),
    }),
  },
  returns: v.object({
    validated: v.boolean(),
    needId: v.union(v.string(), v.null()),
    needStatus: v.union(v.string(), v.null()),
    refusalCode: v.union(v.string(), v.null()),
    detail: v.string(),
    shouldYield: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    assertActiveRun(record, args.runId, now);

    const management = (
      record as unknown as {
        management?: { contractId?: string | null };
      }
    ).management;
    const isM4Managed = Boolean(management?.contractId);

    // Load current Requirement for this objective.
    const reqRows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    const reqRow = reqRows.find((r) => {
      const data = (r as { data: Requirement }).data;
      return data.requirementKey === args.requirementKey;
    });
    if (!reqRow) {
      return {
        validated: false,
        needId: null,
        needStatus: null,
        refusalCode: "requirement_not_found",
        detail: "no current Requirement for this run",
        shouldYield: false,
      };
    }
    const requirement = (reqRow as { data: Requirement }).data;

    // Contract revision must match the live outcome contract when managed.
    let contractRevision = requirement.contractRevision;
    if (isM4Managed) {
      const contractRows = await ctx.db
        .query("outcomeContracts")
        .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
        .collect();
      const live = contractRows
        .map((r) => ({
          revision: (r as { revision: number }).revision,
        }))
        .sort((a, b) => b.revision - a.revision)[0];
      if (live && live.revision !== requirement.contractRevision) {
        return {
          validated: false,
          needId: null,
          needStatus: null,
          refusalCode: "stale_revision",
          detail: "Requirement revision is not current",
          shouldYield: false,
        };
      }
      if (live?.revision != null) contractRevision = live.revision;
    }

    const workItem =
      record.workItems.find((wi) => wi.id === args.workItemId) ??
      record.workItems[0];
    if (!workItem) {
      return {
        validated: false,
        needId: null,
        needStatus: null,
        refusalCode: "work_item_missing",
        detail: "no work item for this run",
        shouldYield: false,
      };
    }

    const evidence = await listEvidence(ctx.db, args.objectiveKey);
    const needId = `need_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const proposal: MissingInputProposal = {
      inputCheckId: args.proposal.inputCheckId,
      resourceClass: args.proposal.resourceClass,
      purpose: args.proposal.purpose,
      reasonOwnedInsufficient: args.proposal.reasonOwnedInsufficient,
      supportingEvidenceIds: args.proposal.supportingEvidenceIds,
    };

    const validated = validateMissingInputProposal(proposal, {
      objectiveKey: args.objectiveKey,
      requirementKey: args.requirementKey,
      contractRevision,
      runId: args.runId,
      workItemId: workItem.id,
      requiredResourceClasses: requirement.requiredResourceClasses ?? [],
      mustBeTrue: requirement.mustBeTrue,
      expectedOutput: requirement.expectedOutput ?? null,
      sourceProofs: workItem.contract.sourceProofs,
      requiredSourceClasses: workItem.contract.requiredSourceClasses,
      controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
      evidence,
      existingNeeds: (record.resourceNeeds ?? []) as ResourceNeed[],
      acquisitions: (record.acquisitionResults ?? []).map((a) => ({
        requirementKey: a.requirementKey,
        contractRevision: a.contractRevision,
        resourceClass: a.resourceClass ?? "unknown",
        verifiedAt: a.verifiedAt,
      })),
      at: now,
      needId,
    });

    if (!validated.ok) {
      const findings = [
        ...((record.unconfirmedInputFindings ?? []) as UnconfirmedInputFinding[]),
        validated.unconfirmed,
      ].slice(-16);
      const updated: ObjectiveRecord = {
        ...record,
        unconfirmedInputFindings: findings,
        updatedAt: now,
        activity: `Unconfirmed input diagnosis: ${validated.refusalCode}`,
      };
      await ctx.db.patch(row._id, { data: updated });
      await appendEvent(
        ctx.db,
        args.objectiveKey,
        "decision",
        `Missing-input proposal refused (${validated.refusalCode}): ${validated.detail}`.slice(
          0,
          500,
        ),
        now,
      );
      return {
        validated: false,
        needId: null,
        needStatus: null,
        refusalCode: validated.refusalCode,
        detail: validated.detail,
        shouldYield: false,
      };
    }

    // Persist authoritative need (dedupe-aware).
    const needs = [...(record.resourceNeeds ?? [])] as ResourceNeed[];
    const existingIdx = needs.findIndex(
      (n) => n.id === validated.need.id || n.dedupeKey === validated.need.dedupeKey,
    );
    if (existingIdx >= 0) needs[existingIdx] = validated.need;
    else needs.push(validated.need);

    // Bind the validated class onto the Requirement so decision truth retains it.
    const priorClasses = [...(requirement.requiredResourceClasses ?? [])];
    const nextClasses = priorClasses.includes(validated.need.resourceClass)
      ? priorClasses
      : [...priorClasses, validated.need.resourceClass];
    const classesChanged = nextClasses.length !== priorClasses.length;
    if (classesChanged || requirement.strategy !== null) {
      const bound: Requirement = {
        ...requirement,
        requiredResourceClasses: nextClasses,
        // Yield clears in-flight MAKE strategy so management redecides on new facts.
        strategy: null,
        updatedAt: now,
      };
      await ctx.runMutation(internal.internal.workforce.putRequirement, {
        objectiveKey: bound.objectiveKey,
        requirementKey: bound.requirementKey,
        data: bound,
        currentContractRevision: bound.contractRevision,
      });
    }

    const workItems = record.workItems.map((wi) =>
      wi.id === workItem.id
        ? { ...wi, state: "waiting_for_resource" as const }
        : wi,
    );

    const updated: ObjectiveRecord = {
      ...record,
      resourceNeeds: needs,
      workItems,
      lastDeliveryFailureClass: "INPUT_BLOCKED",
      state: isM4Managed ? "waiting_for_resource" : record.state,
      activity: `Validated input gap ${validated.need.id} (${validated.need.resourceClass})`,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "decision",
      `Validated missing input ${validated.need.resourceClass} for ${args.requirementKey}; worker may yield.`,
      now,
    );

    return {
      validated: true,
      needId: validated.need.id,
      needStatus: validated.need.status,
      refusalCode: null,
      detail: `authoritative ResourceNeed ${validated.need.id} status=${validated.need.status}`,
      shouldYield: true,
    };
  },
});

// Persist a completed sourceResourceNeed result (computed in the Node action so
// CLI/spawn stays out of the Convex isolate). Application-owned; no spend.
export const persistSourcedResource = internalMutation({
  args: {
    objectiveKey: v.string(),
    runId: v.string(),
    need: v.any(),
    created: v.boolean(),
    decision: v.union(v.any(), v.null()),
    assessments: v.array(v.any()),
    offerings: v.array(v.any()),
  },
  returns: v.object({
    needId: v.string(),
    created: v.boolean(),
    decision: v.union(v.string(), v.null()),
    needStatus: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await loadObjective(ctx.db, args.objectiveKey);
    const record = row.data;
    assertActiveRun(record, args.runId, now);

    const need = args.need as ResourceNeed;
    const decision = args.decision as SourcingDecisionRecord | null;
    const resultAssessments = args.assessments as CandidateAssessment[];
    const resultOfferings = args.offerings as MarketOffering[];

    const needs = [...(record.resourceNeeds ?? [])] as ResourceNeed[];
    const decisions = [
      ...(record.sourcingDecisions ?? []),
    ] as SourcingDecisionRecord[];
    const assessments = [
      ...(record.candidateAssessments ?? []),
    ] as { decisionId: string; assessments: CandidateAssessment[] }[];
    const offerings = [
      ...(record.marketOfferings ?? []),
    ] as MarketOffering[];

    if (args.created) {
      const existingIdx = needs.findIndex((n) => n.id === need.id);
      if (existingIdx >= 0) needs[existingIdx] = need;
      else needs.push(need);
      if (decision) {
        decisions.push(decision);
        assessments.push({
          decisionId: decision.id,
          assessments: resultAssessments,
        });
      }
      for (const o of resultOfferings) {
        if (!offerings.some((x) => x.offeringId === o.offeringId)) {
          offerings.push(o);
        }
      }
    }

    const waiting = need.status === "buy_pending";
    const workItems = record.workItems.map((wi, i) =>
      i === 0 && waiting
        ? { ...wi, state: "waiting_for_resource" as const }
        : wi,
    );

    const updated: ObjectiveRecord = {
      ...record,
      resourceNeeds: needs,
      sourcingDecisions: decisions,
      candidateAssessments: assessments,
      marketOfferings: offerings,
      workItems,
      activity: waiting
        ? `Resource need ${need.id} → buy_pending (${decision?.decision ?? "n/a"})`
        : `Resource need ${need.id} status ${need.status}`,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "decision",
      waiting
        ? `BUY pending for ${need.resourceClass}; discovery source=${resultOfferings[0]?.source.kind ?? "none"}; selected=${decision?.selectedOfferingId ?? "none"}`
        : `Resource need sourced: ${decision?.decision ?? "deduped"} (${need.status})`,
      now,
    );
    return {
      needId: need.id,
      created: args.created,
      decision: decision?.decision ?? null,
      needStatus: need.status,
    };
  },
});

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
    /** Actual tool invocations during this run (was previously a dead counter). */
    toolCalls: v.optional(v.number()),
    /** Safe one-line runtime telemetry (names/counts only). */
    telemetrySummary: v.optional(v.string()),
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
                currentRunId: args.runId,
              }).unmet
            : ["Run was superseded before it could complete"];
      return { completed: decision.completed, unmet };
    }

    const workItem = { ...record.workItems[0] };
    const runs = [...workItem.runs];
    const runIndex = runs.findIndex((candidate) => candidate.id === args.runId);
    const run = { ...runs[runIndex] };
    if (typeof args.toolCalls === "number" && args.toolCalls >= 0) {
      run.toolCalls = args.toolCalls;
    }
    const managementEarly = (
      record as unknown as { management?: { contractId: string | null } }
    ).management;
    const isM4Managed = Boolean(managementEarly?.contractId);

    if (args.telemetrySummary) {
      await appendEvent(
        ctx.db,
        args.objectiveKey,
        "system",
        `Worker telemetry: ${args.telemetrySummary}`.slice(0, 500),
        now,
      );
    }

    if (args.failed) {
      run.status = "failed";
      run.summary = args.failureReason ?? "Run failed";
      runs[runIndex] = run;
      workItem.runs = runs;
      workItem.state = "failed";
      // M4: one failed assignment is delivery DATA for the manager to re-decide,
      // not a terminal objective failure. M2-legacy keeps historical spine fail.
      // Ordinary execution failure does NOT invent missing inputs.
      const updated: ObjectiveRecord = {
        ...record,
        state: isM4Managed ? "executing" : "failed",
        lastDeliveryFailureClass: "EXECUTION_FAILED",
        activity: isM4Managed
          ? `Assignment run failed; manager will re-decide. ${args.failureReason ?? "unknown"}`.slice(
              0,
              500,
            )
          : `Run failed: ${args.failureReason ?? "unknown"}`,
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
      currentRunId: args.runId,
    });

    // Mutation-required assignments cannot finish without a version change by
    // THIS run — applies to M4-managed work as well as M2 legacy growth.
    const requiresArtifactMutation = workItem.contract.allowedToolPermissions.includes(
      "update_company_artifact",
    );
    if (requiresArtifactMutation) {
      const artifacts = record.companyArtifacts ?? [];
      const artifactChanged = artifacts.some(
        (a) => a.provenanceRunId === args.runId && a.version > 1,
      );
      if (!artifactChanged) {
        check.complete = false;
        check.unmet = [
          ...check.unmet,
          "company_artifact: no version change by this run",
        ];
      }
    }

    const buyPending = (record.resourceNeeds ?? []).some(
      (n) => n.status === "buy_pending",
    );
    // Current unresolved validated gap only — historical lastDeliveryFailureClass
    // is diagnostic and must not re-block a resumed run after coverage.
    const inputBlocked =
      currentUnresolvedValidatedGap(
        (record.resourceNeeds ?? []) as ResourceNeed[],
        (record.acquisitionResults ?? []).map((a) => ({
          requirementKey: a.requirementKey,
          contractRevision: a.contractRevision,
          resourceClass: a.resourceClass,
          verifiedAt: a.verifiedAt,
        })),
      ) != null;

    run.status = "stopped";
    runs[runIndex] = run;
    workItem.runs = runs;

    // BUY pending OR validated input gap: pause for management redecision.
    // INPUT_BLOCKED is not EXECUTION_FAILED — coverage facts changed.
    if (buyPending || inputBlocked) {
      run.summary = inputBlocked && !buyPending
        ? "Paused: INPUT_BLOCKED — validated missing input; awaiting management redecision"
        : "Paused: waiting for external resource acquisition";
      workItem.state = "waiting_for_resource";
      const updated: ObjectiveRecord = {
        ...record,
        state: "waiting_for_resource",
        lastDeliveryFailureClass: inputBlocked ? "INPUT_BLOCKED" : record.lastDeliveryFailureClass,
        activity: inputBlocked && !buyPending
          ? "INPUT_BLOCKED — validated input gap; worker yielded; no payment created."
          : "Waiting for external resource — BUY pending; no payment created.",
        workItems: [workItem],
        run,
        updatedAt: now,
      };
      await ctx.db.patch(row._id, { data: updated });
      await appendEvent(
        ctx.db,
        args.objectiveKey,
        "decision",
        inputBlocked && !buyPending
          ? "Objective waiting_for_resource: INPUT_BLOCKED validated gap; no spend."
          : "Objective waiting_for_resource: buy_pending need unresolved; no spend.",
        now,
      );
      return {
        completed: false,
        unmet: [
          inputBlocked && !buyPending
            ? "INPUT_BLOCKED: validated missing input"
            : "waiting_for_resource: buy_pending need unresolved",
        ],
      };
    }

    run.summary = check.complete
      ? "Application accepted completion"
      : `Incomplete: ${check.unmet.join("; ")}`;
    workItem.state = check.complete ? "completed" : "failed";

    // CP7: completion inference → completion-gate proposal path.
    // The spine's evaluateCompletion is the spine's own work-item verdict,
    // not the objective's completion authority. When check.complete is true,
    // the spine PROPOSES completion to the independent gate (lib/management/completion.ts).
    // The gate re-derives against the OutcomeContract; it never inherits the spine verdict.
    // Spread existing management so decisionAttempts / fingerprints / cursors survive.
    type ManagementBlob = {
      contractId: string | null;
      currentContractRevision?: number;
      controlNotes?: unknown[];
      [key: string]: unknown;
    };
    let management = (record as unknown as { management?: ManagementBlob }).management;
    if (check.complete) {
      const proposalNote = {
        type: "completion_proposed",
        proposalId: `prop_${args.objectiveKey}_${args.runId}`,
        runId: args.runId,
        spineVerdict: "complete",
        proposedAt: now,
      };
      const existingNotes = management?.controlNotes ?? [];
      management = {
        ...(management ?? { contractId: null }),
        contractId: management?.contractId ?? null,
        controlNotes: [...existingNotes, proposalNote],
      };
    }

    // M4-managed rows (management.contractId set) do NOT transition to "completed":
    // the independent gate decides. Incomplete/failed assignment delivery is also
    // NOT a terminal objective failure under M4 — the manager clears strategy and
    // re-decides. M2-legacy rows keep the historical spine state transition.
    const recordState = check.complete
      ? isM4Managed
        ? "executing" // M4: awaiting the independent gate
        : "completed" // M2-legacy: historical spine verdict
      : isM4Managed
        ? "executing" // M4: failed delivery → manager re-decides
        : "failed";
    const recordActivity = check.complete
      ? isM4Managed
        ? "Completion proposed; awaiting the independent gate."
        : "Work completed with verified proof."
      : isM4Managed
        ? `Assignment ended without required proof; manager will re-decide. ${check.unmet.join("; ")}`.slice(
            0,
            500,
          )
        : `Run ended without required proof: ${check.unmet.join("; ")}`;

    const updated = {
      ...record,
      state: recordState,
      activity: recordActivity,
      workItems: [workItem],
      run,
      ...(management ? { management } : {}),
      updatedAt: now,
    } as ObjectiveRecord;
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      check.complete ? "result" : "system",
      check.complete
        ? "Run finished with proof the application accepted; completion proposed to the independent gate."
        : `Objective not completed: ${check.unmet.join("; ")}`,
      now,
    );
    return { completed: check.complete, unmet: check.unmet };
  },
});

// ── R3 A2: a MANAGED run — the same bounded runtime, entered by the engine ──
//
// M4's dispatch must execute through the worker runtime that M1–M3 already
// proved (lease, abort budget, fenced writes, expiry backstop, worker-result
// wake). What it may NOT do is reuse `startRun`, whose preconditions belong to
// the M2 planning path (`state === "ready_to_execute"`, random run id, UI
// trigger). So this mutation owns the ONE thing the managed path needs: writing
// the run row for an M4 assignment, idempotent on the run identity the
// assignment derived from its authorization.
//
// Idempotency is structural, not hopeful: the run id is derived from the
// assignment id, and a replay that finds that id already recorded returns
// `started: false` without touching the aggregate. One authorization ⇒ one run.
export const startManagedRun = internalMutation({
  args: {
    objectiveKey: v.string(),
    assignmentId: v.string(),
    runId: v.string(),
    workerKey: v.string(),
    title: v.string(),
    contract: workContract,
    at: v.number(),
  },
  returns: v.object({
    started: v.boolean(),
    reason: v.optional(v.string()),
    replayed: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<{ started: boolean; reason?: string; replayed?: boolean }> => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    if (!row) return { started: false, reason: "objective row missing" };
    const record = (row as ObjectiveRow).data;

    // The managed boundary: this seam exists for the M4 engine only. A row with
    // no Outcome Contract is M2 history and stays on the M2 planning path.
    const management = (record as unknown as { management?: { contractId?: string | null } }).management;
    if (!management?.contractId)
      return { started: false, reason: "objective is not M4-managed" };

    const now = args.at;
    // Replay: this exact run is already recorded → no second effect.
    if (record.run && record.run.id === args.runId)
      return { started: false, replayed: true, reason: `run ${args.runId} already recorded` };
    // One live run per aggregate: a different run holding the lease is a
    // DEFERRAL, never a takeover. The engine re-dispatches on that run's wake.
    if (record.run && record.run.status === "running" && record.run.leaseUntil > now)
      return { started: false, reason: `run ${record.run.id} still holds the lease` };

    let selection: { model: string; reason: string };
    try {
      const configured = providerConfiguration(process.env);
      selection = { model: configured.model, reason: configured.modelSelectionReason };
    } catch (error) {
      selection = {
        model: "not configured",
        reason: `live model is not configured (${error instanceof Error ? error.message : "unknown"}); the bounded runtime will refuse and the run fails closed`,
      };
    }

    const run: WorkerRun = {
      id: args.runId,
      workItemId: `wi:${args.assignmentId}`,
      status: "running",
      startedAt: now,
      leaseUntil: now + LEASE_MS,
      // Deliberate model selection stays the runtime's own fail-closed decision;
      // the run row records what it can honestly say NOW, so an unconfigured
      // deployment reads as unconfigured rather than as a chosen model.
      model: selection.model,
      modelSelectionReason: selection.reason,
      toolCalls: 0,
      summary: "",
    };
    const workItem: WorkItem = {
      id: run.workItemId,
      objectiveKey: args.objectiveKey,
      title: args.title,
      assignment: args.contract.assignment,
      workerKey: args.workerKey,
      state: "running",
      contract: args.contract,
      runs: [run],
    };
    const updated: ObjectiveRecord = {
      ...record,
      state: "executing",
      activity: `Managed assignment ${args.assignmentId} running as ${run.id}.`,
      workItems: [workItem],
      run,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, { data: updated });
    await appendEvent(
      ctx.db,
      args.objectiveKey,
      "agent",
      `Managed run started for assignment ${args.assignmentId}: model ${run.model} (${run.modelSelectionReason})`,
      now,
    );
    // The EXISTING bounded executor and the EXISTING expiry fence. Nothing new
    // runs a worker, and nothing new terminates one.
    await ctx.scheduler.runAfter(0, internal.objectiveRunner.executeWorker, {
      objectiveKey: args.objectiveKey,
      runId: run.id,
    });
    await ctx.scheduler.runAfter(LEASE_MS, internal.objectives.expireRun, {
      objectiveKey: args.objectiveKey,
      runId: run.id,
    });
    return { started: true };
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
            ...(record.run ? { currentRunId: record.run.id } : {}),
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

// ── M6.1 demo setup (operator-gated, no payment path) ───────────────────────

// Operator gate for the M6.1 canonical demo entrypoints. Constant-time compare
// so the demo operator token is not distinguishable byte-by-byte.
function assertDemoOperator(token: string): void {
  const expected = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  if (!expected || token.length !== expected.length) {
    throw new Error("demo operator is not authorized");
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= token.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (difference !== 0) throw new Error("demo operator is not authorized");
}

// Creates the canonical founder objective with its seeded launch artifact at
// v1 (runId "seed", so the accepted M5 story holds: the final artifact must be
// a materially DIFFERENT version produced by worker execution, not the seed),
// a bounded founder spend grant for justified external acquisition, and the
// management-engine wake. No scenario vocabulary is injected: the canonical
// request is the demo's own fixture text, never a runtime branch.
export const setupCanonicalDemoObjective = mutation({
  args: {
    operatorToken: v.string(),
    request: v.optional(v.string()),
    spendLimitUsd: v.number(),
  },
  returns: v.object({ key: v.string() }),
  handler: async (ctx, args) => {
    assertDemoOperator(args.operatorToken);
    if (!(args.spendLimitUsd > 0) || args.spendLimitUsd > 5) {
      throw new Error("spendLimitUsd must be within (0, 5] for the demo");
    }
    const request = (args.request ?? CANONICAL_OBJECTIVE_REQUEST).trim();
    if (request.length < 8 || request.length > 2000) {
      throw new Error("Objective request is unbounded");
    }
    const now = Date.now();
    const key = `obj_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const record: ObjectiveRecord = {
      key,
      request,
      createdAt: now,
      updatedAt: now,
      state: "received",
      activity: "Canonical demo objective received.",
      plan: null,
      workItems: [],
      run: null,
      result: null,
      companyArtifacts: [
        createArtifact({
          key: CANONICAL_LAUNCH_ARTIFACT.key,
          objectiveKey: key,
          label: CANONICAL_LAUNCH_ARTIFACT.label,
          content: CANONICAL_LAUNCH_ARTIFACT.initialContent,
          runId: "seed",
          at: now,
        }),
      ],
      // Verified acquisitions are appended by the M6.1 simulation boundary.
      acquisitionResults: [],
      // The management engine owns this row from the start (contractId null
      // until beginInterpretation rewrites it with the durable contract; the
      // engine's own guard sets interpretationStatus itself).
      management: {
        contractId: null,
      },
    } as ObjectiveRecord;
    await ctx.db.insert("objectives", { key, data: record });
    await appendEvent(
      ctx.db,
      key,
      "system",
      "Canonical demo objective received (M6.1 setup).",
      now,
    );
    await ctx.runMutation(internal.internal.workforce.putSpendGrant, {
      approvalId: `demo_grant_${key}`,
      objectiveKey: key,
      limitUsd: args.spendLimitUsd,
      at: now,
      note: "Founder-approved demo spend limit for justified external acquisition; this grant authorizes no payment and reaches no payment rail.",
    });
    await appendEvent(
      ctx.db,
      key,
      "system",
      `Founder spend grant recorded (limit ${args.spendLimitUsd} USD); payment rail untouched.`,
      now,
    );
    await ctx.scheduler.runAfter(0, internal.management.beginInterpretation, {
      objectiveKey: key,
      at: now,
    });
    return { key };
  },
});
