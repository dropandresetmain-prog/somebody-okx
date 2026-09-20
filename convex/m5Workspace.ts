// M5 INTEGRATION — ONE backend-composed normalized read model for the accepted
// Executive Mission Control workspace.
//
// Truth direction: Convex domain rows → lib/m5/workspaceModel composer →
// ObjectiveWorkspaceView. React is NOT the join layer; the client issues ONE
// reactive query and renders. No new authority lives here: this module only
// READS persisted rows (objectives, contracts, requirements, workers,
// assignments, decisions, intents, grants, evidence) and never writes.
//
// It imports only the pure composer — never the Node buyer rail, never
// lib/payment runtime code — so it stays bundleable in Convex's runtime.

import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  composeObjectiveWorkspace,
  type SourceAssignment,
  type SourceContract,
  type SourceDecisionRow,
  type SourceEvidenceRow,
  type SourceGrant,
  type SourceIntent,
  type SourceObjectiveRow,
  type SourceRequirement,
  type SourceWorker,
  type WorkspaceSource,
} from "../lib/m5/workspaceModel";

type AnyRow = { _id: unknown; [k: string]: unknown };

function rows<T>(list: AnyRow[], pick: (row: AnyRow) => T): T[] {
  return list.map(pick);
}

export const getObjectiveWorkspaceV2 = query({
  args: { objectiveKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const objectiveRow = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    if (!objectiveRow) {
      // Truthful absence: the frontend shows "Objective not found", never a
      // fixture substitution.
      return { found: false as const, view: null };
    }
    const record = (objectiveRow as AnyRow).data as SourceObjectiveRow & Record<string, unknown>;

    const [contractRows, requirementRows, assignmentRows, decisionRows, intentRows, grantRows, evidenceRows] =
      await Promise.all([
        ctx.db.query("outcomeContracts").withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey)).collect(),
        ctx.db.query("requirements").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey)).collect(),
        ctx.db.query("assignments").withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey)).collect(),
        ctx.db.query("managerialDecisions").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey)).collect(),
        ctx.db.query("executionIntents").withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey)).collect(),
        ctx.db.query("founderSpendGrants").withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey)).collect(),
        ctx.db.query("evidence").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey)).collect(),
      ]);

    // Highest persisted revision is the current contract truth.
    const contract = (contractRows as AnyRow[])
      .map((row) => row.data as SourceContract)
      .sort((a, b) => b.revision - a.revision)[0] ?? null;

    // Workers in this Objective's workspace: rows this objective created, or
    // rows referenced by its assignments/reservations. Global workers are not
    // dumped into a single objective's view.
    const assignments = (assignmentRows as AnyRow[]).map((row) => row.data as SourceAssignment);
    const assignmentWorkerKeys = new Set(assignments.map((item) => item.workerKey));
    const allWorkers = await ctx.db.query("workers").collect();
    const workers = (allWorkers as AnyRow[])
      .map((row) => row.data as SourceWorker)
      .filter(
        (worker) =>
          worker.createdByObjective === args.objectiveKey ||
          assignmentWorkerKeys.has(worker.workerKey) ||
          worker.reservedBy?.assignmentId !== null &&
            assignments.some((item) => item.assignmentId === worker.reservedBy?.assignmentId),
      );

    const source: WorkspaceSource = {
      objective: {
        key: record.key,
        request: record.request,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        state: record.state,
        result: record.result ?? null,
        companyArtifacts: (record as { companyArtifacts?: SourceObjectiveRow["companyArtifacts"] }).companyArtifacts ?? [],
        acquisitionResults: (record as { acquisitionResults?: SourceObjectiveRow["acquisitionResults"] }).acquisitionResults ?? [],
        management: (record as { management?: SourceObjectiveRow["management"] }).management,
      },
      contract,
      requirements: rows(requirementRows as AnyRow[], (row) => row.data as SourceRequirement),
      workers,
      assignments,
      decisions: rows(decisionRows as AnyRow[], (row) => row.data as SourceDecisionRow).sort((a, b) => a.at - b.at),
      intents: rows(intentRows as AnyRow[], (row) => row.data as SourceIntent).sort((a, b) => a.createdAt - b.createdAt),
      grants: rows(grantRows as AnyRow[], (row) => row.data as SourceGrant),
      evidence: rows(evidenceRows as AnyRow[], (row) => ({
        evidenceId: String(row.evidenceId),
        ...(((row.data ?? {}) as Record<string, unknown>) as Omit<SourceEvidenceRow, "evidenceId">),
      })).sort((a, b) => a.observedAt - b.observedAt),
    };

    return { found: true as const, view: composeObjectiveWorkspace(source) };
  },
});
