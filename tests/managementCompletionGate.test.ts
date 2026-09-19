// R3 A5 — the completion gate RECOMPUTES; it never believes persisted claims.
//
// The R3 finding had two halves, and both are fixed here:
//   (a) the old gate compared `resolution.proofRefs` (EVIDENCE ids) against
//       `proof.proofKey` (OBLIGATION names) — so a legitimately satisfied
//       requirement FAILED the gate, and
//   (b) whatever survived that comparison trusted the persisted resolution —
//       so a forged `state: "satisfied"` row with invented proofRefs PASSED.
// The fix is structural: the gate's input is now FRESH application facts
// scoped per requirement (`readScopedProofFacts`), and every required proof is
// re-derived against them. These tests drive the SHIPPED adapter ports on real
// storage (same discipline as managementDispatchPersistence.test.ts): seed the
// world, call the port, assert the verdict and the rows.
//
// The forged probes (each is a persisted row the tests insert DIRECTLY —
// exactly what a buggy seam or a hostile writer could leave behind):
//   1. satisfied + invented proofRefs naming rows that do not exist
//   2. satisfied + proofRefs naming ANOTHER requirement's real observations
//   3. satisfied + a model_note row pointed at by name (provenance classes
//      never collapse)
//   4. satisfied + resolution bound to a stale contract revision
//   5. satisfied + proofs: [] (an obligation list empty enough to "pass")
//   6. waived + no authorized waiver record
//   7. BUY-satisfied + a verified intent belonging to a different requirement
// The positive probes:
//   8. a real dispatch's observation satisfies through recordSatisfactionAttempt
//      (binding + kernel + persisted resolution), and the gate then ACCEPTS the
//      recompute — legit satisfaction no longer false-fails;
//   9. run facts reconcile into `result_submitted` at pass entry, but a
//      submitted result with no proof facts still satisfies NOTHING.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  initBudget,
  putAssignment,
  putContract,
  putIntent,
  putRequirement,
  readBudget,
} from "../convex/internal/workforce";
import { buildConvexManagementPorts, runManagementPass } from "../convex/management";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type {
  Assignment,
  CompletionProposal,
  OutcomeContract,
  Requirement,
} from "../lib/management/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

// Scheduled work is armed, never fired: this file asserts verdicts and rows.
mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1950000000000;
const REQ = "req_gate";

type Backend = ReturnType<typeof convexTest>;

function contractFor(objectiveKey: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision: 1,
    parsed: {
      intent: "prove the gate recomputes",
      levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "req_gate_test",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("contract fixture invalid");
  return built.contract;
}

function makeRequirement(objectiveKey: string, strategy: "MAKE" | "BUY" = "MAKE"): Requirement {
  const built = buildRequirement(
    {
      objectiveKey,
      contract: contractFor(objectiveKey),
      proposed: {
        requirementKey: REQ,
        priority: "required",
        title: "An observation supports the claim",
        mustBeTrue: "the application recorded a sourced observation",
        scope: "one governed observation",
      },
      artifactKeyForInternalProof: null,
      at: now,
    },
    strategy,
  );
  assert.ok(!("errors" in built));
  return "requirement" in built ? built.requirement : (() => { throw new Error(); })();
}

function resolutionFor(revision: number, proofRefs: string[]): Requirement["resolution"] {
  return {
    resolutionId: "res_forged",
    acceptedDecisionId: null,
    acceptedAssignmentId: null,
    acceptedIntentId: null,
    proofRefs,
    contractRevision: revision,
    acceptedAt: now,
  };
}

async function seed(
  t: Backend,
  key: string,
  requirement: Requirement,
  workItems: unknown[] = [],
) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "prove the gate recomputes",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "managed",
        plan: null,
        workItems,
        run: null,
        result: null,
        management: { contractId: `contract_${key}`, controlNotes: [] },
      } as never,
    });
  });
  await t.mutation(async (ctx) =>
    (putContract as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision: 1,
      data: contractFor(key),
    }),
  );
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requirementKey: requirement.requirementKey,
      data: requirement,
      currentContractRevision: 1,
    }),
  );
  await t.mutation(async (ctx) =>
    (initBudget as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  );
}

