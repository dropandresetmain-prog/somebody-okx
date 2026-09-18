// CP4 EVIDENCE — a real @openai/agents Agent/Runner continues across ≥1
// wake/replan cycle, and requirement satisfaction still only happens through
// the pure kernel with current-revision proof.
//
// Shape of the scenario (deliberately generic — no launch choreography):
//   Run 1 (wake: objective_submitted): worker takes what it can, hits a
//     missing company record and stops WITHOUT claiming completion.
//   The wake "resource_acquired" delivers the record into the application.
//   Run 2 (same assignment idempotency scope, fresh port state): the SAME
//     bounded runtime continues from persisted evidence, finishes proof, and
//     only then does requirements.ts accept satisfaction.
import test from "node:test";
import assert from "node:assert/strict";
import { Usage, type Model } from "@openai/agents";
import { runWorker } from "../lib/worker/runtime";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import { evaluateCompletion } from "../lib/objective/contract";
import { sourceIdentity } from "../lib/objective/contract";
import { attemptRequirementSatisfaction } from "../lib/management/requirements";
import type { WorkerObservation, WorkerPort, ModelNoteInput } from "../lib/worker/port";
import type { EvidenceRecord, ActivityResult, WorkContract } from "../lib/workforce";
import type { Requirement } from "../lib/management/types";

const now = 1800000000000;

// A mutable company-record table: the wake injects the missing record between
// runs, exactly like a resource_acquired wake would in production.
type Record_ = { ref: string; label: string; text: string };
const records: Record_[] = [];

type State = {
  evidence: EvidenceRecord[];
  result: ActivityResult | null;
  completed: boolean;
  completionError: string | null;
};
const state: State = { evidence: [], result: null, completed: false, completionError: null };

function contract(): WorkContract {
  return createWorkContract({
    assignment: "Summarize the partnership criteria from the company record and one public source.",
    idempotencyScope: "obj_launch:page_live:r1",
    worker: createWorkerSpec(["company_records_lookup", "public_information_research"]),
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 1 },
    ],
  });
}

function makePort(c: WorkContract): WorkerPort {
  function observation(): WorkerObservation {
    const appObservations = state.evidence.filter((e) => e.origin === "application_observation");
    const check = evaluateCompletion({ contract: c, evidence: appObservations, result: state.result });
    return {
      assignment: c.assignment,
      responsibility: "retrieve and record facts with sources",
      requiredSourceClasses: [...c.requiredSourceClasses],
      minObservations: c.minObservations,
      recordedFindings: state.evidence.map((item) => ({
        id: item.id,
        sourceClass: item.sourceClass,
        label: item.label,
        origin: item.origin,
        text: item.text,
      })),
      unmetCompletionRequirements: check.unmet,
    };
  }
  return {
    async read() {
      return observation();
    },
    async act(command) {
      if (command.type === "record_observation") {
        let text: string;
        if (command.source === "company_record") {
          const record = records.find((r) => r.ref === command.recordRef);
          if (!record) throw new Error(`Unknown company record: ${command.recordRef}`);
          text = record.text;
        } else {
          text = "Partner criteria published publicly.";
        }
        state.evidence.push({
          sourceClass: command.source,
          label: command.label,
          text,
          ...(command.url ? { url: command.url } : {}),
          ...(command.recordRef ? { recordRef: command.recordRef } : {}),
          observedAt: now,
          id: `ev-${state.evidence.length + 1}`,
          recordedBy: c.workerKey,
          runId: "run-continuation",
          origin: "application_observation",
          sourceId: sourceIdentity({
            sourceClass: command.source,
            ...(command.url ? { url: command.url } : {}),
            ...(command.recordRef ? { recordRef: command.recordRef } : {}),
          }),
        });
        return `Observation recorded: ${command.label}`;
      }
      if (command.type === "record_finding") {
        const finding: ModelNoteInput = command.finding;
        state.evidence.push({
          ...finding,
          id: `ev-${state.evidence.length + 1}`,
          recordedBy: c.workerKey,
          runId: "run-continuation",
          origin: "model_note",
          sourceId: `note:${state.evidence.length + 1}`,
        });
        return "Note recorded";
      }
      if (command.type === "submit_result") {
        state.result = { ...command.result, completedAt: now };
        return "Structured result stored; completion still requires application proof";
      }
      if (command.type === "request_completion") {
        const appObservations = state.evidence.filter((e) => e.origin === "application_observation");
        const check = evaluateCompletion({ contract: c, evidence: appObservations, result: state.result });
        if (!check.complete) {
          state.completionError = `Completion refused: ${check.unmet.join("; ")}`;
          throw new Error(state.completionError);
        }
        state.completed = true;
        return "Application accepted completion";
      }
      throw new Error(`unsupported command ${(command as { type: string }).type}`);
    },
  };
}

function toolCall(name: string, args: unknown, callId: string) {
  return { type: "function_call" as const, callId, name, arguments: JSON.stringify(args), status: "completed" as const };
}
function message(text: string) {
  return { type: "message" as const, role: "assistant" as const, content: [{ type: "output_text" as const, text }], status: "completed" as const };
}

