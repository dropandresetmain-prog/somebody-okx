/**
 * Build lib/demo/scenarios/lunaRelaunch.ts from the saved Luna physical-run
 * gate evidence, by reconstructing supportable ProductSource snapshots and
 * feeding them through the real V1 product projection.
 *
 * Does NOT invent Activity, acquisitions, artifacts, or completion. Frames
 * that cannot be supported by durable timestamps in the evidence are omitted.
 *
 * Evidence: docs/work/gate-evidence/8f53da0/run-luna-5-obj_1790046504201_vporlj.json
 * Acquisition provenance in that run: simulation (preserved, not relabelled).
 *
 * Usage: npx tsx scripts/demo/build-luna-relaunch-scenario.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  groupObjectiveSummaries,
  projectObjectiveSummary,
  projectObjectiveWorkspace,
  type ProductAssignment,
  type ProductDecision,
  type ProductEvidence,
  type ProductIntent,
  type ProductObjectiveRow,
  type ProductRequirement,
  type ProductSource,
  type ProductWorker,
} from "../../lib/product/frontendProjection";
import type { DemoFrame, DemoScenario } from "../../lib/demo/playback";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const EVIDENCE = join(
  ROOT,
  "docs/work/gate-evidence/8f53da0/run-luna-5-obj_1790046504201_vporlj.json",
);
const OUT = join(ROOT, "lib/demo/scenarios/lunaRelaunch.ts");

const T0 = 1_790_046_504_201;
const OBJ = "obj_1790046504201_vporlj";
const WORKER =
  "worker_company_records_lookup-document_drafting-growth_launch_operations-public_information_research";
const CONTRACT = "contract_interpret_obj_1790046504201_vporlj_a1";
const ARTIFACT_KEY = "launch/page-message";
const INTENT_ID = "int_b1398f2d4ca05e902c5927f2";
const SIM_RESULT = "sim_result_6269e01f64377bbfb5f17971";

type EvidenceFile = {
  label: string;
  objectiveKey: string;
  startedAt: string;
  elapsedS: number;
  view: {
    requirements: Array<{
      requirementKey: string;
      title: string;
      mustBeTrue: string;
      priority: string;
      contractRevision: number;
      state: string;
      resolution: { acceptedAt: number; contractRevision: number } | null;
    }>;
    decisions: Array<{
      decisionId: string;
      requirementKey: string;
      strategy: string;
      authorization: string;
      at: number;
      rationale?: string;
      selectedOptionId?: string;
      options?: Array<{ optionId: string; strategy: string; label: string; eligibility: string }>;
    }>;
    assignments: Array<{
      assignmentId: string;
      decisionId: string;
      requirementKey: string;
      workerKey: string;
      state: string;
      resultSummary: string | null;
    }>;
    evidence: Array<{
      evidenceId: string;
      label: string;
      observedAt: number;
      origin: string;
      summary: string;
      requirementKey?: string;
    }>;
    workers: Array<{
      displayName: string;
      responsibility: string;
      lifecycle: string;
    }>;
    outcome: { contractId: string; intent: string; revision: number };
    external: Array<{
      intent: { intentId: string; state: string; kind: string };
      decisionId: string;
      providerId: string;
      resource: string;
      payment?: { maximumUsd?: number };
    }>;
    completion: { accepted: boolean; acceptedAt: number; summary: string };
    artifacts: Array<{
      label: string;
      versions: Array<{ version: number; at: number; summary: string; evidenceRefs: string[] }>;
    }>;
  };
  raw: {
    evidence: Array<{
      label: string;
      observedAt: number;
      origin: string;
      text: string;
      runId: string;
      evidenceId?: string;
    }>;
    record: {
      key: string;
      request: string;
      createdAt: number;
      updatedAt: number;
      state: string;
      result: { summary: string; completedAt: number } | null;
      companyArtifacts: Array<{
        key: string;
        label: string;
        content: string;
        version: number;
        updatedAt: number;
        history: Array<{
          version: number;
          content: string;
          changedByRunId: string;
          changedAt: number;
          changeNote: string;
          usedAcquisitionEvidenceIds?: string[];
        }>;
      }>;
      acquisitionResults: Array<{
        intentId: string;
        resultEvidenceId: string;
        provenance: string;
        providerId: string;
        serviceId: string;
        content: string;
        recordedAt: number;
        verifiedAt: number;
      }>;
      resourceNeeds: Array<{
        id: string;
        dedupeKey: string;
        purpose: string;
        reasonOwnedInsufficient: string;
        createdAt: number;
        validationAuthority: string | null;
        contractRevision: number | null;
        status: string;
        updatedAt: number;
      }>;
      finalSemanticAssessment: {
        meetsMinimumBar: boolean;
        rationale: string;
        artifactKey: string | null;
        artifactVersion: number | null;
        evidenceRefs: string[];
        assumptionsUnknowns: string[];
        recommendedNextAction: string;
        assessedAt: number;
        contractRevision: number;
      } | null;
      management: {
        controlNotes: Array<Record<string, unknown>>;
        interpretationStatus: string | null;
      };
      workItems: Array<{
        id: string;
        state: string;
        runs: Array<{
          id: string;
          status: string;
          startedAt: number;
          leaseUntil: number;
        }>;
        contract?: { targetArtifactKey?: string; inputEvidenceIds?: string[] };
      }>;
    };
  };
};

/** Durable story beats with absolute wall times from the evidence. */
const BEATS = [
  { id: "received", at: T0, note: "Objective received (seed / setup)." },
  { id: "interpreted", at: T0 + 19_635, note: "Outcome Contract established (missionStory)." },
  { id: "make_working", at: T0 + 28_795, note: "First MAKE assignment dispatched." },
  { id: "evidence_gap", at: T0 + 41_112, note: "Assignment failed waiting_for_resource; ResourceNeed created ~40.8s." },
  { id: "buy_decision", at: T0 + 49_618, note: "BUY decision persisted." },
  { id: "external_result", at: T0 + 50_432, note: "Simulated acquisition verified (provenance=simulation)." },
  { id: "make_req02", at: T0 + 61_418, note: "req_02 MAKE assignment dispatched." },
  { id: "artifact_v2", at: T0 + 77_439, note: "Artifact advanced to v2 (cites sim_result)." },
  { id: "make_req03", at: T0 + 92_525, note: "req_03 MAKE assignment dispatched." },
  { id: "artifact_v3", at: T0 + 112_788, note: "Artifact advanced to v3." },
  { id: "completed", at: T0 + 122_913, note: "Gate accepted completion (completion.acceptedAt)." },
] as const;