function proposal(key: string): CompletionProposal {
  return {
    proposalId: `prop_${key}`,
    objectiveKey: key,
    contractId: `contract_${key}`,
    contractRevision: 1,
    claimedLevelKey: "goal",
    rationale: "the persisted rows claim done — the gate must check, not read",
    proposedAt: now,
  };
}

async function propose(t: Backend, key: string) {
  return t.mutation(async (ctx) =>
    buildConvexManagementPorts(ctx as never).proposeCompletion(proposal(key), now),
  );
}

// Direct row writes: these ARE the forgeries. The engine never offers a
// "make me satisfied" API; a test reaching this level is simulating storage
// that was corrupted out-of-band, which is precisely what A5 must survive.
async function forgeEvidence(
  t: Backend,
  key: string,
  row: { evidenceId: string; runId: string; origin: "application_observation" | "model_note"; sourceId: string },
) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: row.evidenceId,
      data: {
        sourceClass: "public_web",
        label: row.evidenceId,
        text: "content",
        observedAt: now,
        recordedBy: "worker-1",
        runId: row.runId,
        origin: row.origin,
        sourceId: row.sourceId,
      } as never,
    });
  });
}

function assignmentRow(overrides: Partial<Assignment> & { assignmentId: string; requirementKey: string }): Assignment {
  const contract = createWorkContract({
    assignment: "bounded assignment",
    idempotencyScope: `scope:${overrides.assignmentId}`,
    worker: createWorkerSpec(["public_information_research"]),
    sourceProofs: [{ sourceClass: "public_web", minDistinctSources: 1 }],
  });
  return {
    objectiveKey: "obj",
    contractRevision: 1,
    decisionId: "dec_seed",
    workerKey: contract.workerKey,
    kind: "internal_make",
    state: "result_submitted",
    attempt: 1,
    runId: `run_${overrides.assignmentId}`,
    workContract: contract,
    resultSummary: null,
    idempotencyScope: contract.idempotencyScope,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Assignment;
}

async function seedAssignment(t: Backend, key: string, overrides: Partial<Assignment> & { assignmentId: string; requirementKey: string }) {
  await t.mutation(async (ctx) =>
    (putAssignment as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      assignmentId: overrides.assignmentId,
      objectiveKey: key,
      data: assignmentRow({ ...overrides, objectiveKey: key } as never),
    }),
  );
}

const requirementRows = (t: Backend, key: string) =>
  t.query(async (ctx) =>
    (ctx.db as unknown as {
      query(name: string): {
        withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
          collect(): Promise<Array<{ data: Requirement }>>;
        };
      };
    })
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect(),
  );

const assignmentRows = (t: Backend, key: string) =>
  t.query(async (ctx) =>
    (ctx.db as unknown as {
      query(name: string): {
        withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
          collect(): Promise<Array<{ data: Assignment }>>;
        };
      };
    })
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect(),
  );

// ── Forged-satisfaction probes ───────────────────────────────────────────────

test("A5-1 forged proofRefs: satisfied + resolution citing ids that exist nowhere is REFUSED by recompute", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_ghostrefs";
  const forged: Requirement = {
    ...makeRequirement(key),
    state: "satisfied",
    resolution: resolutionFor(1, ["ev_ghost", "intent_ghost"]),
  };
  await seed(t, key, forged);

  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(
    verdict.unmet.some((line) => line.includes(REQ) && line.includes("no application observation")),
    verdict.unmet.join("; "),
  );
  assert.ok(
    verdict.unmet.some((line) => line.includes("recomputed, not read from the persisted resolution")),
    "the rejection says out loud that the claim was re-derived",
  );
  // The verdict is durable for the reducer to honour.
  const gateRows = await t.query(async (ctx) =>
    (ctx.db as unknown as {
      query(name: string): {
        withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
          collect(): Promise<Array<{ data: { kind: string } }>>;
        };
      };
    })
      .query("managerialDecisions")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect(),
  );
  assert.ok(gateRows.some((row) => row.data.kind === "completion_proposal"), "the rejection was persisted");
});

