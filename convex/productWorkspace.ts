// V1 PRODUCT READ QUERIES — Objective list, Objective workspace, Start
// capabilities. See docs/product/FRONTEND_CONTRACTS.md.
//
// Direction of truth (never reversed):
//   Convex rows → lib/product/sourceAdapter (normalize) →
//   lib/product/frontendProjection (pure) → ProductReadEnvelope<View>
//
// These queries only READ persisted rows and return product contract shapes.
// They add no authority, expose no raw Requirement/Assignment/Intent arrays,
// and (deliberately) accept no commands — the M5 read model stays untouched.
//
// Imports only pure modules (never the Node buyer rail), so it bundles in
// Convex's default runtime.

import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type {
  ObjectiveListView,
  ObjectiveWorkspaceView,
  ProductReadEnvelope,
  StartCapabilitiesView,
} from "../app/product/contracts";
import {
  deriveViewRevision,
  groupObjectiveSummaries,
  projectObjectiveSummary,
  projectObjectiveWorkspace,
  projectStartCapabilities,
  type ProductSource,
  type StatusSource,
} from "../lib/product/frontendProjection";
import {
  normalizeAssignment,
  normalizeContract,
  normalizeDecision,
  normalizeEvidence,
  normalizeIntent,
  normalizeObjective,
  normalizeRequirement,
  normalizeWorker,
} from "../lib/product/sourceAdapter";

type AnyRow = { _id: unknown; [k: string]: unknown };
type Loose = Record<string, unknown>;

const dataOf = (row: unknown): Loose => ((row as AnyRow).data ?? {}) as Loose;

function envelope<T>(view: T, generatedAt: number): ProductReadEnvelope<T> {
  return { found: true, contractVersion: 1, viewRevision: deriveViewRevision(view), generatedAt, view };
}

// The reads shared by the list (status only) and the full workspace.
async function loadStatusSource(ctx: QueryCtx, objectiveRow: unknown): Promise<StatusSource> {
  const objective = normalizeObjective(dataOf(objectiveRow));
  const key = objective.key;
  const [contractRows, requirementRows, assignmentRows, decisionRows, intentRows] = await Promise.all([
    ctx.db.query("outcomeContracts").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect(),
    ctx.db.query("requirements").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect(),
    ctx.db.query("assignments").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect(),
    ctx.db.query("managerialDecisions").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect(),
    ctx.db.query("executionIntents").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect(),
  ]);
  return {
    objective,
    contracts: contractRows.map((row) => normalizeContract(dataOf(row))),
    requirements: requirementRows.map((row) => normalizeRequirement(dataOf(row))),
    assignments: assignmentRows.map((row) => normalizeAssignment(dataOf(row))),
    decisions: trimDecisionsForStatus(decisionRows as AnyRow[]).map((row) => normalizeDecision(dataOf(row))),
    intents: intentRows.map((row) => normalizeIntent(dataOf(row))),
  };
}

// Product list window: the V6 list shows recent navigation summaries only, so
// the read is bounded to the most-recently-updated rows via the by_updatedAt
// index (the same discipline as `listObjectives`) instead of collecting every
// Objective document — with its full management state — just to summarize it.
const OBJECTIVE_LIST_WINDOW = 20;
/** Status derivation only needs recent decision rows; unbounded collect was timing out locally. */
const STATUS_DECISION_SCAN_CAP = 48;
const LIST_STATUS_BATCH_SIZE = 5;

function trimDecisionsForStatus(rows: AnyRow[]): AnyRow[] {
  if (rows.length <= STATUS_DECISION_SCAN_CAP) return rows;
  return [...rows]
    .sort((a, b) => (num(dataOf(b), "at") ?? 0) - (num(dataOf(a), "at") ?? 0))
    .slice(0, STATUS_DECISION_SCAN_CAP);
}

function num(data: Loose, key: string): number | undefined {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

export const getObjectiveListV1 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<ProductReadEnvelope<ObjectiveListView>> => {
    const now = Date.now();
    const objectiveRows = (await ctx.db
      .query("objectives")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(OBJECTIVE_LIST_WINDOW)) as AnyRow[];
    // Lightweight: only the rows the status derivation needs; no evidence,
    // workers, deliverable content, activity or full workspace composition.
    const sources = await mapInBatches(objectiveRows, LIST_STATUS_BATCH_SIZE, (row) => loadStatusSource(ctx, row));
    const list = groupObjectiveSummaries(sources.map((source) => projectObjectiveSummary(source)));
    return envelope(list, now);
  },
});

export const getObjectiveWorkspaceV1 = query({
  args: { objectiveKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<ProductReadEnvelope<ObjectiveWorkspaceView>> => {
    const now = Date.now();
    const objectiveRow = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    if (!objectiveRow) return { found: false, contractVersion: 1, reason: "not_found" };

    const base = await loadStatusSource(ctx, objectiveRow);
    const evidenceRows = (await ctx.db
      .query("evidence")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect()) as AnyRow[];

    // Only the workers this Objective's assignments name; global workers are
    // never dumped into a single Objective's view.
    const workerKeys = [...new Set(base.assignments.map((row) => row.workerKey))];
    const workerRows = await Promise.all(
      workerKeys.map((workerKey) =>
        ctx.db
          .query("workers")
          .withIndex("by_workerKey", (q) => q.eq("workerKey", workerKey))
          .unique(),
      ),
    );

    const source: ProductSource = {
      ...base,
      workers: workerRows.filter((row): row is NonNullable<typeof row> => row !== null).map((row) => normalizeWorker(dataOf(row))),
      evidence: evidenceRows.map((row) => normalizeEvidence({ evidenceId: row.evidenceId, data: row.data })),
    };
    // Convex holds no M3 rows, so transaction facts are not joined: `transaction`
    // is omitted rather than inferred from M4 intent state (contract §36).
    return envelope(projectObjectiveWorkspace(source, { now }), now);
  },
});

export const getStartCapabilitiesV1 = query({
  args: {},
  returns: v.any(),
  handler: async (): Promise<ProductReadEnvelope<StartCapabilitiesView>> => {
    const now = Date.now();
    return envelope(projectStartCapabilities(), now);
  },
});
