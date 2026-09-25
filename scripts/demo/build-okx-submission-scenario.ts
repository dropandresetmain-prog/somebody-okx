/**
 * Build lib/demo/scenarios/okxSubmissionRun.ts from a raw Convex MVCC export
 * of the founder's completed GPT-6 run (obj_1790305036274_96t4b4), by
 * reconstructing DB state at each distinct commit timestamp and feeding it
 * through the REAL product projection (the exact same path Convex uses in
 * convex/productWorkspace.ts): normalizers from lib/product/sourceAdapter.ts
 * -> projectObjectiveWorkspace / projectObjectiveSummary / groupObjectiveSummaries
 * from lib/product/frontendProjection.ts.
 *
 * Does NOT invent Activity, acquisitions, artifacts, or completion. Every
 * frame is a real product-contract snapshot at a real historical instant.
 *
 * Usage: npx tsx scripts/demo/build-okx-submission-scenario.ts [evidencePath]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  groupObjectiveSummaries,
  projectObjectiveSummary,
  projectObjectiveWorkspace,
  type ProductSource,
  type StatusSource,
} from "../../lib/product/frontendProjection";
import {
  normalizeAssignment,
  normalizeContract,
  normalizeDecision,
  normalizeEvidence,
  normalizeIntent,
  normalizeObjective,
  normalizeRequirement,
  normalizeWorker,
} from "../../lib/product/sourceAdapter";
import { normalizeIntegrationEventsForProduct } from "../../lib/integration/productProjection";
import type { ObjectiveListView, ObjectiveWorkspaceView } from "../../app/product/contracts";
import type { DemoFrame, DemoScenario, DemoSequenceEntry } from "../../lib/demo/playback";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DEFAULT_EVIDENCE =
  "C:\\Users\\sethl\\AppData\\Local\\Temp\\claude\\C--Dev-somebody-okx\\1d4e5979-7e4f-463c-8b5d-0f1b1f7dfded\\scratchpad\\gpt6-versioned.json";
const EVIDENCE = resolve(process.argv[2] ?? DEFAULT_EVIDENCE);
const OUT = join(ROOT, "lib/demo/scenarios/okxSubmissionRun.ts");

const OBJ = "obj_1790305036274_96t4b4";
const CANDIDATE_SHA = "83db29a";
const MODEL = "openai/gpt-6-luna";

// ── Evidence export shape ────────────────────────────────────────────────
type Version = { ts_ms: number; deleted: boolean; doc: Record<string, unknown> };
type DocHistory = { id: string; versions: Version[] };
type EvidenceFile = {
  objectiveKey: string;
  tables: Record<string, DocHistory[]>;
};

function loadEvidence(): EvidenceFile {
  return JSON.parse(readFileSync(EVIDENCE, "utf8")) as EvidenceFile;
}

/** Reconstruct table state at instant T: latest version with ts_ms <= T, dropped if deleted/absent. */
function tableAt(ev: EvidenceFile, table: string, until: number): Record<string, unknown>[] {
  const docs = ev.tables[table] ?? [];
  const out: Record<string, unknown>[] = [];
  for (const doc of docs) {
    let best: Version | null = null;
    for (const v of doc.versions) {
      if (v.ts_ms <= until && (best === null || v.ts_ms > best.ts_ms)) best = v;
    }
    if (best && !best.deleted) out.push(best.doc);
  }
  return out;
}

function allDistinctTimestamps(ev: EvidenceFile): number[] {
  const set = new Set<number>();
  for (const table of Object.values(ev.tables)) {
    for (const doc of table) {
      for (const v of doc.versions) set.add(v.ts_ms);
    }
  }
  return [...set].sort((a, b) => a - b);
}

type AnyRow = Record<string, unknown>;
const dataOf = (row: unknown): AnyRow => ((row as AnyRow).data ?? {}) as AnyRow;

/** Mirrors convex/productWorkspace.ts trimDecisionsForStatus exactly (byte-for-byte logic, duplicated
 * here because that module also imports the Convex query wrapper and cannot run outside Convex). */