// Two-phase scripted model: phase A does its partial work then STOPS without
// completion (the wake boundary); phase B resumes and finishes.
function phaseModel(script: () => Array<{ name: string; args: unknown }>): Model {
  let step = 0;
  let items: Array<{ name: string; args: unknown }> | null = null;
  return {
    async getResponse(request) {
      assert.ok(request.tools.length > 0, "no tools registered");
      if (!items) items = script();
      if (step < items.length) {
        const next = items[step++];
        return { usage: new Usage(), output: [toolCall(next.name, next.args, `c-${step}`)] };
      }
      step = 0;
      items = null;
      return { usage: new Usage(), output: [message("Pausing: application state is insufficient for completion.")] };
    },
    async *getStreamedResponse() {
      throw new Error("not used");
    },
  };
}

// The observation proofs bind to the ids the APPLICATION recorded across the
// two runs: ev-1 (run A's public page) and ev-2 (run B's company record) —
// CP3's putRequirement/bindProofParams seam does exactly this in production.
function requirementBound(): Requirement {
  return {
    requirementKey: "page_live",
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    contractRevision: 1,
    priority: "required",
    title: "criteria captured",
    mustBeTrue: "x",
    scope: "x",
    proofs: [
      { proofKey: "public_page", description: "app observation", proofKind: "application_observation", params: { sourceId: "ev-1" } },
      { proofKey: "company_record", description: "acquired record observation", proofKind: "application_observation", params: { sourceId: "ev-2" } },
    ],
    state: "active",
    strategy: "MAKE",
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

const factsForRun = () => ({
  artifactVersions: {},
  applicationObservationIds: state.evidence
    .filter((e) => e.origin === "application_observation")
    .map((e) => e.id),
  verifiedIntentIds: [],
  founderConfirmationRefs: [],
});

test("real Agent/Runner continuation: partial run ≠ satisfaction; post-wake run completes and only the kernel satisfies", async () => {
  const c = contract();
  const appObservations = () => state.evidence.filter((e) => e.origin === "application_observation");
  const kernelVerdict = () => evaluateCompletion({ contract: c, evidence: appObservations(), result: state.result });

  // ── Phase A: first wake — worker records the public source, then the
  //    company record is missing so the port rejects that tool call; the
  //    scripted model stops without requesting completion.
  const runA = await runWorker(makePort(c), c, {
    model: phaseModel(() => [
      { name: "read_public_web", args: { url: "https://example.com/criteria", focus: "criteria" } },
      { name: "read_company_record", args: { recordRef: "partnerships/criteria" } }, // fails: not yet acquired
    ]),
  });
  assert.ok(runA, "runner returned an output");
  assert.equal(state.completed, false);
  assert.equal(state.evidence.length, 1); // only the public observation survived

  // Run A "finished" — the central rule: a finished run satisfies NOTHING.
  const premature = attemptRequirementSatisfaction({
    requirement: requirementBound(),
    event: { kind: "assignment_run_finished", assignmentId: "asg_1", runStopped: false },
    facts: factsForRun(),
    resolutionId: "res_no",
    acceptedDecisionId: "dec_1",
    acceptedAssignmentId: "asg_1",
    acceptedIntentId: null,
    proofRefs: [],
    currentContractRevision: 1,
    at: now,
  });
  assert.equal(premature.satisfied, false);
  if (premature.satisfied) return;
  assert.ok(premature.reason.includes("assignment_run_finished"));

  // ── The wake: resource_acquired puts the record into the application.
  records.push({ ref: "partnerships/criteria", label: "Partnership criteria", text: "Partners must serve SMEs." });

  // ── Phase B: continuation replays under the SAME idempotency scope; the
  //    port state carried the earlier observation forward.
  const runB = await runWorker(makePort(c), c, {
    model: phaseModel(() => [
      { name: "read_company_record", args: { recordRef: "partnerships/criteria" } },
      {
        name: "submit_result",
        args: {
          summary: "Criteria: SME focus, public programme confirms.",
          fit: "good",
          risks: ["Public page is dated"],
          unknowns: ["Current SME reach"],
          recommendedNextAction: "publish",
        },
      },
      { name: "request_completion", args: {} },
    ]),
  });
  assert.ok(runB);
  assert.equal(state.evidence.length, 2, "the post-wake run added the company-record observation");
  assert.equal(kernelVerdict().complete, true, kernelVerdict().unmet.join("; "));

  // Application-owned completion, the same semantic M2 pinned: the bounded
  // runtime stops because the APPLICATION's verdict came back clean after
  // submit_result, so the scripted request_completion turn is never consumed.
  // The run is final because the proof says so, not because the model asked.
  const finalObservation = JSON.parse(String(runB.finalOutput)) as {
    unmetCompletionRequirements: string[];
  };
  assert.deepEqual(finalObservation.unmetCompletionRequirements, []);
  assert.equal(state.completed, false, "the model never self-declared completion");

  // Now — and only now — the proof-bearing event satisfies the requirement.
  const satisfied = attemptRequirementSatisfaction({
    requirement: requirementBound(),
    event: { kind: "artifact_changed", artifactKey: "criteria_notes", version: 2, contractRevision: 1 },
    facts: { ...factsForRun(), artifactVersions: {} },
    resolutionId: "res_1",
    acceptedDecisionId: "dec_1",
    acceptedAssignmentId: "asg_1",
    acceptedIntentId: null,
    proofRefs: state.evidence.map((e) => e.id),
    currentContractRevision: 1,
    at: now,
  });
  // proof is an application_observation, bound by the run ids the app recorded
  assert.equal(satisfied.satisfied, true, satisfied.satisfied ? "" : satisfied.reason);
});
