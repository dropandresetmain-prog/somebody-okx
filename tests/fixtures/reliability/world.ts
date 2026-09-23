// Shared deterministic world for the reliability scenario suite (M1-F).
//
// Everything here builds worlds the way PRODUCTION builds them — the same
// OutcomeContract/Requirement/WorkContract/ResourceNeed/artifact builders the
// manager and workers use — so a scenario can never assert behavior against a
// shape the application itself cannot produce. Fingerprints come from the
// shared oracle (tests/helpers/fingerprintOracle.ts), artifacts from
// createArtifact/applyArtifactChange, contracts from createWorkContract.
//
// Clock discipline:
//   - SEED_AT is far in the FUTURE relative to real wall-clock: seeded leases
//     stay live for `assertActiveRun` (which uses real Date.now()) and audits.
//   - EXPIRED_AT is far in the PAST: a reservation written with
//     `expiresAt: EXPIRED_AT + TTL` has already lapsed for the watchdog's own
//     real-clock guard, so the expire* mutations can be fired deterministically
//     without fake-advancing the real clock.
//   - Reservations armed by production `begin` steps carry a real-clock
//     expiresAt and a REAL scheduled watchdog job; the audit observes the armed
//     job in `_scheduled_functions` rather than assuming a logical expiry.

import assert from "node:assert/strict";
import {
  buildOutcomeContract,
  buildRequirement,
} from "../../../lib/management/contract";
import {
  createArtifact,
  applyArtifactChange,
  MAX_CONTENT_CHARS,
} from "../../../lib/objective/artifact";
import type { CompanyArtifact } from "../../../lib/objective/artifact";
import { createResourceNeed } from "../../../lib/objective/resourceNeed";
import type { ResourceNeed } from "../../../lib/objective/resourceNeed";
import { createWorkContract, createWorkerSpec } from "../../../lib/workforce";
import type {
  ActivityResult,
  ExternalAcquisitionResult,
  ObjectiveRecord,
  WorkItem,
  WorkerRun,
} from "../../../lib/objective/types";
import type {
  Assignment,
  ExecutionIntent,
  OutcomeContract,
  Requirement,
  WakeEvent,
} from "../../../lib/management/types";
import {
  initBudget,
  putAssignment,
  putContract,
  putIntent,
  putRequirement,
} from "../../../convex/internal/workforce";
import {
  auditContinuation,
  checkContinuation,
  type ContinuationAudit,
  type ScenarioBackend,
} from "../../helpers/reliabilityScenario";

export const SEED_AT = 2_000_000_000_000;
export const EXPIRED_AT = 1_500_000_000_000;

export const ARTIFACT_KEY = "launch/page-message";
export const REQ = "req_01";
/** The proven internal MAKE capability pair (m61ProductionWholeChain). */
export const MAKE_CAPS = ["growth_launch_operations", "company_records_lookup"] as const;

export type Backend = ScenarioBackend;
export type Handler = {
  _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown>;
};
export type ObjData = ObjectiveRecord & { management: Record<string, unknown> };

// ── Contract + requirement builders (production builders, no hand shapes) ───

export function evidenceContract(key: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `contract_${key}`,
    revision: 1,
    parsed: {
      intent: "gather messaging evidence then relaunch",
      levels: [
        {
          levelKey: "evidence",
          order: 1,
          statement: "current messaging evidence is decision-ready",
          label: "Evidence",
        },
      ],
      minimumCompletionBar: "evidence",
      ambiguities: [],
    },
    requestId: `seed_${key}`,
    founderResolvedQuestions: [],
    at: SEED_AT,
  });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

