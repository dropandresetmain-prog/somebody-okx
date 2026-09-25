import type { CheckpointView, ProgressView } from "../contracts";
import { CHECKPOINT_LABEL, checkpointDisplayLabel } from "../presentation";

// Right-rail Checkpoints (DESIGN.md §4, contract §12–13). Renders exactly the
// supplied checkpoints — no numeric progress, no Requirement inspection.
// Default view is checkpoint + state; definitions open on demand. A blocked
// checkpoint's detail always stays visible.
export function Checkpoints({ progress }: { progress: ProgressView }) {
  const completeCount = progress.checkpoints.filter((item) => item.state === "complete").length;
  const total = progress.checkpoints.length;
  // currentPhase usually repeats the active checkpoint's label; show it only when it adds something.
  const phase =
    progress.currentPhase && !progress.checkpoints.some((item) => item.label === progress.currentPhase)
      ? progress.currentPhase
      : null;

  return (
    <section className="v6-rail-card" aria-label="Checkpoints">
      <div className="v6-rail-card-head">
        <h3>Checkpoints</h3>
        {total > 0 ? (
          <span>
            {completeCount} / {total}
          </span>
        ) : (
          <span>None yet</span>
        )}
      </div>
      {phase ? <p className="v6-checkpoints-phase">{phase}</p> : null}
      {progress.checkpoints.length === 0 ? (
        <p className="muted v6-rail-empty">No checkpoints yet.</p>
      ) : (
        <ol className="v6-checkpoint-list">
          {progress.checkpoints.map((checkpoint) => (
            <li
              key={checkpoint.id}
              className={`v6-checkpoint v6-checkpoint--${checkpoint.state}`}
              data-checkpoint-id={checkpoint.id}
              data-checkpoint-state={checkpoint.state}
            >
              <div className="v6-cp-mark" aria-hidden="true">
                {checkpoint.state === "complete" ? "✓" : checkpoint.state === "blocked" ? "!" : checkpoint.state === "active" ? "•" : ""}
              </div>
              <div className="v6-checkpoint-copy">
                <CheckpointCopy checkpoint={checkpoint} />
              </div>
              <span className="v6-checkpoint-state muted">{CHECKPOINT_LABEL[checkpoint.state]}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CheckpointCopy({ checkpoint }: { checkpoint: CheckpointView }) {
  const { label, detail, state } = checkpoint;
  // Short action-phrase display label; the full backend label stays available
  // via title (and, when there's a definition disclosure, isn't lost either).
  const displayLabel = checkpointDisplayLabel(label);
  if (!detail) {
    return (
      <p className="v6-checkpoint-label" title={label}>
        {displayLabel}
      </p>
    );
  }
  if (state === "blocked") {
    return (
      <>
        <p className="v6-checkpoint-label" title={label}>
          {displayLabel}
        </p>
        <p className="v6-checkpoint-detail">{detail}</p>
      </>
    );
  }
  // The label is the disclosure: the definition opens under it on demand.
  return (
    <details className="v6-checkpoint-disclosure">
      <summary className="v6-checkpoint-label" title={label}>
        {displayLabel}
      </summary>
      <p className="v6-checkpoint-detail muted">{detail}</p>
    </details>
  );
}
