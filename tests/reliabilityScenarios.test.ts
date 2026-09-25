// RELIABILITY V7 item F — deterministic scenario harness.
//
// Seven historical defect families, replayed as named cases against the REAL
// production seams (management passes, begin→propose→apply chains, watchdogs,
// the worker observation/write surface). Every scenario ends by auditing
// DURABLE continuation facts — unconsumed wakes, armed scheduler jobs,
// bounded reservations, live leases, in-flight work, named external waits —
// and no scenario may wake a stranded Objective by hand. A pass that strands
// one fails the audit instead of being rescued by the test.
//
// Defect families enumerated here (each case names its family):
//   DF1 truncation loss      — context/edit truncated below what the tool
//                              requires (gate runs luna-1..3; 77e2b72, 410d247).
//   DF2 stale-write race     — an edit bound to an old view overwriting newer
//                              truth (77e2b72 fence).
//   DF3 accepted-context lie — a REJECTED terminal presented as accepted
//                              output; baselines mutated or hidden (c8f197e,
//                              empty-capability repair lineage).
//   DF4 correction stranding — a reopen/correction riding old timers instead
//                              of owning its continuation (f7ead5e family + V7-D).
//   DF5 orphaned reservation — begin wrote a reservation; the action chain
//                              died; nothing bounded its expiry (V7-D).
//   DF6 invalid assessment target — verdicts bound to the wrong artifact,
//                              ambiguous targets, or stale versions (V7-E).
//   DF7 redecision identity  — fingerprint blind to real changes (delivery
//                              failures: m3GateDecisionFingerprintDeliveryFailure)
//                              or reacting to irrelevant ones; newer-empty
//                              grounding masked by an older revival (V7-E).
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyFinalSemanticAssessment,
  beginFinalSemanticAssessment,
  buildConvexManagementPorts,
  DECISION_RESERVATION_TTL_MS,
  expireDecisionReservation,
  expireFinalAssessmentReservation,
  resolveGovernedAssessmentTarget,
  runManagementPass,
} from "../convex/management";
import { readWorkerObservation, updateCompanyArtifact } from "../convex/objectives";
import { createBudget } from "../lib/management/budget";
import { expectedFingerprintFromWorld } from "./helpers/fingerprintOracle";
import { planWakeForReopen } from "../lib/management/wakes";
import { ToolStatusError } from "../lib/worker/toolStatus";
import { MAX_CONTENT_CHARS } from "../lib/objective/artifact";
import {
  ARTIFACT_KEY,
  DEFAULT_MGMT,
  EXPIRED_AT,
  REQ,
  SEED_AT,
  acquisitionFor,
  deliverableRequirement,
  evidenceContract,
  evidenceRequirement,
  expectContinuation,
  failedAssignmentFor,
  liveRun,
  liveWorkItem,
  longBaselineContent,
  needFor,
  overCeilingArtifact,
  readEvents,
  readMgmt,
  readObj,
  readReqs,
  seededArtifact,
  seedObjective,
  serialMakeContract,
  verifiedIntentFor,
  type Backend,
  type Handler,
} from "./fixtures/reliability/world";
import type { Requirement } from "../lib/management/types";

const modules = {
  "../../convex/schema.ts": () => import("../convex/schema"),
  "../../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../../convex/objectives.ts": () => import("../convex/objectives"),
  "../../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../../convex/management.ts": () => import("../convex/management"),
  "../../convex/m3Driver.ts": () => import("../convex/m3Driver"),
  "../../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

async function invokePass(t: Backend, key: string, reason = "test_wake") {
  return t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason,
    }),
  ) as Promise<{ objectiveState: string; summary: string; acted: boolean }>;
}

/** A world whose facts are the postacq/stopb fixture shape, so the oracle and
 * production derive the SAME fingerprint from the seeded rows. */
function decisionWorld(key: string) {
  const contract = evidenceContract(key);
  return {
    objectiveKey: key,
    requirement: evidenceRequirement(key),
    currentContractRevision: 1,
    allRequirements: [evidenceRequirement(key)],
    resourceNeeds: [needFor(key)],
    acquisitions: [] as ReturnType<typeof acquisitionFor>[],
    intents: [] as ReturnType<typeof verifiedIntentFor>[],
    assignments: [failedAssignmentFor(key)],
    spendAuthorityUsd: null,
    budget: createBudget(key, SEED_AT - 20_000),
    workers: [] as Array<{
      lifecycle: string;
      reservedBy: { objectiveKey: string } | null;
    }>,
    contract,
  };
}

// ═════════════════════════════════════════════════════════────────────────────
// Family DF1 — the worker must be able to READ what it must REPLACE.
// ═════════════════════════════════════════════════════════════════════════════

