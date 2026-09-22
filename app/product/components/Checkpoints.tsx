import type { ProgressView } from "../contracts";
import { CHECKPOINT_LABEL, checkpointTone } from "../presentation";

// Right-rail Checkpoints (DESIGN.md §4, contract §12–13). Renders exactly the
// supplied checkpoints — no numeric progress, no Requirement inspection.
export function Checkpoints({ progress }: { progress: ProgressView }) {
  return (
    <section className="v6-rail-card" aria-label="Checkpoints">
      <p className="kicker">Checkpoints</p>
      {progress.currentPhase ? <p className="v6-checkpoints-phase">{progress.currentPhase}</p> : null}
      {progress.checkpoints.length === 0 ? (
        <p className="muted">No checkpoints yet.</p>
      ) : (
        <ol className="v6-checkpoint-list">
          {progress.checkpoints.map((checkpoint) => (
            <li
              key={checkpoint.id}
              className={`v6-checkpoint v6-checkpoint--${checkpoint.state}`}
              data-checkpoint-id={checkpoint.id}
              data-checkpoint-state={checkpoint.state}
            >
              <span className={`dot tone-${checkpointTone(checkpoint.state)}`} aria-hidden="true" />
              <div className="v6-checkpoint-copy">
                <p className="v6-checkpoint-label">{checkpoint.label}</p>
                {checkpoint.detail ? <p className="v6-checkpoint-detail muted">{checkpoint.detail}</p> : null}
              </div>
              <span className="v6-checkpoint-state muted">{CHECKPOINT_LABEL[checkpoint.state]}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
