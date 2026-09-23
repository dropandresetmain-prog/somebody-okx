import type { DeliverableView, ObjectiveView, SomebodyNowView } from "../contracts";
import { deliverableKind, presentSomebodyNow } from "../humanize";

// Main-column "Final deliverable" (post-founder-live-run Incident #2): when an
// Objective is completed, the governed final artifact must be unmistakable,
// not buried in the right-rail Deliverables card. Renders ONLY when
// objective.status === "completed", and ONLY the current accepted deliverable
// — verified first, falling back to current — never a superseded or draft
// version. Reads straight from the supplied `deliverables` prop; no second
// source of truth, no frontend re-derivation of artifact authority.
export function FinalDeliverable({
  objective,
  somebodyNow,
  deliverables,
}: {
  objective: ObjectiveView;
  somebodyNow: SomebodyNowView;
  deliverables: DeliverableView[];
}) {
  if (objective.status !== "completed") return null;

  // Verified is the governed, checked outcome; "current" is the fallback for
  // the rare case where completion landed without a matching assessment yet.
  // Draft and superseded artifacts are never eligible here.
  const selected = deliverables.find((item) => item.status === "verified") ?? deliverables.find((item) => item.status === "current");
  if (!selected) return null;

  // Same copy the top-of-page Somebody Now card uses — never a second wording
  // of "what finished".
  const display = presentSomebodyNow(somebodyNow, deliverables);

  return (
    <section
      id="final-deliverable"
      className="v6-final-deliverable"
      aria-label="Final deliverable"
      data-deliverable-id={selected.id}
      data-deliverable-status={selected.status}
    >
      <div className="v6-final-deliverable-head">
        <p className="v6-final-deliverable-kicker">Final deliverable</p>
        <h2 className="v6-final-deliverable-title">{selected.title}</h2>
        <p className="v6-final-deliverable-meta">
          {deliverableKind(selected.type)} · v{selected.version}
        </p>
      </div>
      {display.detail ? <p className="v6-final-deliverable-summary">{display.detail}</p> : null}
      {selected.content ? (
        <div className="v6-final-deliverable-content">
          <pre>{selected.content}</pre>
        </div>
      ) : (
        <p className="muted v6-final-deliverable-empty">No stored content for this deliverable.</p>
      )}
    </section>
  );
}