export function evidenceRequirement(key: string): Requirement {
  return {
    requirementKey: REQ,
    objectiveKey: key,
    contractId: `contract_${key}`,
    contractRevision: 1,
    priority: "required",
    title: "Current messaging evidence is decision-ready",
    mustBeTrue: "sufficient accepted evidence is on record",
    scope: "owned then external if needed",
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "accepted evidence",
    proofs: [],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
}

/** Deliverable requirement built by production's buildRequirement, so its
 * governed `company_artifact_version` proof (artifactKey + minVersion) is the
 * real shape resolveGovernedAssessmentTarget consumes. */
export function deliverableRequirement(
  key: string,
  reqKey = "req_relaunch",
  overrides: Partial<Requirement> = {},
): Requirement {
  const contract = evidenceContract(key);
  const built = buildRequirement(
    {
      objectiveKey: key,
      contract: contract as never,
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: "Relaunch recommendation delivered",
        mustBeTrue: "a versioned relaunch recommendation artifact is saved",
        scope: "founder-facing deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "versioned launch/page-message artifact",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: ARTIFACT_KEY,
      at: SEED_AT,
    },
    null,
  );
  assert.ok(!("errors" in built), JSON.stringify(built));
  return { ...((built as { requirement: Requirement }).requirement), ...overrides };
}

// ── Artifact builders (immutable-history baselines via production primitives)

/** A baseline long enough that BOTH old truncation bounds (the 1,200-char
 * per-note cap and the 2,000-char package cap) fall strictly INSIDE it, with a
 * unique sentinel marker starting exactly at each old bound. Any lossy view
 * provably drops a marker; the supported complete view must not. */
export function longBaselineContent(): {
  content: string;
  start: string;
  middle: string;
  beyond2000: string;
  tail: string;
} {
  const start = "[[BASELINE-START]]";
  const middle = "[[MIDDLE-AT-1200]]";
  const beyond2000 = "[[BEYOND-2000]]";
  const tail = "[[BASELINE-END]]";
  const fillerA = "a".repeat(1200 - start.length); // middle starts at index 1200
  const fillerB = "b".repeat(800); // beyond2000 starts at index 2015
  const fillerC = "c".repeat(400);
  const content = start + fillerA + middle + fillerB + beyond2000 + fillerC + tail;
  return { content, start, middle, beyond2000, tail };
}

/** v1 → v2 artifact built with the SAME primitives the application uses; the
 * history array is what makes v1 an immutable baseline. */
export function seededArtifact(
  key: string,
  opts: { v1Content?: string; v2Content?: string } = {},
): CompanyArtifact {
  const baseline = longBaselineContent();
  const v1 = opts.v1Content ?? "seed headline — generic businesses copy";
  const v2 = opts.v2Content ?? baseline.content;
  const art = createArtifact({
    key: ARTIFACT_KEY,
    objectiveKey: key,
    label: "Launch page message",
    content: v1,
    runId: "run_baseline",
    at: SEED_AT - 10_000,
  });
  return applyArtifactChange(art, {
    content: v2,
    changeNote: "diagnosis section added",
    runId: "run_diagnosis",
    at: SEED_AT - 5_000,
  });
}

// ── Scoped workforce facts (ported shapes from m61 fixtures) ────────────────

export function needFor(key: string, overrides: Partial<ResourceNeed> = {}): ResourceNeed {
  return createResourceNeed({
    id: `need_${key}`,
    objectiveKey: key,
    workItemId: "wi:asg_failed",
    requirementKey: REQ,
    resourceClass: "proprietary_data",
    purpose: "Obtain current-launch evidence",
    reasonOwnedInsufficient: "owned catalog insufficient",
    proposedByRunId: "run_prior",
    at: SEED_AT - 10_000,
    status: "active",
    contractRevision: 1,
    inputCheckId: "evidence_sufficiency",
    supportingEvidenceIds: ["ev_gap"],
    validationAuthority: "application",
    ...overrides,
  });
}

export function verifiedIntentFor(
  key: string,
  overrides: Partial<ExecutionIntent> = {},
): ExecutionIntent {
  return {
    intentId: `int_${key}`,
    idempotencyKey: `idem_${key}`,
    objectiveKey: key,
    requirementKey: REQ,
    contractRevision: 1,
    decisionId: `dec_${key}_req_01_r1_a2`,
    kind: "external_acquisition",
    strategy: "HYBRID",
    target: {
      offeringId: "2135:newsliquid_twitter_search",
      providerId: "2135",
      serviceId: "newsliquid_twitter_search",
      resourceClass: "proprietary_data",
      endpointRef: null,
    },
    terms: {
      priceUsd: 2,
      priceProvenance: "provider_quote",
      requiresApproval: true,
      approvalId: `grant_${key}`,
    },
    state: "verified",
    attempts: 1,
    lastEventId: "evt_v",
    resultEvidenceId: `sim_result_${key}`,
    verificationEvidenceId: `sim_verification_${key}`,
    boundaryNote: "verified simulation",
    createdAt: SEED_AT - 5_000,
    updatedAt: SEED_AT,
    ...overrides,
  };
}

export function acquisitionFor(
  key: string,
  overrides: Partial<ExternalAcquisitionResult> = {},
): ExternalAcquisitionResult {
  const need = needFor(key);
  return {
    intentId: `int_${key}`,
    requirementKey: REQ,
    contractRevision: 1,
    resultEvidenceId: `sim_result_${key}`,
    provenance: "simulation",
    providerId: "2135",
    serviceId: "newsliquid_twitter_search",
    offeringId: "2135:newsliquid_twitter_search",
    resourceClass: "proprietary_data",
    content: "SIMULATED proprietary social evidence",
    responseHash: "abc",
    recordedAt: SEED_AT,
    verifiedAt: SEED_AT,
    needDedupeKey: need.dedupeKey,
    ...overrides,
  };
}

export function failedAssignmentFor(key: string): Assignment {
  const assignmentId = `asg_${key}_hybrid`;
  const workContract = createWorkContract({
    assignment: "Bounded HYBRID internal attempt",
    idempotencyScope: `${key}:${REQ}:r1:${assignmentId}`,
    worker: createWorkerSpec([
      "public_information_research",
      "company_records_lookup",
      "growth_launch_operations",
    ]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
  });
  return {
    assignmentId,
    objectiveKey: key,
    requirementKey: REQ,
    contractRevision: 1,
    decisionId: `dec_${key}_req_01_r1_a2`,
    workerKey: workContract.workerKey,
    kind: "internal_component_of_hybrid",
    state: "failed",
    attempt: 1,
    runId: `run_${key}`,
    workContract,
    resultSummary: "run ended waiting_for_resource; worker released for management redecision",
    idempotencyScope: workContract.idempotencyScope,
    createdAt: SEED_AT - 5_000,
    updatedAt: SEED_AT - 4_000,
  };
}

// ── Serial worker seam: work item + live run (for observation/write cases) ──

export function serialMakeContract(key: string, opts: {
  inputEvidenceIds?: string[];
  targetArtifactKey?: string | null;
} = {}) {
  return createWorkContract({
    assignment: "Deliver relaunch recommendation",
    idempotencyScope: `${key}:${REQ}:serial`,
    worker: createWorkerSpec([...MAKE_CAPS]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: opts.inputEvidenceIds ?? [],
    targetArtifactKey:
      opts.targetArtifactKey === undefined ? ARTIFACT_KEY : opts.targetArtifactKey,
  });
}

export function liveRun(runId: string, workItemId: string): WorkerRun {
  return {
    id: runId,
    workItemId,
    status: "running",
    startedAt: SEED_AT,
    // strictly inside the lease window assertActiveRun checks against real
    // wall-clock; SEED_AT itself is a future epoch.
    leaseUntil: SEED_AT + 300_000,
    model: "mock",
    modelSelectionReason: "reliability-scenario",
    toolCalls: 0,
    summary: "",
  };
}

export function liveWorkItem(
  key: string,
  runId: string,
  contract: ReturnType<typeof serialMakeContract>,
  /** Production's locked-criteria read resolves the bound requirement through
   * a work item id shaped `wi:<assignmentId>`; pass that shape when the
   * scenario seeds the matching assignment row. */
  workItemId = `wi_${runId}`,
): WorkItem {
  return {
    id: workItemId,
    objectiveKey: key,
    title: "relaunch",
    assignment: contract.assignment,
    workerKey: contract.workerKey,
    state: "running",
    contract,
    runs: [liveRun(runId, workItemId)],
  };
}

/** A raw stored artifact ABOVE the replacement ceiling: production builders
 * refuse to create it (that is the point of the ceiling), so this exists only
 * to exercise the defensive read path for pre-existing over-ceiling rows. */
export function overCeilingArtifact(key: string): CompanyArtifact {
  return {
    key: ARTIFACT_KEY,
    objectiveKey: key,
    label: "Launch page message",
    content: "x".repeat(MAX_CONTENT_CHARS + 250),
    version: 1,
    updatedAt: SEED_AT,
    provenanceRunId: "run_legacy",
    history: [],
  };
}

// ── The seed ────────────────────────────────────────────────────────────────

export type SeedInput = {
  key: string;
  state?: string;
  activity?: string;
  request?: string;
  mgmt?: Record<string, unknown>;
  artifacts?: CompanyArtifact[];
  needs?: ResourceNeed[];
  acquisitions?: ExternalAcquisitionResult[];
  result?: ActivityResult | null;
  acceptedTerminal?: ObjectiveRecord["acceptedTerminal"];
  lastUnconfirmedTerminal?: ObjectiveRecord["lastUnconfirmedTerminal"];
  finalSemanticAssessment?: ObjectiveRecord["finalSemanticAssessment"];
  workItems?: WorkItem[];
  run?: WorkerRun | null;
  lastDeliveryFailureClass?: "INPUT_BLOCKED" | "EXECUTION_FAILED" | null;
  grantUsd?: number;
  contract?: OutcomeContract | null;
  requirements?: Requirement[];
  assignments?: Assignment[];
  intents?: ExecutionIntent[];
  wakes?: Array<WakeEvent & { dedupeKey?: string }>;
};

const SERIAL_MGMT_BASE: Record<string, unknown> = {
  contractId: null,
  interpretationStatus: "done",
  currentContractRevision: 1,
  executionProtocol: "m61_serial_v1",
  controlNotes: [],
  decisionAttempts: {},
  decisionRefusalAttempts: {},
  decisionInputFingerprints: {},
  pendingDecision: null,
  finalAssessmentAttempts: 0,
  pendingFinalAssessment: null,
};

export const DEFAULT_MGMT = { ...SERIAL_MGMT_BASE };

/** Insert one complete world in a single mutation. Field lists mirror what
 * production persists; unknown extra management fields are allowed by the
 * validator's union members only when they are real fields — keep to those. */
export async function seedObjective(t: Backend, input: SeedInput): Promise<void> {
  const key = input.key;
  const mgmt = {
    ...SERIAL_MGMT_BASE,
    contractId: input.contract ? input.contract.contractId : null,
    ...(input.mgmt ?? {}),
  };
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: input.request ?? "fix messaging and relaunch",
        createdAt: SEED_AT - 20_000,
        updatedAt: SEED_AT,
        state: input.state ?? "executing",
        activity: input.activity ?? "reliability scenario",
        plan: null,
        workItems: input.workItems ?? [],
        run: input.run ?? null,
        result: input.result ?? null,
        companyArtifacts: input.artifacts ?? [seededArtifact(key)],
        resourceNeeds: input.needs ?? [],
        acquisitionResults: input.acquisitions ?? [],
        ...(input.lastDeliveryFailureClass !== undefined
          ? { lastDeliveryFailureClass: input.lastDeliveryFailureClass }
          : {}),
        ...(input.acceptedTerminal !== undefined
          ? { acceptedTerminal: input.acceptedTerminal }
          : {}),
        ...(input.lastUnconfirmedTerminal !== undefined
          ? { lastUnconfirmedTerminal: input.lastUnconfirmedTerminal }
          : {}),
        ...(input.finalSemanticAssessment !== undefined
          ? { finalSemanticAssessment: input.finalSemanticAssessment }
          : {}),
        management: mgmt,
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: SEED_AT - 20_000,
    });
    if (input.grantUsd !== undefined) {
      await ctx.db.insert("founderSpendGrants", {
        approvalId: `grant_${key}`,
        objectiveKey: key,
        data: {
          approvalId: `grant_${key}`,
          objectiveKey: key,
          limitUsd: input.grantUsd,
          grantedAt: SEED_AT - 20_000,
          revokedAt: null,
          note: "founder-approved bounded spend",
        },
      });
    }
    if (input.contract) {
      await (putContract as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        contractId: input.contract.contractId,
        revision: input.contract.revision,
        data: input.contract,
      });
    }
    for (const req of input.requirements ?? []) {
      await (putRequirement as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        requirementKey: req.requirementKey,
        data: req,
        currentContractRevision: req.contractRevision,
      });
    }
    for (const asg of input.assignments ?? []) {
      await (putAssignment as unknown as Handler)._handler(ctx, {
        assignmentId: asg.assignmentId,
        objectiveKey: key,
        data: asg,
      });
    }
    for (const intent of input.intents ?? []) {
      await (putIntent as unknown as Handler)._handler(ctx, {
        intentId: intent.intentId,
        objectiveKey: key,
        idempotencyKey: intent.idempotencyKey,
        data: intent,
      });
    }
    for (const wake of input.wakes ?? []) {
      await ctx.db.insert("wakeEvents", {
        eventId: wake.eventId,
        objectiveKey: key,
        dedupeKey: wake.dedupeKey ?? `seed:${wake.eventId}`,
        data: wake,
      });
    }
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────
// The repo carries a pre-existing class of `withIndex` typing errors against
// the generated DataModel in tests/scripts; these shared reads opt into a
// local structural cast so the new harness does not ADD to that count.
// Runtime behaviour is identical.