test("A5-2 forged cross-requirement: another requirement's REAL observations cannot prove this one", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_leak";
  // The forged row binds its observation proof to the other requirement's
  // evidence id — the id is REAL, which is exactly what the old gate rewarded.
  const forged: Requirement = {
    ...makeRequirement(key),
    proofs: [{
      proofKey: "observation",
      description: "an application-recorded observation supports the requirement",
      proofKind: "application_observation",
      params: { sourceId: "url:https://other.example/x" },
    }],
    state: "satisfied",
    resolution: resolutionFor(1, ["ev_other"]),
  };
  await seed(t, key, forged);
  // The other requirement's delivery: assignment for req_other, run other_run,
  // and one genuine application observation produced by it.
  await seedAssignment(t, key, { assignmentId: "asg_other", requirementKey: "req_other", runId: "run_other" });
  await forgeEvidence(t, key, {
    evidenceId: "ev_other",
    runId: "run_other",
    origin: "application_observation",
    sourceId: "url:https://other.example/x",
  });

  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(
    verdict.unmet.some((line) => line.includes("url:https://other.example/x")),
    `expected the named-but-out-of-scope source in the rejection, got: ${verdict.unmet.join("; ")}`,
  );
});

test("A5-3 provenance collapse: a model_note row named by id is never application proof", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_note";
  const forged: Requirement = {
    ...makeRequirement(key),
    proofs: [{
      proofKey: "observation",
      description: "observation",
      proofKind: "application_observation",
      params: { sourceId: "note:fake1" },
    }],
    state: "satisfied",
    resolution: resolutionFor(1, ["ev_note"]),
  };
  await seed(t, key, forged);
  await seedAssignment(t, key, { assignmentId: "asg_mine", requirementKey: REQ, runId: "run_mine" });
  await forgeEvidence(t, key, {
    evidenceId: "ev_note",
    runId: "run_mine",
    origin: "model_note",
    sourceId: "note:fake1",
  });

  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(
    verdict.unmet.some((line) => line.includes("note:fake1")),
    "a note is analysis, not proof — the obligation stays unmet",
  );
});

test("A5-4 stale revision: satisfied against r0 cannot complete r1 even with live facts", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_stale";
  const forged: Requirement = {
    ...makeRequirement(key),
    proofs: [{
      proofKey: "observation",
      description: "observation",
      proofKind: "application_observation",
      params: { sourceId: "url:https://live.example/a" },
    }],
    state: "satisfied",
    // A CURRENT, real observation exists — the only lie is the revision stamp.
    resolution: resolutionFor(0, ["ev_live"]),
  };
  await seed(t, key, forged);
  await seedAssignment(t, key, { assignmentId: "asg_live", requirementKey: REQ, runId: "run_live" });
  await forgeEvidence(t, key, {
    evidenceId: "ev_live",
    runId: "run_live",
    origin: "application_observation",
    sourceId: "url:https://live.example/a",
  });

  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(verdict.unmet.some((line) => line.includes("not the current 1")), verdict.unmet.join("; "));
});

test("A5-5 proofless forgery: satisfied with an empty obligation list is refused, not trivially passed", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_noproofs";
  const forged: Requirement = {
    ...makeRequirement(key),
    proofs: [],
    state: "satisfied",
    resolution: resolutionFor(1, []),
  };
  await seed(t, key, forged);

  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(
    verdict.unmet.some((line) => line.includes("declares no governed proof")),
    verdict.unmet.join("; "),
  );
});

test("A5-6 self-granted waiver: waived without an authorized waiver record is refused", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_waiver";
  const forged: Requirement = { ...makeRequirement(key), state: "waived", waiver: null };
  await seed(t, key, forged);

  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(
    verdict.unmet.some((line) => line.includes("claims waived with no authorized waiver record")),
    verdict.unmet.join("; "),
  );
});