test("DF1/case-1 preservation beyond 1,200 and 2,000: complete supported target view", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_preserve";
  const runId = "run_rel_preserve";
  const baseline = longBaselineContent();
  // v1 short seed → v2 long diagnosis baseline, built with production
  // primitives so history is genuine.
  const artifact = seededArtifact(key, { v2Content: baseline.content });
  const contract = serialMakeContract(key, { inputEvidenceIds: [] });
  // Production's locked-criteria read resolves the bound requirement through
  // the `wi:<assignmentId>` work item id — same shape dispatch writes.
  const asg = failedAssignmentFor(key);
  await seedObjective(t, {
    key,
    artifacts: [artifact],
    workItems: [liveWorkItem(key, runId, contract, `wi:${asg.assignmentId}`)],
    run: liveRun(runId, `wi:${asg.assignmentId}`),
    requirements: [evidenceRequirement(key)],
    assignments: [asg],
    contract: evidenceContract(key),
    mgmt: { ...DEFAULT_MGMT, contractId: `contract_${key}` },
  });
  await expectContinuation(t, key, { requireBoundedReservations: true });

  const obs = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as {
    loadedInputPackage?: {
      targetArtifact: {
        content: string;
        truncated: boolean;
        complete: boolean;
        exceedsReplacementCeiling: boolean;
        version: number;
      } | null;
      lockedCriteria: unknown;
    } | null;
  };
  const target = obs.loadedInputPackage?.targetArtifact;
  assert.ok(target, "serial writing worker must receive a loaded target artifact");
  // The old defect: content cut at 2,000 (and again at 1,200 in the runtime)
  // while the tool requires a full replacement ≤ 8,000. Proof markers placed
  // exactly at/after each old bound must all survive.
  assert.ok(target.content.length > 2000, "baseline exceeds both old bounds");
  assert.ok(target.content.includes(baseline.middle), "1,200-bound marker preserved");
  assert.ok(target.content.includes(baseline.beyond2000), "2,000-bound marker preserved");
  assert.ok(target.content.includes(baseline.tail), "tail preserved");
  assert.equal(target.truncated, false);
  assert.equal(target.complete, true);
  assert.equal(target.exceedsReplacementCeiling, false);
  assert.equal(target.version, 2, "worker is bound to the CURRENT version");
  // The locked bar travels with the package — the same statement the gate uses.
  assert.ok(
    obs.loadedInputPackage?.lockedCriteria,
    "serial worker package must carry the locked criteria",
  );
});

test("DF1/case-2 over-ceiling artifact is flagged, not silently cut", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_overceiling";
  const runId = "run_rel_overceiling";
  // Pre-existing over-ceiling row: production builders refuse to create it
  // (that is the ceiling's point), so this is exactly the legacy-data shape
  // the defensive read must handle without silently cutting.
  const artifact = overCeilingArtifact(key);
  const contract = serialMakeContract(key, { inputEvidenceIds: [] });
  await seedObjective(t, {
    key,
    // The stored row stays readable (validator allows any artifact shape; the
    // ceiling is the tool's, enforced at write time).
    artifacts: [artifact],
    workItems: [liveWorkItem(key, runId, contract)],
    run: liveRun(runId, `wi_${runId}`),
    requirements: [evidenceRequirement(key)],
    contract: evidenceContract(key),
    mgmt: { ...DEFAULT_MGMT, contractId: `contract_${key}` },
  });
  const obs = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as {
    loadedInputPackage?: {
      targetArtifact: {
        content: string;
        truncated: boolean;
        complete: boolean;
        exceedsReplacementCeiling: boolean;
      } | null;
    } | null;
  };
  const target = obs.loadedInputPackage?.targetArtifact;
  assert.ok(target);
  // An artifact the tool CANNOT replace must be stated out loud — accuracy
  // metadata travels with the payload; the ceiling itself is not raised.
  assert.equal(target.exceedsReplacementCeiling, true);
  assert.equal(target.truncated, true);
  assert.equal(target.complete, false);
  assert.ok(
    target.content.length <= MAX_CONTENT_CHARS,
    "if bounded at all, the cut is at the ceiling AND marked — never silent",
  );
  await expectContinuation(t, key, { requireBoundedReservations: true });
});

// ═════════════════════════════════════════════════════════────────────────────
// Family DF2 — edits bind to exact target + version; stale rejections are
// side-effect-free.
// ═════════════════════════════════════════════════════════════════════════════

test("DF2/case-3 stale artifact update: refused, version-true, zero side effects", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_stale_write";
  const runId = "run_rel_stale_write";
  const artifact = seededArtifact(key);
  const contract = serialMakeContract(key, { inputEvidenceIds: [] });
  await seedObjective(t, {
    key,
    artifacts: [artifact],
    workItems: [liveWorkItem(key, runId, contract)],
    run: liveRun(runId, `wi_${runId}`),
    requirements: [evidenceRequirement(key)],
    contract: evidenceContract(key),
    mgmt: { ...DEFAULT_MGMT, contractId: `contract_${key}` },
  });

  // Fresh v2 write bound to the shown version: succeeds.
  const ok = (await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      content: "v3 — current-view replacement",
      changeNote: "worker update bound to v2",
      usedAcquisitionEvidenceIds: [],
      expectedArtifactVersion: 2,
    }),
  )) as { key: string; version: number };
  assert.equal(ok.version, 3);

  // Now compose from the STALE v2 view while the target is v3: the fence must
  // reject BEFORE provenance reads, patch, or event append.
  const before = await readObj(t, key);
  const beforeEvents = (await readEvents(t, key)).length;
  let status: string | null = null;
  let message = "";
  try {
    await t.mutation(async (ctx) =>
      (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        runId,
        content: "stale replacement composed from v2",
        changeNote: "must not land",
        usedAcquisitionEvidenceIds: [],
        expectedArtifactVersion: 2,
      }),
    );
  } catch (error) {
    assert.ok(error instanceof ToolStatusError, `expected ToolStatusError, got ${error}`);
    status = error.toolStatus;
    message = error.cleanMessage;
  }
  assert.equal(status, "stale");
  assert.match(message, /now v3/);
  const after = await readObj(t, key);
  assert.equal(after.companyArtifacts?.[0]?.version, 3, "no version churn on refusal");
  assert.equal(
    after.companyArtifacts?.[0]?.content,
    before.companyArtifacts?.[0]?.content,
    "content untouched",
  );
  assert.equal((await readEvents(t, key)).length, beforeEvents, "no event appended");
  await expectContinuation(t, key, { requireBoundedReservations: true });
});