/** Compressed demo sequence (~26s) over the SAME frames — hand-authored pacing only. */
const DEMO_SEQUENCE_AT_MS = [
  0, // received
  1_500, // interpreted
  4_000, // make_working
  7_500, // evidence_gap
  11_000, // buy_decision
  14_000, // external_result
  17_000, // make_req02
  19_500, // artifact_v2
  21_500, // make_req03
  24_000, // artifact_v3
  26_000, // completed
] as const;

function loadEvidence(): EvidenceFile {
  return JSON.parse(readFileSync(EVIDENCE, "utf8")) as EvidenceFile;
}

function optionsSummary(decision: EvidenceFile["view"]["decisions"][number]): string {
  return JSON.stringify({
    extra: {
      options: (decision.options ?? []).map((opt) => ({
        optionId: opt.optionId,
        strategy: opt.strategy,
        internal: opt.strategy === "MAKE" ? { responsibility: opt.label } : undefined,
        external: opt.strategy === "BUY" ? { offeringId: opt.label, providerId: opt.label.split(":")[0] } : undefined,
      })),
    },
  });
}

function evidenceIdFor(ev: EvidenceFile, observedAt: number, label: string): string {
  const fromView = ev.view.evidence.find((row) => row.observedAt === observedAt && row.label === label);
  if (fromView) return fromView.evidenceId;
  return `ev_${observedAt}_reconstructed`;
}

function buildRequirements(ev: EvidenceFile, until: number): ProductRequirement[] {
  return ev.view.requirements.map((req) => {
    const resolved = req.resolution && req.resolution.acceptedAt <= until;
    return {
      requirementKey: req.requirementKey,
      contractRevision: req.contractRevision,
      priority: req.priority === "required" ? "required" : "supporting",
      title: req.title,
      mustBeTrue: req.mustBeTrue,
      scope: req.mustBeTrue,
      dependsOnRequirementKeys:
        req.requirementKey === "req_02" ? ["req_01"] : req.requirementKey === "req_03" ? ["req_02"] : [],
      state: resolved ? "satisfied" : until >= T0 + 19_635 ? "active" : "active",
      resolution: resolved
        ? { contractRevision: req.resolution!.contractRevision, acceptedAt: req.resolution!.acceptedAt }
        : null,
      blockedReason: null,
      waiver: null,
      updatedAt: resolved ? req.resolution!.acceptedAt : until >= T0 + 19_635 ? T0 + 19_635 : T0,
    };
  });
}