const STATUS_DECISION_SCAN_CAP = 48;
function trimDecisionsForStatus(rows: AnyRow[]): AnyRow[] {
  if (rows.length <= STATUS_DECISION_SCAN_CAP) return rows;
  return [...rows]
    .sort((a, b) => (numOf(dataOf(b), "at") ?? 0) - (numOf(dataOf(a), "at") ?? 0))
    .slice(0, STATUS_DECISION_SCAN_CAP);
}
function numOf(data: AnyRow, key: string): number | undefined {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Mirrors convex/productWorkspace.ts loadStatusSource, over reconstructed-at-T rows. */
function buildStatusSource(ev: EvidenceFile, until: number): StatusSource | null {
  const objectiveRows = tableAt(ev, "objectives", until).filter((row) => dataOf(row).key === OBJ);
  if (objectiveRows.length === 0) return null;
  const objective = normalizeObjective(dataOf(objectiveRows[0]));
  const key = objective.key;

  const contractRows = tableAt(ev, "outcomeContracts", until).filter((row) => row.objectiveKey === key);
  const requirementRows = tableAt(ev, "requirements", until).filter((row) => row.objectiveKey === key);
  const assignmentRows = tableAt(ev, "assignments", until).filter((row) => row.objectiveKey === key);
  const decisionRows = tableAt(ev, "managerialDecisions", until).filter((row) => row.objectiveKey === key);
  const intentRows = tableAt(ev, "executionIntents", until).filter((row) => row.objectiveKey === key);

  return {
    objective,
    contracts: contractRows.map((row) => normalizeContract(dataOf(row))),
    requirements: requirementRows.map((row) => normalizeRequirement(dataOf(row))),
    assignments: assignmentRows.map((row) => normalizeAssignment(dataOf(row))),
    decisions: trimDecisionsForStatus(decisionRows as AnyRow[]).map((row) => normalizeDecision(dataOf(row))),
    intents: intentRows.map((row) => normalizeIntent(dataOf(row))),
  };
}

/** Mirrors convex/productWorkspace.ts getObjectiveWorkspaceV1's extra reads, over reconstructed-at-T rows. */
function buildProductSource(ev: EvidenceFile, until: number): ProductSource | null {
  const base = buildStatusSource(ev, until);
  if (!base) return null;

  const evidenceRows = tableAt(ev, "evidence", until).filter((row) => row.objectiveKey === OBJ);
  const workerKeys = [...new Set(base.assignments.map((row) => row.workerKey))];
  const workerRows = tableAt(ev, "workers", until).filter((row) => workerKeys.includes(row.workerKey as string));

  const objectiveRows = tableAt(ev, "objectives", until).filter((row) => dataOf(row).key === OBJ);
  const objectiveData = dataOf(objectiveRows[0]);

  return {
    ...base,
    workers: workerRows.map((row) => normalizeWorker(dataOf(row))),
    evidence: evidenceRows.map((row) => normalizeEvidence({ evidenceId: row.evidenceId, data: row.data })),
    integrationEvents: normalizeIntegrationEventsForProduct(objectiveData.integrationEvents),
  };
}

function buildFrameAt(ev: EvidenceFile, until: number, t0: number): DemoFrame | null {
  const source = buildProductSource(ev, until);
  if (!source) return null;
  const workspace = projectObjectiveWorkspace(source, { now: until });
  const summary = projectObjectiveSummary(source);
  const objectiveList = groupObjectiveSummaries([summary]);
  return { elapsedMs: Math.round(until - t0), objectiveList, workspace };
}

// ── Volatile-field-stripped comparison, to find materially-changed frames ──
const VOLATILE_KEYS = new Set(["updatedAt", "generatedAt", "lastProgressAt", "at", "occurredAt", "observedAt"]);
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_KEYS.has(k)) continue;
      out[k] = stripVolatile(v);
    }
    return out;
  }
  return value;
}
function materiallyDifferent(a: DemoFrame, b: DemoFrame): boolean {
  return JSON.stringify(stripVolatile(a.workspace)) !== JSON.stringify(stripVolatile(b.workspace));
}