// ═════════════════════════════════════════════════════════────────────────────
// Family DF3 — source/accepted-output continuity: the durable accepted
// terminal classifies prior output; the v1 baseline stays visible.
// ═════════════════════════════════════════════════════════════════════════════

test("DF3/case-4 rejected output is diagnostic, never accepted context", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_rejected_ctx";
  const runId = "run_rel_rejected_ctx";
  const priorRunId = "run_prior_rejected";
  const contract = serialMakeContract(key, { inputEvidenceIds: [] });
  await seedObjective(t, {
    key,
    artifacts: [seededArtifact(key)],
    workItems: [liveWorkItem(key, runId, contract)],
    run: liveRun(runId, `wi_${runId}`),
    requirements: [evidenceRequirement(key)],
    contract: evidenceContract(key),
    mgmt: { ...DEFAULT_MGMT, contractId: `contract_${key}` },
    // A prior run CLAIMED DELIVERED; the application refused it unconfirmed.
    result: {
      summary: "prior claim that never met the bar",
      fit: "partial",
      risks: [],
      unknowns: ["unmet proof"],
      recommendedNextAction: "revise",
      completedAt: SEED_AT - 1_000,
      runId: priorRunId,
    },
    acceptedTerminal: null,
    lastUnconfirmedTerminal: {
      runId: priorRunId,
      terminal: "DELIVERED",
      fingerprint: "fp_prior",
      at: SEED_AT - 900,
      reason: "completion check unmet",
    },
  });

  const obs = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as {
    loadedInputPackage?: {
      priorActionOutputs: Array<{
        runId: string;
        status: string;
        classification: string;
      }>;
    } | null;
  };
  const outputs = obs.loadedInputPackage?.priorActionOutputs ?? [];
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]!.runId, priorRunId);
  // Raw record.result must never masquerade as accepted fact.
  assert.equal(outputs[0]!.status, "diagnostic");
  assert.equal(outputs[0]!.classification, `refused_unconfirmed:DELIVERED`);
  await expectContinuation(t, key, { requireBoundedReservations: true });
});

test("DF3/case-4b an accepted terminal re-derives accepted status from the durable record", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_accepted_ctx";
  const runId = "run_rel_accepted_ctx";
  const priorRunId = "run_prior_accepted";
  const contract = serialMakeContract(key, { inputEvidenceIds: [] });
  await seedObjective(t, {
    key,
    artifacts: [seededArtifact(key)],
    workItems: [liveWorkItem(key, runId, contract)],
    run: liveRun(runId, `wi_${runId}`),
    requirements: [evidenceRequirement(key)],
    contract: evidenceContract(key),
    mgmt: { ...DEFAULT_MGMT, contractId: `contract_${key}` },
    result: {
      summary: "prior accepted deliverable",
      fit: "ok",
      risks: [],
      unknowns: [],
      recommendedNextAction: "complete",
      completedAt: SEED_AT - 1_000,
      runId: priorRunId,
    },
    acceptedTerminal: {
      runId: priorRunId,
      terminal: "DELIVERED",
      fingerprint: "fp_ok",
      acceptedAt: SEED_AT - 900,
      outcome: "accepted",
    },
  });
  const obs = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as {
    loadedInputPackage?: {
      priorActionOutputs: Array<{ status: string; classification: string }>;
    } | null;
  };
  const outputs = obs.loadedInputPackage?.priorActionOutputs ?? [];
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]!.status, "accepted");
  assert.equal(outputs[0]!.classification, "accepted:DELIVERED");
  await expectContinuation(t, key, { requireBoundedReservations: true });
});