function buildDecisions(ev: EvidenceFile, until: number): ProductDecision[] {
  const decisions: ProductDecision[] = ev.view.decisions
    .filter((d) => d.at <= until)
    .map((d) => ({
      decisionId: d.decisionId,
      requirementKey: d.requirementKey,
      contractRevision: 1,
      kind: "satisfaction_strategy",
      strategy: d.strategy,
      optionId: d.selectedOptionId ?? null,
      authorization: { kind: "authorized" as const },
      rationale: d.rationale ?? null,
      strongestAlternativeId: null,
      coarsePlanSummary: optionsSummary(d),
      at: d.at,
    }));

  // Gate acceptance is recorded on the objective (completion.accepted) and the
  // final control_state; reconstruct the completion_proposal decision the
  // product projection requires for `completed` / verified deliverable status.
  if (ev.view.completion.accepted && ev.view.completion.acceptedAt <= until) {
    decisions.push({
      decisionId: `gate_${OBJ}_r1`,
      requirementKey: "",
      contractRevision: 1,
      kind: "completion_proposal",
      strategy: null,
      optionId: null,
      authorization: { kind: "refused" },
      rationale: null,
      strongestAlternativeId: null,
      coarsePlanSummary: JSON.stringify({ gateVerdict: { accepted: true } }),
      at: ev.view.completion.acceptedAt,
    });
  }
  return decisions;
}

/**
 * Assignment timeline from missionStory + view.assignments (final states).
 * Timestamps are authoritative durable transitions from the evidence.
 */
function buildAssignments(ev: EvidenceFile, until: number): ProductAssignment[] {
  const meta = [
    {
      assignmentId: "asg_09c9cb92772a1794392b4b95",
      decisionId: "dec_obj_1790046504201_vporlj_req_01_r1_a1",
      requirementKey: "req_01",
      dispatchedAt: T0 + 28_795,
      failedAt: T0 + 41_112,
      runId: "run_ee3fce19f969161054dfc904",
      runStartedAt: T0 + 28_800,
      targetArtifactKey: null as string | null,
      inputEvidenceIds: [] as string[],
      resultSummary:
        "run run_ee3fce19f969161054dfc904 ended waiting_for_resource; worker released for management redecision",
    },
    {
      assignmentId: "asg_bfd17e5ef43ea69bf1e0050e",
      decisionId: "dec_obj_1790046504201_vporlj_req_02_r1_a1",
      requirementKey: "req_02",
      dispatchedAt: T0 + 61_418,
      verifiedAt: T0 + 80_627,
      runId: "run_86a2fdff58969add41568347",
      runStartedAt: T0 + 61_500,
      targetArtifactKey: ARTIFACT_KEY,
      // Artifact v2 cites the verified acquisition — supportable causality.
      inputEvidenceIds: [SIM_RESULT],
      resultSummary: "application-verified against the current revision's proof obligations",
    },
    {
      assignmentId: "asg_9824518310842ac956f18d5e",
      decisionId: "dec_obj_1790046504201_vporlj_req_03_r1_a1",
      requirementKey: "req_03",
      dispatchedAt: T0 + 92_525,
      verifiedAt: T0 + 117_134,
      runId: "run_b51c8027a1080f507218cd0a",
      runStartedAt: T0 + 92_525,
      targetArtifactKey: ARTIFACT_KEY,
      inputEvidenceIds: [] as string[],
      resultSummary: "application-verified against the current revision's proof obligations",
    },
  ];

  const out: ProductAssignment[] = [];
  for (const row of meta) {
    if (until < row.dispatchedAt) continue;
    let state: ProductAssignment["state"] = "running";
    let updatedAt = row.dispatchedAt;
    if ("failedAt" in row && row.failedAt && until >= row.failedAt) {
      state = "failed";
      updatedAt = row.failedAt;
    } else if ("verifiedAt" in row && row.verifiedAt && until >= row.verifiedAt) {
      state = "verified";
      updatedAt = row.verifiedAt;
    }
    out.push({
      assignmentId: row.assignmentId,
      workerKey: WORKER,
      requirementKey: row.requirementKey,
      decisionId: row.decisionId,
      contractRevision: 1,
      kind: "internal_make",
      state,
      runId: row.runId,
      resultSummary: state === "failed" || state === "verified" ? row.resultSummary : null,
      inputEvidenceIds: row.inputEvidenceIds,
      targetArtifactKey: row.targetArtifactKey,
      createdAt: row.dispatchedAt,
      updatedAt,
    });
  }
  return out;
}

