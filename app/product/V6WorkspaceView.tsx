import type { ObjectiveListView, ObjectiveWorkspaceView } from "./contracts";
import { Sidebar } from "./components/Sidebar";
import { ObjectiveHeader } from "./components/ObjectiveHeader";
import { Checkpoints } from "./components/Checkpoints";
import { CurrentWork } from "./components/CurrentWork";
import { Activity } from "./components/Activity";
import { Deliverables } from "./components/Deliverables";
import { Acquisitions } from "./components/Acquisitions";
import { Attention } from "./components/Attention";

// Pure presentational V6 shell (task §8). Receives ONLY product-contract data
// plus UI callbacks — no Convex, no raw engine imports, no state
// recalculation. `ProductWorkspace.tsx` is the only caller.
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
}: {
  list: ObjectiveListView;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStartNew: () => void;
  main: MainPaneState;
}) {
  return (
    <div className="v6-shell">
      <Sidebar list={list} selectedId={selectedId} onSelect={onSelect} onStartNew={onStartNew} />
      <main className="v6-main" data-main-pane={main.kind}>
        <MainPane main={main} onStartNew={onStartNew} />
      </main>
    </div>
  );
}

function MainPane({ main, onStartNew }: { main: MainPaneState; onStartNew: () => void }) {
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
          <button type="button" className="button primary large" onClick={onStartNew}>
            Start a new objective
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
        <div
          className="v6-workspace"
          data-stale={main.stale ? "true" : "false"}
          // Soft cross-fade when the product-data source advances a frame
          // (live or demo). Keyed by objective status + activity length only —
          // no demo-specific branching.
          key={`${main.view.objective.status}:${main.view.activity.length}:${main.view.deliverables.map((d) => d.version).join(",")}`}
        >
          {main.stale ? (
            <p className="muted v6-reconnecting" role="status">
              Reconnecting… showing the last known state.
            </p>
          ) : null}
          <ObjectiveHeader objective={main.view.objective} somebodyNow={main.view.somebodyNow} />
          <div className="v6-columns">
            <div className="v6-column-primary">
              <Attention attention={main.view.attention} />
              <CurrentWork currentWork={main.view.currentWork} />
              <Activity items={main.view.activity} />
            </div>
            <div className="v6-column-rail">
              <Checkpoints progress={main.view.progress} />
              <Deliverables deliverables={main.view.deliverables} />
              <Acquisitions acquisitions={main.view.acquisitions} />
            </div>
          </div>
        </div>
      );
  }
}