test("DF3/case-5 immutable baseline stays visible after a newer version lands", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_baseline";
  const v1 = "V1 diagnosis — never rewritten";
  const baseline = longBaselineContent();
  const artifact = seededArtifact(key, { v1Content: v1, v2Content: baseline.content });
  // Production invariants of the builder itself: history is append-only and
  // the v1 entry keeps its exact bytes.
  assert.equal(artifact.history.length, 2);
  assert.equal(artifact.history[0]!.content, v1);
  assert.equal(artifact.history[0]!.version, 1);
  assert.equal(artifact.version, 2);
  // A worker's replacement goes through the application and must not touch
  // the stored history entries.
  const runId = "run_rel_baseline";
  const contract = serialMakeContract(key, { inputEvidenceIds: [] });
  await seedObjective(t, {
    key,
    artifacts: [artifact],
    workItems: [liveWorkItem(key, runId, contract)],
    run: liveRun(runId, `wi_${runId}`),
    requirements: [evidenceRequirement(key)],
    contract: evidenceContract(key),
    mgmt: { ...DEFAULT_MGMT, contractId: `contract_${key}` },
  });
  await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      content: baseline.content + " + correction section",
      changeNote: "v3 correction",
      usedAcquisitionEvidenceIds: [],
      expectedArtifactVersion: 2,
    }),
  );
  const after = await readObj(t, key);
  const art = after.companyArtifacts?.[0];
  assert.equal(art?.version, 3);
  assert.equal(art?.history.length, 3, "history grew only by append");
  assert.equal(art?.history[0]?.content, v1, "v1 baseline bytes unchanged");
  assert.equal(art?.history[1]?.content, baseline.content, "v2 unchanged");
  await expectContinuation(t, key, { requireBoundedReservations: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// Family DF4 — a negative-review correction owns its continuation.
// ═════════════════════════════════════════════════════════════════════════════

/** Satisfied deliverable + negative assessment applied via production
 * begin/apply, at attempt 1 (below the correction ceiling). */
async function seedNegativeReview(t: Backend, key: string): Promise<void> {
  const contract = evidenceContract(key);
  await seedObjective(t, {
    key,
    state: "executing",
    artifacts: [seededArtifact(key)],
    requirements: [
      deliverableRequirement(key, REQ, {
        state: "satisfied",
        strategy: "MAKE",
        resolution: {
          resolutionId: `res_${key}`,
          acceptedDecisionId: `dec_${key}_old`,
          acceptedAssignmentId: `asg_${key}_hybrid`,
          acceptedIntentId: null,
          proofRefs: [`artifact:${ARTIFACT_KEY}:2`],
          contractRevision: 1,
          acceptedAt: SEED_AT - 1_000,
        },
      }),
    ],
    assignments: [failedAssignmentFor(key)],
    contract,
    result: null,
    mgmt: {
      ...DEFAULT_MGMT,
      contractId: contract.contractId,
      decisionAttempts: { [REQ]: 1 },
      decisionRefusalAttempts: { [REQ]: 0 },
      finalAssessmentAttempts: 0,
    },
  });
  const began = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: EXPIRED_AT,
    }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began.proceed, true, began.reason);
  const applied = (await t.mutation(async (ctx) =>
    (applyFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: began.requestId!,
      meetsMinimumBar: false,
      rationale: "Draft lacks audience language and CTA clarity",
      artifactKey: ARTIFACT_KEY,
      artifactVersion: 2,
      evidenceRefs: [],
      assumptionsUnknowns: ["channel mix"],
      recommendedNextAction: "revise against the locked bar",
      contractRevision: 1,
      at: SEED_AT,
    }),
  )) as { ok: boolean; reason?: string };
  assert.equal(applied.ok, true, applied.reason);
}