function buildIntent(ev: EvidenceFile, until: number): ProductIntent[] {
  const buyAt = T0 + 49_618;
  const preparedAt = T0 + 49_821;
  const verifiedAt = T0 + 50_432;
  if (until < buyAt) return [];
  const ext = ev.view.external[0];
  let state: ProductIntent["state"] = "authorized";
  let updatedAt = buyAt;
  let resultEvidenceId: string | null = null;
  if (until >= preparedAt) {
    state = "awaiting_m3";
    updatedAt = preparedAt;
  }
  if (until >= verifiedAt) {
    state = "verified";
    updatedAt = verifiedAt;
    resultEvidenceId = SIM_RESULT;
  }
  return [
    {
      intentId: INTENT_ID,
      requirementKey: "req_01",
      decisionId: ext?.decisionId ?? "dec_obj_1790046504201_vporlj_req_01_r1_a2",
      contractRevision: 1,
      kind: "external_acquisition",
      target: {
        providerId: "somebody_controlled_test",
        serviceId: "founder_narrative_pulse",
        offeringId: "somebody_controlled_test:founder_narrative_pulse",
        resourceClass: "proprietary_data",
      },
      terms: { priceUsd: 0.01, priceProvenance: "registry_data" },
      state,
      resultEvidenceId,
      createdAt: buyAt,
      updatedAt,
    },
  ];
}

function buildWorkItems(until: number): ProductObjectiveRow["workItems"] {
  const items: ProductObjectiveRow["workItems"] = [];
  // req_01 run
  if (until >= T0 + 28_795) {
    const failed = until >= T0 + 41_112;
    items.push({
      id: "wi:asg_09c9cb92772a1794392b4b95",
      state: failed ? "waiting_for_resource" : "running",
      runs: [
        {
          id: "run_ee3fce19f969161054dfc904",
          status: failed ? "stopped" : "running",
          startedAt: T0 + 28_800,
          leaseUntil: failed ? T0 + 41_112 : until + 300_000,
        },
      ],
    });
  }
  // req_02 run
  if (until >= T0 + 61_418) {
    const done = until >= T0 + 80_627;
    items.push({
      id: "wi:asg_bfd17e5ef43ea69bf1e0050e",
      state: done ? "completed" : "running",
      runs: [
        {
          id: "run_86a2fdff58969add41568347",
          status: done ? "stopped" : "running",
          startedAt: T0 + 61_500,
          leaseUntil: done ? T0 + 80_627 : until + 300_000,
        },
      ],
    });
  }
  // req_03 run
  if (until >= T0 + 92_525) {
    const done = until >= T0 + 117_134;
    items.push({
      id: "wi:asg_9824518310842ac956f18d5e",
      state: done ? "completed" : "running",
      runs: [
        {
          id: "run_b51c8027a1080f507218cd0a",
          status: done ? "stopped" : "running",
          startedAt: T0 + 92_525,
          leaseUntil: done ? T0 + 117_134 : until + 300_000,
        },
      ],
    });
  }
  return items;
}