test("A5-7 cross-requirement intent: a verified intent for another requirement cannot satisfy BUY", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_intent";
  const forged: Requirement = {
    ...makeRequirement(key, "BUY"),
    state: "satisfied",
    resolution: resolutionFor(1, ["intent_other"]),
  };
  await seed(t, key, forged);
  await t.mutation(async (ctx) =>
    (putIntent as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      intentId: "intent_other",
      objectiveKey: key,
      idempotencyKey: "idem_other",
      data: {
        intentId: "intent_other",
        idempotencyKey: "idem_other",
        objectiveKey: key,
        requirementKey: "req_not_mine",
        contractRevision: 1,
        decisionId: "dec_other",
        kind: "external_acquisition",
        strategy: "BUY",
        target: { offeringId: null, providerId: null, serviceId: null, resourceClass: null, endpointRef: null },
        terms: { priceUsd: null, priceProvenance: "unknown", requiresApproval: false, approvalId: null },
        state: "verified",
        attempts: 1,
        lastEventId: null,
        resultEvidenceId: null,
        verificationEvidenceId: null,
        boundaryNote: "seeded",
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(
    verdict.unmet.some((line) => line.includes("not independently verified")),
    verdict.unmet.join("; "),
  );
});

// ── The legitimate path: recompute accepts what really happened ──────────────

test("A5-8 legit delivery: kernel-bound observation satisfies via the verify path, then the gate's recompute ACCEPTS", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_legit";
  const requirement = makeRequirement(key); // proofs: [observation, params {}]
  await seed(t, key, requirement);
  await seedAssignment(t, key, { assignmentId: "asg_real", requirementKey: REQ, runId: "run_real", state: "result_submitted" });
  await forgeEvidence(t, key, {
    evidenceId: "ev_real",
    runId: "run_real",
    origin: "application_observation",
    sourceId: "url:https://genuine.example/a",
  });

  const satisfied = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.recordSatisfactionAttempt(
      {
        objectiveKey: key,
        contractRevision: 1,
        focusRequirementKey: REQ,
        managerDecisionId: null,
        pendingIntentId: null,
        wakeReason: "worker_result",
        wakeEventIds: [],
        continuation: {},
        lastNode: null,
        pass: 0,
      },
      REQ,
      now,
    );
  });
  assert.equal(satisfied, true, "a scoped, application-written observation IS proof");

  const [stored] = await requirementRows(t, key);
  assert.equal(stored.data.state, "satisfied");
  assert.equal(stored.data.resolution?.contractRevision, 1);
  assert.ok(
    String(stored.data.proofs[0].params.sourceId ?? "").length > 0,
    "the strategy proof param was bound at execution, from real facts only",
  );
  const [assignment] = await assignmentRows(t, key);
  assert.equal(assignment.data.state, "verified", "the delivery row follows the resolution");
  const budget = (await t.query(async (ctx) =>
    (readBudget as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, { objectiveKey: key }),
  )) as { used: { activeAssignments: number } };
  assert.equal(budget.used.activeAssignments, 0, "the active slot was released");

  // The OLD gate's false-refusal: this now ACCEPTS, on recomputed facts.
  const verdict = await propose(t, key);
  assert.equal(verdict.accepted, true, verdict.accepted ? "" : verdict.unmet.join("; "));
  if (!verdict.accepted) return;
  assert.deepEqual(verdict.satisfiedRequired, [REQ]);
});

// ── Run-fact reconciliation ──────────────────────────────────────────────────

test("A5-9 reconciliation: a completed managed run becomes result_submitted at pass entry — and without proof it satisfies nothing", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a5_reconcile";
  const requirement = makeRequirement(key);
  const runId = "run_seed_1";
  await seed(
    t,
    key,
    requirement,
    [{
      id: `wi:asg_reconcile`,
      objectiveKey: key,
      title: "managed",
      assignment: "bounded assignment",
      workerKey: "worker-1",
      state: "completed",
      contract: assignmentRow({ assignmentId: "asg_reconcile", requirementKey: REQ }).workContract,
      runs: [{ id: runId, workItemId: `wi:asg_reconcile`, status: "stopped", startedAt: now, leaseUntil: now, model: "test", modelSelectionReason: "test", toolCalls: 0, summary: "done" }],
    }],
  );
  await seedAssignment(t, key, { assignmentId: "asg_reconcile", requirementKey: REQ, runId, state: "running" });

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      reason: "worker_result",
    }),
  );

  const [assignment] = await assignmentRows(t, key);
  assert.equal(assignment.data.state, "result_submitted", "run facts, reconciled at the entry, drive the delivery row");
  const [stored] = await requirementRows(t, key);
  assert.equal(stored.data.state, "active", "a submitted result with NO proof facts satisfies nothing");
});