test("DF4/case-6 correction without incidental timers: reopen owns a deduped continuation", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_reopen";
  await seedNegativeReview(t, key);
  // No worker timers, no stale wakes exist in this world: the ONLY thing that
  // may carry the correction forward is the reopen's own continuation.

  const after = await invokePass(t, key, "final_semantic_assessment");
  assert.equal(after.objectiveState, "executing");

  const expected = planWakeForReopen({
    objectiveKey: key,
    contractRevision: 1,
    assessmentAttempt: 1,
    at: SEED_AT,
  });
  const wakes = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("wakeEvents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Record<string, unknown>; dedupeKey?: string }).data);
  });
  const reopenWakes = wakes.filter((w) => w.reason === "recovery_event");
  assert.equal(reopenWakes.length, 1, "exactly one reopen wake — dedupe prevents fan-out");
  assert.equal(reopenWakes[0]!.eventId, expected.eventId);
  const dedupeRow = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("wakeEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", expected.dedupeKey))
      .unique();
    return row ? (row as { eventId: string }).eventId : null;
  });
  assert.equal(dedupeRow, expected.eventId, "reopen dedupe identity is deterministic");

  // The correction requirement is active with strategy cleared, and the
  // critique travels as data for the next worker package.
  const req = (await readReqs(t, key))[0]!;
  assert.equal(req.state, "active");
  assert.equal(req.strategy, null);
  const mgmt = await readMgmt(t, key);
  assert.match(String(mgmt.lastFinalAssessmentCritique ?? ""), /audience language/);

  // Continuation is durable WITHOUT any hand-wake by this test:
  const audit = await expectContinuation(t, key, { requireBoundedReservations: true });
  assert.ok(
    audit.outstandingWakes.some((w) => w.reason === "recovery_event") ||
      audit.armedJobs.some((j) => j.name.endsWith("runManagementPass")),
    "reopen must own a wake row or a scheduled pass",
  );

  // And the next real pass lands the correction reservation on its own.
  await invokePass(t, key, "recovery_event");
  const mgmt2 = await readMgmt(t, key);
  const pending = mgmt2.pendingDecision as
    | { requestId: string; requirementKey: string; expiresAt?: number }
    | null;
  if (!pending) {
    // A duplicate wake is idempotent — but then a reservation must already
    // exist or the state must be an explicit verdict; audit both ways.
    await expectContinuation(t, key);
  } else {
    assert.equal(pending.requirementKey, REQ);
    assert.ok(
      typeof pending.expiresAt === "number" && pending.expiresAt > 0,
      "correction decision reservation is bounded",
    );
    await expectContinuation(t, key, { requireBoundedReservations: true });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Family DF5 — orphaned reservations expire by their own bound, exactly once,
// against exactly the request they armed.
// ═════════════════════════════════════════════════════════════════════════════

test("DF5/case-7 orphaned decision reservation: expiry burns refusal budget, newer reservation untouched", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_orphan_decision";
  const world = decisionWorld(key);
  const orphanReqId = `decide_${key}_${REQ}_r1_a2`;
  await seedObjective(t, {
    key,
    requirements: [world.requirement],
    contract: world.contract,
    assignments: world.assignments,
    mgmt: {
      ...DEFAULT_MGMT,
      contractId: world.contract.contractId,
      decisionAttempts: { [REQ]: 1 },
      decisionRefusalAttempts: { [REQ]: 0 },
      pendingDecision: {
        requestId: orphanReqId,
        requirementKey: REQ,
        contractRevision: 1,
        attempts: 2,
        expiresAt: EXPIRED_AT + DECISION_RESERVATION_TTL_MS, // already lapsed
      },
    },
  });

  // A late callback for a DIFFERENT request must change nothing (identity).
  await t.mutation(async (ctx) =>
    (expireDecisionReservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: "decide_someone_elses_request",
    }),
  );
  let mgmt = await readMgmt(t, key);
  assert.deepEqual(
    (mgmt.pendingDecision as { requestId: string }).requestId,
    orphanReqId,
    "foreign requestId cannot clear the reservation",
  );
  assert.equal((mgmt.decisionRefusalAttempts as Record<string, number>)[REQ], 0);

  // The armed watchdog, firing after its bound, clears EXACTLY its request.
  const before = await t.mutation(async (ctx) =>
    (expireDecisionReservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: orphanReqId,
    }),
  );
  assert.equal(before, null);
  mgmt = await readMgmt(t, key);
  assert.equal(mgmt.pendingDecision, null, "orphan cleared");
  assert.equal((mgmt.decisionRefusalAttempts as Record<string, number>)[REQ], 1,
    "an action death counts against the refusal ceiling — it cannot loop forever");

  // Idempotence: a second firing of the same watchdog is a no-op.
  await t.mutation(async (ctx) =>
    (expireDecisionReservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: orphanReqId,
    }),
  );
  mgmt = await readMgmt(t, key);
  assert.equal((mgmt.decisionRefusalAttempts as Record<string, number>)[REQ], 1,
    "expiry cannot double-charge the ceiling");

  // Continuation after clearing is the watchdog's OWN scheduled recovery pass
  // + the pass IT triggered — not a hand-wake by this test.
  const audit = await expectContinuation(t, key, { requireBoundedReservations: true });
  assert.ok(
    audit.armedJobs.some((j) => j.name.endsWith("runManagementPass")),
    "expiry must hand the objective back to the loop via a scheduled pass",
  );
});

test("DF5/case-7b unexpired decision reservation resists its watchdog", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_decision_notyet";
  const world = decisionWorld(key);
  const reqId = `decide_${key}_${REQ}_r1_a2`;
  // Bound in the FUTURE (real-clock production begin semantics).
  const futureExpiry = Date.now() + 10 * 60_000;
  await seedObjective(t, {
    key,
    requirements: [world.requirement],
    contract: world.contract,
    assignments: world.assignments,
    mgmt: {
      ...DEFAULT_MGMT,
      contractId: world.contract.contractId,
      decisionAttempts: { [REQ]: 1 },
      decisionRefusalAttempts: { [REQ]: 0 },
      pendingDecision: {
        requestId: reqId,
        requirementKey: REQ,
        contractRevision: 1,
        attempts: 2,
        expiresAt: futureExpiry,
      },
    },
  });
  await t.mutation(async (ctx) =>
    (expireDecisionReservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: reqId,
    }),
  );
  const mgmt = await readMgmt(t, key);
  assert.ok(mgmt.pendingDecision, "early watchdog must leave live work alone");
  assert.equal((mgmt.decisionRefusalAttempts as Record<string, number>)[REQ], 0);
  await expectContinuation(t, key, { requireBoundedReservations: true });
});