type LooseIndex = (indexName: string, fn: (q: {
  field: (name: string) => unknown;
  eq: (a: unknown, b: unknown) => unknown;
}) => unknown) => {
  collect(): Promise<Array<{ data: unknown }>>;
  unique(): Promise<{ data: unknown } | null>;
};
type LooseDb = {
  query: (tableName: string) => { withIndex: LooseIndex };
};
type LooseQueryCtx = { db: LooseDb };

function asLoose(ctx: unknown): LooseQueryCtx {
  return ctx as LooseQueryCtx;
}

export async function readObj(t: Backend, key: string): Promise<ObjData> {
  return t.query(async (rawCtx) => {
    const ctx = asLoose(rawCtx);
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjData }).data;
  });
}

export async function readMgmt(t: Backend, key: string): Promise<Record<string, unknown>> {
  return (await readObj(t, key)).management;
}

export async function readReqs(t: Backend, key: string): Promise<Requirement[]> {
  return t.query(async (rawCtx) => {
    const ctx = asLoose(rawCtx);
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
}

export async function readAssignments(t: Backend, key: string): Promise<Assignment[]> {
  return t.query(async (rawCtx) => {
    const ctx = asLoose(rawCtx);
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Assignment }).data);
  });
}

export async function readEvents(t: Backend, key: string): Promise<Array<Record<string, unknown>>> {
  return t.query(async (rawCtx) => {
    const ctx = asLoose(rawCtx);
    const rows = await ctx.db
      .query("objectiveEvents")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Record<string, unknown> }).data);
  });
}

/** Scenario-wide invariant: at this resting point the objective is quiescent
 * OK or has a durable continuation. Returns the audit for further asserts.
 * `now` is the REAL clock: production arms reservation expiries and leases
 * against Date.now(), so the audit must judge them by the same clock. */
export async function expectContinuation(
  t: Backend,
  key: string,
  opts: { requireBoundedReservations?: boolean } = {},
): Promise<ContinuationAudit> {
  const now = Date.now();
  const audit = await auditContinuation(t, key, now);
  const result = checkContinuation(audit, now, opts);
  if (!result.ok) {
    assert.fail(
      `continuation invariant violated: ${result.reason}\n` +
        JSON.stringify(result.audit, null, 1),
    );
  }
  return audit;
}
