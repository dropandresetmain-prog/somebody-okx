"use client";

import type { AcquisitionView, AttentionActionView, ObjectiveListView, ObjectiveWorkspaceView } from "./contracts";
import { Sidebar } from "./components/Sidebar";
import { ObjectiveHeader } from "./components/ObjectiveHeader";
import { Checkpoints } from "./components/Checkpoints";
import { Activity } from "./components/Activity";
import { Deliverables } from "./components/Deliverables";
import { Acquisitions } from "./components/Acquisitions";
import { Attention } from "./components/Attention";

// Pure presentational V6 shell. Receives ONLY product-contract data plus UI
// callbacks — no Convex, no raw engine imports, no state recalculation.
export type MainPaneState =
  | { kind: "loading" }
  | { kind: "no_objectives" }
  | { kind: "not_found" }
  | { kind: "ready"; view: ObjectiveWorkspaceView; stale?: boolean };

export function V6WorkspaceView({
  list,
  selectedId,
  onSelect,
  onStartNew,
  main,
  onAttentionAction,
  pendingAttentionActionId,
  attentionError,
  attentionAcknowledgement,
}: {
  list: ObjectiveListView;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStartNew: () => void;
  main: MainPaneState;
  onAttentionAction?: (action: AttentionActionView) => void;
  pendingAttentionActionId?: string | null;
  attentionError?: string | null;
  attentionAcknowledgement?: string | null;
}) {
  return (
    <div className="v6-shell">
      <Sidebar list={list} selectedId={selectedId} onSelect={onSelect} onStartNew={onStartNew} />
      <main className="v6-main" data-main-pane={main.kind}>
        <MainPane
          main={main}
          onStartNew={onStartNew}
          onAttentionAction={onAttentionAction}
          pendingAttentionActionId={pendingAttentionActionId}
          attentionError={attentionError}
          attentionAcknowledgement={attentionAcknowledgement}
        />
      </main>
    </div>
  );
}

function MainPane({
  main,
  onStartNew,
  onAttentionAction,
  pendingAttentionActionId,
  attentionError,
  attentionAcknowledgement,
}: {
  main: MainPaneState;
  onStartNew: () => void;
  onAttentionAction?: (action: AttentionActionView) => void;
  pendingAttentionActionId?: string | null;
  attentionError?: string | null;
  attentionAcknowledgement?: string | null;
}) {
  switch (main.kind) {
    case "loading":
      return (
        <div className="state-card v6-state-card" data-loading="true">
          <p className="muted">Loading…</p>
        </div>
      );
    case "no_objectives":
      return (
        <div className="state-card v6-state-card" data-empty="true">
          <h1>Give Somebody an objective</h1>
          <p className="muted">Nothing has been started yet.</p>
          <button type="button" className="v6-start-cta" onClick={onStartNew}>
            <span>Start a new objective</span>
            <span aria-hidden="true">＋</span>
          </button>
        </div>
      );
    case "not_found":
      return (
        <div className="state-card v6-state-card" data-not-found="true">
          <h1>Objective not found</h1>
          <p className="muted">This objective isn&apos;t there anymore, or the link is wrong.</p>
        </div>
      );
    case "ready":
      return (
        <div className="v6-workspace" data-stale={main.stale ? "true" : "false"}>
          {main.stale ? (
            <p className="muted v6-reconnecting" role="status">
              Reconnecting… showing the last known state.
            </p>
          ) : null}
          <ObjectiveHeader
            objective={main.view.objective}
            somebodyNow={main.view.somebodyNow}
            currentWork={main.view.currentWork}
          />
          <div className="v6-columns">
            <div className="v6-column-primary">
              <Activity items={main.view.activity} acquisitions={main.view.acquisitions} />
            </div>
            <div className="v6-column-rail">
              <Attention
                attention={main.view.attention}
                onAction={onAttentionAction}
                pendingActionId={pendingAttentionActionId}
                error={attentionError}
                acknowledgement={attentionAcknowledgement}
              />
              <Deliverables deliverables={main.view.deliverables} />
              <Checkpoints progress={main.view.progress} />
              <OrphanAcquisitions activity={main.view.activity} acquisitions={main.view.acquisitions} />
            </div>
          </div>
        </div>
      );
  }
}

function OrphanAcquisitions({
  activity,
  acquisitions,
}: {
  activity: ObjectiveWorkspaceView["activity"];
  acquisitions: AcquisitionView[];
}) {
  const related = new Set(
    activity.flatMap((item) => (item.related?.acquisitionId ? [item.related.acquisitionId] : [])),
  );
  const orphans = acquisitions.filter((item) => !related.has(item.id));
  if (orphans.length === 0) return null;
  return <Acquisitions acquisitions={orphans} />;
}