test("DF5/case-7c orphaned final-assessment reservation: provider-class accounting, attempt refunded", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_orphan_assess";
  const contract = evidenceContract(key);
  const reqId = `assess_${key}_r1_a1`;
  await seedObjective(t, {
    key,
    artifacts: [seededArtifact(key)],
    requirements: [evidenceRequirement(key)],
    contract,
    mgmt: {
      ...DEFAULT_MGMT,
      contractId: contract.contractId,
      finalAssessmentAttempts: 1,
      pendingFinalAssessment: {
        requestId: reqId,
        contractRevision: 1,
        attempts: 1,
        targetArtifactKey: ARTIFACT_KEY,
        targetArtifactVersion: 2,
        expiresAt: EXPIRED_AT + DECISION_RESERVATION_TTL_MS,
      },
    },
  });

  // Wrong request identity: no touch.
  await t.mutation(async (ctx) =>
    (expireFinalAssessmentReservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: "assess_other_r1_a1",
    }),
  );
  let mgmt = await readMgmt(t, key);
  assert.ok(mgmt.pendingFinalAssessment, "foreign watchdog cannot clear");

  await t.mutation(async (ctx) =>
    (expireFinalAssessmentReservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: reqId,
    }),
  );
  mgmt = await readMgmt(t, key);
  assert.equal(mgmt.pendingFinalAssessment, null);
  // Lost action = provider failure: the SUBSTANTIVE attempt is refunded and
  // the separate non-substantive budget is charged, so instability can neither
  // burn the semantic allowance nor loop.
  assert.equal(mgmt.finalAssessmentAttempts, 0, "begin-time attempt refunded");
  assert.equal(mgmt.finalAssessmentProviderFailures, 1, "charged to its own budget");
  const audit = await expectContinuation(t, key, { requireBoundedReservations: true });
  assert.ok(
    audit.armedJobs.some((j) => j.name.endsWith("runManagementPass")),
    "clearing routes back through the recovery pass",
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// Family DF6 — assessment targets resolve unambiguously; reuse is version-true.
// ═════════════════════════════════════════════════════════════════════════════

test("DF6: governed target resolution stays proof-driven and refuses ambiguity", () => {
  const req = (params: Record<string, string | number>): Requirement => ({
    ...deliverableRequirement("obj_rel_target", "req_relaunch"),
    proofs: [
      {
        proofKey: "p1",
        description: "artifact",
        proofKind: "company_artifact_version",
        params,
      },
    ],
  });
  const hit = resolveGovernedAssessmentTarget({
    requirements: [req({ artifactKey: ARTIFACT_KEY, minVersion: 2 })],
    artifacts: [
      { key: "other/noise", version: 9 },
      { key: ARTIFACT_KEY, version: 3 },
    ],
    contractRevision: 1,
  });
  assert.equal(hit.ok, true);
  if (hit.ok) {
    assert.equal(hit.artifactKey, ARTIFACT_KEY);
    assert.equal(hit.artifactVersion, 3, "resolves to the CURRENT version, not minVersion");
    assert.equal(hit.minVersionRequired, 2);
  }
  const ambiguous = resolveGovernedAssessmentTarget({
    requirements: [req({})],
    artifacts: [
      { key: "a/one", version: 1 },
      { key: "b/two", version: 1 },
    ],
    contractRevision: 1,
  });
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) {
    assert.match(
      ambiguous.reason,
      /multiple company artifacts|ambiguous|without a governed artifactKey/,
    );
  }
});

test("DF6/case-10 stale assessment version: verdict on v2 cannot bless v3", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_assess_version";
  const contract = evidenceContract(key);
  await seedObjective(t, {
    key,
    artifacts: [seededArtifact(key)],
    requirements: [deliverableRequirement(key, REQ)],
    contract,
    mgmt: { ...DEFAULT_MGMT, contractId: contract.contractId },
    // A persisted POSITIVE assessment vouching for v2 only.
    finalSemanticAssessment: {
      meetsMinimumBar: true,
      rationale: "v2 met the bar",
      artifactKey: ARTIFACT_KEY,
      artifactVersion: 2,
      evidenceRefs: [],
      assumptionsUnknowns: [],
      recommendedNextAction: "complete",
      assessedAt: SEED_AT - 500,
      contractRevision: 1,
    },
  });

  // Target standing NOW is v2 → the assessment is version-true and reused.
  const beganSame = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: EXPIRED_AT,
    }),
  )) as { proceed: boolean; reason?: string };
  assert.equal(beganSame.proceed, false);
  assert.match(beganSame.reason!, /already persisted/);

  // A newer edit lands AFTER the review (via the application, as a worker):
  const runId = "run_rel_assess_version";
  const serialContract = serialMakeContract(key, { inputEvidenceIds: [] });
  await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: Record<string, unknown> }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        workItems: [liveWorkItem(key, runId, serialContract)],
        run: liveRun(runId, `wi_${runId}`),
      },
    } as never);
  });
  await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      content: "v3 — edited after the review",
      changeNote: "post-review edit",
      usedAcquisitionEvidenceIds: [],
      expectedArtifactVersion: 2,
    }),
  );

  // Now the stored verdict describes a version that no longer stands: reuse
  // must NOT apply — begin re-assesses.
  const beganAfterEdit = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: EXPIRED_AT,
    }),
  )) as { proceed: boolean; reason?: string; requestId?: string };
  assert.equal(
    beganAfterEdit.proceed,
    true,
    `stale-version verdict must not suppress re-assessment: ${beganAfterEdit.reason}`,
  );

  // The completion gate applies the same version-truth, not just begin.
  const mgmt = await readMgmt(t, key);
  const pendingAssessment = mgmt.pendingFinalAssessment as {
    requestId: string;
    contractRevision: number;
  } | null;
  assert.ok(pendingAssessment, "begin reserved a fresh assessment");
  // The loop's completion proposal applies the SAME version-truth (gate
  // branch), so a pass cannot complete on the stale verdict either.
  await invokePass(t, key, "final_semantic_assessment");
  const after = await readObj(t, key);
  assert.notEqual(after.state, "completed", "stale verdict cannot complete");
  await expectContinuation(t, key);
});