function buildObjective(ev: EvidenceFile, until: number): ProductObjectiveRow {
  const rec = ev.raw.record;
  const art = rec.companyArtifacts[0];
  const history = art.history.filter((h) => h.changedAt <= until);
  const latest = history[history.length - 1] ?? art.history[0];
  const acq =
    until >= T0 + 50_432
      ? rec.acquisitionResults.map((row) => ({
          intentId: row.intentId,
          resultEvidenceId: row.resultEvidenceId,
          provenance: (row.provenance === "live" || row.provenance === "recorded_replay"
            ? row.provenance
            : "simulation") as "live" | "simulation" | "recorded_replay",
          providerId: row.providerId,
          serviceId: row.serviceId,
          content: row.content,
          recordedAt: row.recordedAt,
          verifiedAt: row.verifiedAt,
        }))
      : [];
  const needs: ProductObjectiveRow["resourceNeeds"] =
    until >= T0 + 40_799
      ? rec.resourceNeeds.map((row) => {
          const validationAuthority: "application" | "unconfirmed" | null =
            row.validationAuthority === "application" || row.validationAuthority === "unconfirmed"
              ? row.validationAuthority
              : null;
          return {
            id: row.id,
            dedupeKey: row.dedupeKey,
            purpose: row.purpose,
            reasonOwnedInsufficient: row.reasonOwnedInsufficient,
            createdAt: row.createdAt,
            validationAuthority,
            contractRevision: row.contractRevision,
          };
        })
      : [];

  const completed = ev.view.completion.accepted && until >= ev.view.completion.acceptedAt;
  const assessing = until >= T0 + 122_797 && !completed;
  const controlNotes = (rec.management.controlNotes as Array<Record<string, unknown>>).filter(
    (note) => typeof note.at === "number" && (note.at as number) <= until,
  );

  return {
    key: OBJ,
    request: rec.request,
    createdAt: T0,
    updatedAt: until,
    state: completed ? "completed" : until >= T0 + 19_635 ? "executing" : "received",
    result: completed && rec.result ? { summary: rec.result.summary, completedAt: rec.result.completedAt } : null,
    workItems: buildWorkItems(until),
    companyArtifacts:
      history.length > 0
        ? [
            {
              key: art.key,
              label: art.label,
              content: latest.content,
              version: latest.version,
              updatedAt: latest.changedAt,
              history,
            },
          ]
        : [],
    acquisitionResults: acq,
    resourceNeeds: needs,
    finalSemanticAssessment:
      completed && rec.finalSemanticAssessment && rec.finalSemanticAssessment.assessedAt <= until
        ? rec.finalSemanticAssessment
        : null,
    controlNotes,
    pendingFinalAssessmentRevision: assessing ? 1 : null,
    interpretationStatus: until >= T0 + 19_635 ? "done" : until >= T0 ? "running" : null,
    interpretationPending: until >= T0 && until < T0 + 19_635,
    pendingDecisionRequirementKey: null,
    managementPassWatchActive: false,
  };
}

function buildEvidence(ev: EvidenceFile, until: number): ProductEvidence[] {
  const byId = new Map<string, ProductEvidence>();
  for (const row of ev.view.evidence) {
    if (row.observedAt > until) continue;
    const raw = ev.raw.evidence.find((r) => r.observedAt === row.observedAt && r.label === row.label);
    // Map evidence → owning run via requirement phase (missionStory).
    let runId = raw?.runId ?? "";
    if (!runId) {
      if (row.requirementKey === "req_01") runId = "run_ee3fce19f969161054dfc904";
      else if (row.requirementKey === "req_02") runId = "run_86a2fdff58969add41568347";
      else if (row.requirementKey === "req_03") runId = "run_b51c8027a1080f507218cd0a";
    }
    byId.set(row.evidenceId, {
      evidenceId: row.evidenceId,
      label: row.label,
      text: raw?.text ?? row.summary,
      origin: row.origin === "application_observation" ? "application_observation" : "model_note",
      observedAt: row.observedAt,
      runId,
    });
  }
  return [...byId.values()];
}

function buildWorker(ev: EvidenceFile, until: number): ProductWorker {
  const w = ev.view.workers[0];
  const verified: ProductWorker["verifiedAssignments"] = [];
  if (until >= T0 + 80_627) {
    verified.push({ assignmentId: "asg_bfd17e5ef43ea69bf1e0050e", outcome: "accepted", at: T0 + 80_627 });
  }
  if (until >= T0 + 117_134) {
    verified.push({ assignmentId: "asg_9824518310842ac956f18d5e", outcome: "accepted", at: T0 + 117_134 });
  }
  return {
    workerKey: WORKER,
    displayName: w?.displayName ?? WORKER,
    responsibility: w?.responsibility ?? "",
    lifecycle: w?.lifecycle ?? "assigned",
    verifiedAssignments: verified,
  };
}