// ── Build all candidate frames, keep only materially-changed ones ─────────
function main() {
  const ev = loadEvidence();
  if (ev.objectiveKey !== OBJ) {
    throw new Error(`Evidence objectiveKey mismatch: expected ${OBJ}, got ${ev.objectiveKey}`);
  }

  const timestamps = allDistinctTimestamps(ev);
  const objVersions = (ev.tables.objectives?.[0]?.versions ?? []).map((v) => v.ts_ms).sort((a, b) => a - b);
  if (objVersions.length === 0) throw new Error("No objectives versions found in evidence.");
  const T0 = objVersions[0]!;

  const candidateInstants = [...new Set([T0, ...timestamps.filter((t) => t >= T0)])].sort((a, b) => a - b);

  const kept: DemoFrame[] = [];
  for (const t of candidateInstants) {
    const frame = buildFrameAt(ev, t, T0);
    if (!frame) continue;
    if (kept.length === 0 || materiallyDifferent(kept[kept.length - 1]!, frame)) {
      kept.push(frame);
    }
  }

  if (kept.length === 0) throw new Error("No frames reconstructed from evidence.");

  // Never drop the final frame.
  const finalFrame = kept[kept.length - 1]!;
  const originalDurationMs = finalFrame.elapsedMs;

  // ── Timing: milestone frames → replay time ───────────────────────────────
  // Milestone frames are DETECTED in the projected frames (never hand-placed
  // indices) and pinned to replay times. Frames between two milestones are
  // spaced evenly by order, so real idle waits (founder approval, the payment
  // round trip) compress while every real state still gets readable time.
  const firstIdx = (pred: (f: DemoFrame) => boolean): number => kept.findIndex(pred);
  const attentionIdx = firstIdx((f) => f.workspace.attention !== null);
  const approvedIdx =
    attentionIdx < 0 ? -1 : kept.findIndex((f, i) => i > attentionIdx && f.workspace.attention === null);
  const proposedIdx = firstIdx((f) => f.workspace.acquisitions.length > 0);
  const acquiringIdx = firstIdx((f) => f.workspace.acquisitions.some((a) => a.status === "in_progress"));
  const resultIdx = firstIdx((f) => f.workspace.acquisitions.some((a) => a.status === "result_received"));
  const verifiedIdx = firstIdx((f) => f.workspace.acquisitions.some((a) => a.status === "verified"));
  const workingIdx = firstIdx((f) => f.workspace.objective.status === "working");
  const completedIdx = firstIdx((f) => f.workspace.objective.status === "completed");

  // [kept-frame index, replay ms]; missing milestones are skipped.
  const anchorPairs: Array<[number, number]> = [
    [0, 0],
    [workingIdx, 8_000], // outcome defined → internal MAKE
    [attentionIdx, 50_000], // MAKE, evidence, sourcing → Needs You
    [approvedIdx, 61_000], // hold Needs You ~11 s → approval recorded
    [proposedIdx, 65_000], // BUY selected on the OKX market
    [acquiringIdx, 68_000], // wallet, x402, X Layer Testnet
    [resultIdx, 84_000], // external result arrives
    [verifiedIdx, 91_000], // result verified → MAKE resumes
    [completedIdx, 114_000], // resumed MAKE → completion
  ];
  const anchors = anchorPairs
    .filter(([idx]) => idx >= 0)
    .filter((a, i, arr) => i === 0 || a[0] > arr[i - 1]![0]);
  const replayAt: number[] = new Array(kept.length).fill(0);
  for (let k = 1; k < anchors.length; k++) {
    const [i0, d0] = anchors[k - 1]!;
    const [i1, d1] = anchors[k]!;
    for (let i = i0; i <= i1; i++) replayAt[i] = Math.round(d0 + ((i - i0) / (i1 - i0)) * (d1 - d0));
  }
  const lastAnchor = anchors[anchors.length - 1]!;
  for (let i = lastAnchor[0] + 1; i < kept.length; i++) replayAt[i] = lastAnchor[1];
  const toReplayIdx = (i: number): number => replayAt[i]!;

  // ── Selection: readable spacing, never losing a product beat ─────────────
  // A frame is a beat when objective status, attention, an acquisition status
  // or a deliverable version changes. Beats are always kept; other frames are
  // kept only when at least MIN_GAP_MS of replay time has passed.
  function beatSignature(f: DemoFrame): string {
    const w = f.workspace;
    return JSON.stringify({
      status: w.objective.status,
      attention: w.attention ? w.attention.type : null,
      acquisitions: w.acquisitions.map((a) => a.status),
      deliverableVersions: w.deliverables.map((d) => `${d.version}:${d.status}`),
    });
  }
  const MIN_GAP_MS = 2_400;
  const chosen: number[] = [0];
  for (let i = 1; i < kept.length; i++) {
    const isBeat = beatSignature(kept[i]!) !== beatSignature(kept[i - 1]!) || i === kept.length - 1;
    const gap = toReplayIdx(i) - toReplayIdx(chosen[chosen.length - 1]!);
    if (isBeat || gap >= MIN_GAP_MS) chosen.push(i);
  }
  const frames = chosen.map((i) => kept[i]!);
  const originalSequence: DemoSequenceEntry[] = frames.map((f, i) => ({ frameIndex: i, atMs: f.elapsedMs }));
  const demoAt = chosen.map((i) => toReplayIdx(i));
  for (let i = 1; i < demoAt.length; i++) {
    if (demoAt[i]! <= demoAt[i - 1]!) demoAt[i] = demoAt[i - 1]! + 250;
  }
  // The completed frame holds until the end so visitors can read the report.
  const demoSequenceDurationMs = 120_000;
  const foundBeats = new Set(
    Object.entries({ workingIdx, attentionIdx, approvedIdx, proposedIdx, acquiringIdx, resultIdx, verifiedIdx, completedIdx })
      .filter(([, idx]) => idx >= 0)
      .map(([key]) => key),
  );
  const orderedBeats = ["workingIdx", "attentionIdx", "approvedIdx", "proposedIdx", "acquiringIdx", "resultIdx", "verifiedIdx", "completedIdx"].map(
    (key) => ({ key }),
  );

  const demoSequence: DemoSequenceEntry[] = frames.map((_, i) => ({ frameIndex: i, atMs: demoAt[i]! }));

  // ── Provenance / model ──────────────────────────────────────────────────
  const finalObjectiveRows = tableAt(ev, "objectives", finalFrame.elapsedMs + T0).filter(
    (row) => dataOf(row).key === OBJ,
  );
  const finalObjectiveData = dataOf(finalObjectiveRows[0]);
  const acquisitionResults = (finalObjectiveData.acquisitionResults as AnyRow[] | undefined) ?? [];
  const acquisitionProvenance =
    (acquisitionResults[0]?.provenance as "live" | "simulation" | "recorded_replay" | undefined) ?? "simulation";

  const scenario: DemoScenario = {
    id: "okx-submission-run",
    label: "Launch-week social media plan",
    source: {
      candidateSha: CANDIDATE_SHA,
      objectiveId: OBJ,
      model: MODEL,
      evidencePath: `local Convex history of ${OBJ} (not committed)`,
      acquisitionProvenance,
    },
    originalDurationMs,
    demoSequenceDurationMs,
    frames,
    originalSequence,
    demoSequence,
  };

  // ── Sanity checks ────────────────────────────────────────────────────────
  const last = frames[frames.length - 1]!;
  if (last.workspace.objective.status !== "completed") {
    throw new Error(`Final frame status is not completed: ${last.workspace.objective.status}`);
  }
  if (last.workspace.deliverables.length === 0) {
    throw new Error("Final frame has no deliverables.");
  }
  if (!last.workspace.deliverables.some((d) => d.status === "verified")) {
    throw new Error("Final frame has no verified deliverable.");
  }
  const hasNeedsYouAttention = frames.some(
    (f) => f.workspace.attention !== null && f.objectiveList.needsYou.some((row) => row.id === OBJ),
  );
  if (!hasNeedsYouAttention) {
    throw new Error("No frame found with attention + objectiveList.needsYou set.");
  }
  const hasAcquisition = frames.some((f) => f.workspace.acquisitions.length > 0);
  if (!hasAcquisition) {
    throw new Error("No frame shows an acquisition.");
  }
  for (let i = 1; i < demoSequence.length; i++) {
    if (demoSequence[i]!.atMs <= demoSequence[i - 1]!.atMs) {
      throw new Error(`demoSequence not strictly increasing at index ${i}`);
    }
  }
  if (demoSequenceDurationMs < 100_000 || demoSequenceDurationMs > 120_000) {
    throw new Error(`demoSequenceDurationMs out of range: ${demoSequenceDurationMs}`);
  }

  // ── Write output ─────────────────────────────────────────────────────────
  const header = `/* eslint-disable */
/**
 * AUTO-GENERATED by scripts/demo/build-okx-submission-scenario.ts — do not hand-edit frames.
 *
 * Product Contract snapshots for demo playback of the founder's completed
 * GPT-6 run, pushed through the REAL product projection
 * (lib/product/frontendProjection.ts + lib/product/sourceAdapter.ts), exactly
 * as convex/productWorkspace.ts builds them. No invented states, events, or
 * text.
 *
 * Objective: ${OBJ}
 * Model: ${MODEL}
 * Candidate SHA: ${CANDIDATE_SHA}
 * Original duration: ${originalDurationMs}ms
 * Acquisition provenance (historical truth, preserved as-is): ${acquisitionProvenance}
 */
import type { DemoScenario } from "../playback";

export const okxSubmissionRunScenario: DemoScenario = ${JSON.stringify(scenario, null, 2)};
`;
  writeFileSync(OUT, header, "utf8");

  // ── Per-frame report ─────────────────────────────────────────────────────
  console.log(`\nEvidence: ${EVIDENCE}`);
  console.log(`Candidate instants: ${candidateInstants.length}; materially-distinct kept: ${kept.length}; final frames: ${frames.length}`);
  console.log(`originalDurationMs=${originalDurationMs}  demoSequenceDurationMs=${demoSequenceDurationMs}`);
  console.log(`acquisitionProvenance (from run)=${acquisitionProvenance}\n`);

  const rows = frames.map((f, i) => {
    const w = f.workspace;
    const bucket = f.objectiveList.needsYou.length ? "needsYou" : f.objectiveList.done.length ? "done" : "inProgress";
    const attn = w.attention ? `${w.attention.type}${w.attention.context?.amount ? ` $${w.attention.context.amount.amount}` : ""}` : "-";
    const acq = w.acquisitions.length
      ? w.acquisitions.map((a) => `${a.status}/${a.provenance ?? "-"}`).join(",")
      : "-";
    const deliv = w.deliverables.length
      ? w.deliverables.map((d) => `v${d.version}`).join(",")
      : "-";
    return {
      idx: i,
      atMs: demoSequence[i]!.atMs,
      realS: (f.elapsedMs / 1000).toFixed(1),
      status: w.objective.status,
      bucket,
      headline: w.somebodyNow.headline.slice(0, 50),
      attention: attn,
      acquisitions: acq,
      deliverables: deliv,
      activity: w.activity.length,
    };
  });
  console.table(rows);

  console.log("\nBeats found in the real data:");
  for (const b of orderedBeats) {
    console.log(`  ${foundBeats.has(b.key) ? "[x]" : "[ ]"} ${b.key}`);
  }

  console.log(`\nWrote ${OUT}`);
}

main();