// ═════════════════════════════════════════════════════════════════════════════
// Family DF7 — redecision identity: reactive to real facts, immune to noise,
// latest applicable attempt first.
// ═════════════════════════════════════════════════════════════════════════════

test("DF7: fingerprint invariant to irrelevant changes, reactive to scoped terminal facts", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_identity";
  const world = decisionWorld(key);
  const stored = expectedFingerprintFromWorld(world);

  // (a) Irrelevant noise on the requirement row (prose, timestamps) is NOT
  // part of the bounded fact set: identity must not churn.
  const prose = { ...world.requirement, title: "renamed", mustBeTrue: "reworded bar" };
  assert.equal(
    expectedFingerprintFromWorld(world, { requirement: prose }),
    stored,
    "prose-only change must not re-open decisions",
  );

  // (b) A scoped terminal delivery outcome IS material (the nex-5 strand).
  const failedAgain = {
    ...failedAssignmentFor(key),
    assignmentId: `asg_${key}_terminal2`,
    state: "failed" as const,
  };
  assert.notEqual(
    expectedFingerprintFromWorld(world, { assignments: [...world.assignments, failedAgain] }),
    stored,
    "a new terminal delivery for the SAME requirement/revision must force redecision",
  );

  // (c) An acquisition scoped to ANOTHER requirement is immaterial.
  const foreign = acquisitionFor(key, {
    requirementKey: "req_other",
    intentId: "int_other",
    resultEvidenceId: "sim_result_other",
  });
  assert.equal(
    expectedFingerprintFromWorld(world, { acquisitions: [foreign] }),
    stored,
    "out-of-scope acquisitions must not re-open decisions",
  );

  // (d) The same acquisition scoped IN changes identity, as does a validated
  // authority flip on the need.
  assert.notEqual(
    expectedFingerprintFromWorld(world, { acquisitions: [acquisitionFor(key)] }),
    stored,
  );
  assert.notEqual(
    expectedFingerprintFromWorld(world, {
      resourceNeeds: [needFor(key, { validationAuthority: null })],
    }),
    stored,
    "validation authority is a bounded real fact",
  );

  // Production agrees with the oracle end-to-end on the REACHABLE flow: the
  // stored fingerprint describes the world the last real decision saw; facts
  // that arrived since (a verified acquisition + terminal intent) are scoped
  // material, so the next pass must reserve exactly ONE new decision — and a
  // duplicate wake must not burn a second attempt or mint a second chain.
  const landedAcq = acquisitionFor(key);
  const landedIntent = verifiedIntentFor(key);
  const staleWorld = {
    ...world,
    acquisitions: [] as ReturnType<typeof acquisitionFor>[],
    intents: [] as ReturnType<typeof verifiedIntentFor>[],
  };
  const contract = evidenceContract(key);
  await seedObjective(t, {
    key,
    state: "waiting_for_resource",
    requirements: [world.requirement],
    contract,
    assignments: world.assignments,
    needs: world.resourceNeeds,
    acquisitions: [landedAcq],
    intents: [landedIntent],
    mgmt: {
      ...DEFAULT_MGMT,
      contractId: contract.contractId,
      decisionAttempts: { [REQ]: 2 },
      decisionRefusalAttempts: { [REQ]: 0 },
      decisionInputFingerprints: { [REQ]: expectedFingerprintFromWorld(staleWorld) },
    },
  });
  await invokePass(t, key, "verification_result");
  let mgmt = await readMgmt(t, key);
  const reserved = mgmt.pendingDecision as
    | { requestId: string; attempts: number; expiresAt?: number; inputFingerprint?: string }
    | null;
  assert.ok(reserved, "material scoped change must open exactly one redecision");
  // The reserved fingerprint is computed by the same shared collector over the
  // CURRENT world — production and oracle agree on what is material. "Current"
  // includes what this very pass already applied durably before deciding: the
  // landed verified acquisition fulfils the scoped need, so the need identity
  // the decision sees is the fulfilled need, not the seeded active one.
  assert.equal(
    reserved!.inputFingerprint,
    expectedFingerprintFromWorld({
      ...world,
      acquisitions: [landedAcq],
      intents: [landedIntent],
      resourceNeeds: [needFor(key, { status: "fulfilled" })],
    }),
  );
  const auditAfterReserve = await expectContinuation(t, key, {
    requireBoundedReservations: true,
  });
  assert.ok(
    auditAfterReserve.reservations.some((r) => r.kind === "decision" && r.watchdogArmed),
    "the new reservation must travel with its own armed watchdog",
  );

  // Duplicate wake: same pass again — the reservation pass 1 wrote is still
  // pending, so NO second chain is minted and the attempt counter stays exactly
  // where pass 1 left it (pass 1 legitimately burned 2→3; pass 2 must not add a
  // fourth).
  await invokePass(t, key, "verification_result");
  mgmt = await readMgmt(t, key);
  const stillPending = mgmt.pendingDecision as { requestId: string; attempts: number };
  assert.equal(stillPending.requestId, reserved!.requestId, "no second chain");
  assert.equal(stillPending.attempts, reserved!.attempts, "reservation identity unchanged");
  assert.equal((mgmt.decisionAttempts as Record<string, number>)[REQ], reserved!.attempts,
    "duplicate wake burns no new attempt");
  await expectContinuation(t, key, { requireBoundedReservations: true });
});