function buildSource(ev: EvidenceFile, until: number): ProductSource {
  const interpreted = until >= T0 + 19_635;
  return {
    objective: buildObjective(ev, until),
    contracts: interpreted
      ? [{ contractId: CONTRACT, revision: 1, intent: ev.view.outcome.intent, createdAt: T0 + 19_635 }]
      : [],
    requirements: interpreted ? buildRequirements(ev, until) : [],
    assignments: buildAssignments(ev, until),
    decisions: buildDecisions(ev, until),
    intents: buildIntent(ev, until),
    workers: [buildWorker(ev, until)],
    evidence: buildEvidence(ev, until),
  };
}

function main() {
  const ev = loadEvidence();
  if (ev.objectiveKey !== OBJ) {
    throw new Error(`Unexpected objectiveKey ${ev.objectiveKey}`);
  }

  const frames: DemoFrame[] = [];
  for (const beat of BEATS) {
    const source = buildSource(ev, beat.at);
    const workspace = projectObjectiveWorkspace(source, { now: beat.at + 1 });
    const summary = projectObjectiveSummary(source);
    const objectiveList = groupObjectiveSummaries([summary]);
    frames.push({
      elapsedMs: beat.at - T0,
      objectiveList,
      workspace,
    });
  }

  // Sanity: final frame must be completed with simulation provenance.
  const last = frames[frames.length - 1]!;
  if (last.workspace.objective.status !== "completed") {
    throw new Error(`Final status ${last.workspace.objective.status}, expected completed`);
  }
  const acq = last.workspace.acquisitions[0];
  if (!acq || acq.provenance !== "simulation") {
    throw new Error(`Expected simulation provenance on final acquisition, got ${acq?.provenance}`);
  }

  const scenario: DemoScenario = {
    id: "luna-relaunch-recovery",
    label: "Luna — Relaunch Recovery",
    source: {
      candidateSha: "8f53da0",
      objectiveId: OBJ,
      model: "openai/gpt-5.6-luna",
      evidencePath: "docs/work/gate-evidence/8f53da0/run-luna-5-obj_1790046504201_vporlj.json",
      acquisitionProvenance: "simulation",
    },
    originalDurationMs: ev.elapsedS * 1000,
    demoSequenceDurationMs: DEMO_SEQUENCE_AT_MS[DEMO_SEQUENCE_AT_MS.length - 1]!,
    frames,
    originalSequence: frames.map((frame, frameIndex) => ({
      frameIndex,
      atMs: frame.elapsedMs,
    })),
    demoSequence: DEMO_SEQUENCE_AT_MS.map((atMs, frameIndex) => ({ frameIndex, atMs })),
  };

  const body = `/* eslint-disable */
/**
 * AUTO-GENERATED by scripts/demo/build-luna-relaunch-scenario.ts — do not hand-edit frames.
 *
 * Product Contract snapshots for demo playback of a REAL Luna physical run.
 * Acquisition provenance inside these frames is \`simulation\` (historical truth).
 * UI demo playback must NOT relabel it as recorded_replay.
 *
 * Source: ${scenario.source.evidencePath}
 * Objective: ${scenario.source.objectiveId}
 * Model: ${scenario.source.model}
 * Candidate SHA: ${scenario.source.candidateSha}
 * Original duration: ${scenario.originalDurationMs}ms
 */
import type { DemoScenario } from "../playback";

export const lunaRelaunchScenario: DemoScenario = ${JSON.stringify(scenario, null, 2)} as DemoScenario;
`;

  writeFileSync(OUT, body);
  console.log(`Wrote ${OUT}`);
  console.log(
    `frames=${frames.length} original=${scenario.originalDurationMs}ms demo=${scenario.demoSequenceDurationMs}ms provenance=${scenario.source.acquisitionProvenance}`,
  );
  for (const [i, frame] of frames.entries()) {
    const w = frame.workspace;
    console.log(
      `  [${i}] t=${(frame.elapsedMs / 1000).toFixed(1)}s status=${w.objective.status} now=${w.somebodyNow.state} acq=${w.acquisitions.map((a) => `${a.status}:${a.provenance ?? "-"}`).join("|") || "-"} deliv=${w.deliverables.map((d) => `v${d.version}:${d.status}`).join("|") || "-"} activity=${w.activity.length}`,
    );
  }
}

main();
