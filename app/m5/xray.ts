import type { ObjectiveWorkspaceView, SystemXrayFixture } from "./workspace";

export function buildXray(view: ObjectiveWorkspaceView): SystemXrayFixture {
  const nodes: SystemXrayFixture["nodes"] = [];
  const relationships: SystemXrayFixture["relationships"] = [];

  function rel(
    from: string,
    to: string,
    label: SystemXrayFixture["relationships"][number]["label"],
  ): void {
    relationships.push({ id: `rel-${from}-${label}-${to}`, from, to, label });
  }

  // ── Nodes ──────────────────────────────────────────────────────────────

  // 1. Objective
  nodes.push({
    id: view.objective.objectiveKey,
    label: view.objective.title,
    kind: "objective",
    detail: view.objective.request,
  });

  // 2. Outcome (if present)
  if (view.outcome) {
    nodes.push({
      id: view.outcome.contractId,
      label: view.outcome.intent,
      kind: "outcome",
      detail: `Revision ${view.outcome.revision} · ${view.outcome.levels.length} level(s)`,
    });
  }

  // 3. Requirements
  for (const req of view.requirements) {
    nodes.push({
      id: req.requirementKey,
      label: req.title,
      kind: "requirement",
      detail: req.mustBeTrue,
    });
  }

  // 4. Workers
  for (const w of view.workers) {
    nodes.push({
      id: w.workerKey,
      label: w.displayName,
      kind: "worker",
      detail: w.responsibility,
    });
  }

  // 5. Assignments
  for (const a of view.assignments) {
    nodes.push({
      id: a.assignmentId,
      label: `${a.workerKey} → ${a.requirementKey}`,
      kind: "assignment",
      detail: a.resultSummary ?? a.state,
    });
  }

  // 6. Decisions
  for (const d of view.decisions) {
    nodes.push({
      id: d.decisionId,
      label: d.summary,
      kind: "decision",
      detail: d.rationale,
    });
  }

  // 7. External providers + 8. Intents
  for (const ext of view.external) {
    nodes.push({
      id: ext.providerId,
      label: ext.name,
      kind: "provider",
      detail: ext.resource,
    });
    if (ext.intent) {
      nodes.push({
        id: ext.intent.intentId,
        label: ext.intent.kind,
        kind: "intent",
        detail: ext.intent.state,
      });
    }
  }

  // 9. Evidence
  for (const ev of view.evidence) {
    nodes.push({
      id: ev.evidenceId,
      label: ev.label,
      kind: "evidence",
      detail: ev.summary,
    });
  }

  // 10. Completion → verification node (if accepted)
  if (view.completion.accepted) {
    const completionId = `completion-${view.objective.objectiveKey}`;
    nodes.push({
      id: completionId,
      label: "Objective accepted",
      kind: "verification",
      detail: view.completion.summary,
    });
  }

  // ── Relationships ──────────────────────────────────────────────────────

  // outcome "defines" objective
  if (view.outcome) {
    rel(view.outcome.contractId, view.objective.objectiveKey, "defines");
  }

  // requirement "requires" outcome
  if (view.outcome) {
    for (const req of view.requirements) {
      rel(req.requirementKey, view.outcome.contractId, "requires");
    }
  }

  // assignment "assigned_to" worker
  for (const a of view.assignments) {
    rel(a.assignmentId, a.workerKey, "assigned_to");
  }

  // decision "addresses" requirement
  for (const d of view.decisions) {
    rel(d.decisionId, d.requirementKey, "addresses");
  }
  // decision "selects" option — SKIP (options are not nodes)

  // external "provided_by" provider
  for (const ext of view.external) {
    rel(ext.requirementKey, ext.providerId, "provided_by");
  }

  // intent "authorizes" decision
  for (const ext of view.external) {
    if (ext.intent) {
      rel(ext.intent.intentId, ext.decisionId, "authorizes");
    }
  }

  // evidence "proof_for" requirement
  for (const ev of view.evidence) {
    rel(ev.evidenceId, ev.requirementKey, "proof_for");
  }

  // requirement resolution "accepts" evidence
  for (const req of view.requirements) {
    if (req.resolution) {
      for (const proofRef of req.resolution.proofRefs) {
        rel(req.requirementKey, proofRef, "accepts");
      }
    }
  }

  // completion "accepts" evidence
  if (view.completion.accepted) {
    const completionId = `completion-${view.objective.objectiveKey}`;
    for (const proofRef of view.completion.proofRefs) {
      rel(completionId, proofRef, "accepts");
    }
  }

  // ── Runtime ────────────────────────────────────────────────────────────

  const runtime: SystemXrayFixture["runtime"] = [
    { label: "Provenance", value: view.provenance },
    { label: "Snapshot count", value: String(view.missionStory.length) },
    { label: "Backend", value: "No live backend — fixture data only" },
  ];

  return { nodes, relationships, runtime };
}