test("DF7/case-9 newer empty grounding is not masked by an older non-empty revival", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rel_grounding";
  const contract = evidenceContract(key);
  await seedObjective(t, {
    key,
    requirements: [evidenceRequirement(key)],
    contract,
    assignments: [failedAssignmentFor(key)],
    mgmt: {
      ...DEFAULT_MGMT,
      contractId: contract.contractId,
      decisionAttempts: { [REQ]: 1 },
    },
  });
  const groundingRow = (options: unknown, at: number) => ({
    decisionId: `dec_ground_${at}`,
    objectiveKey: key,
    contractRevision: 1,
    requirementKey: REQ,
    kind: "satisfaction_strategy" as const,
    strategy: "MAKE",
    optionId: null,
    recommendation: null,
    authorization: {
      kind: "refused" as const,
      requirementKey: REQ,
      contractRevision: 1,
      reasons: ["unknown"],
      detail: "grounding probe",
    },
    coarsePlanSummary: JSON.stringify({ original: "probe", extra: { options } }),
    consideredOptionIds: [],
    at,
  });
  await t.mutation(async (ctx) => {
    // Older attempt: NON-empty grounding (one eligible-looking option).
    await ctx.db.insert("managerialDecisions", {
      objectiveKey: key,
      decisionId: "dec_ground_old",
      data: {
        ...groundingRow(
          [{ optionId: "opt_old", strategy: "MAKE", eligibility: { eligible: true } }],
          SEED_AT - 5_000,
        ),
      } as never,
    });
    // NEWER attempt: empty options — a retryable failure. It must classify the
    // requirement as UNGROUNDED; loadGrounded must not revive the older row.
    await ctx.db.insert("managerialDecisions", {
      objectiveKey: key,
      decisionId: "dec_ground_new",
      data: groundingRow([], SEED_AT - 1_000) as never,
    });
  });

  // Read loadGrounded THROUGH the production adapter surface: the pass treats
  // the latest attempt as (empty) ungrounded — the reducer may schedule
  // another grounding, which is correct retry semantics; what must NOT happen
  // is the older non-empty grounding being presented as current truth.
  const grounded = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("managerialDecisions")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    // Same selection rule as production loadGrounded: latest decodable attempt
    // per requirement first, then classify empty-vs-nonempty.
    const byKey = new Map<string, { at: number; options: unknown[] }>();
    for (const row of rows) {
      const data = (row as { data: Record<string, unknown> }).data;
      if (data.contractRevision !== 1) continue;
      const reqKey = data.requirementKey as string | undefined;
      if (!reqKey) continue;
      let options: unknown[] | undefined;
      try {
        const parsed = JSON.parse(data.coarsePlanSummary as string);
        if (parsed.extra && parsed.extra.options) options = parsed.extra.options;
      } catch {
        continue;
      }
      if (!options) continue;
      const existing = byKey.get(reqKey);
      if (!existing || (data.at as number) > existing.at)
        byKey.set(reqKey, { at: data.at as number, options });
    }
    // Convex queries serialize plain values; the Map is a local structure only.
    return Array.from(byKey.entries());
  });
  const entry = grounded.find(([reqKey]) => reqKey === REQ);
  assert.ok(entry, "latest decodable attempt must be the one selected");
  const latest = entry![1];
  assert.equal(latest.at, SEED_AT - 1_000, "selected by recency, not emptiness");
  assert.equal(latest.options.length, 0, "latest attempt is the empty failure");
  // Through the REAL production port surface: the newer empty attempt must
  // classify the requirement as UNGROUNDED — loadGrounded may not revive the
  // older non-empty row for revision 1.
  const fromProduction = await t.query(async (rawCtx) => {
    // Query ctx, port builder typed for MutationCtx — same structural cast the
    // fixture reads use; the port only performs reads here.
    const ports = buildConvexManagementPorts(rawCtx as never);
    const map = await ports.loadGrounded(key, 1);
    // Map is a local structure; extract the answer as a plain value.
    const opts = map.get(REQ);
    return { present: opts !== undefined, count: opts?.length ?? 0 };
  });
  assert.equal(
    fromProduction.present,
    false,
    "production loadGrounded must omit a requirement whose latest attempt is empty",
  );
  await invokePass(t, key, "recovery_event");
  await expectContinuation(t, key);
});
