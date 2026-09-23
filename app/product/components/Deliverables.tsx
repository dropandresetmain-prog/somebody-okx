import type { DeliverableView } from "../contracts";
import { deliverableKind, presentDeliverableSummary } from "../humanize";
import { DELIVERABLE_STATUS_LABEL, deliverableTone } from "../presentation";

// Right-rail Deliverables (contract §24–28). Status is rendered exactly as
// supplied — "verified" is never inferred from version/Intern/Requirement
// state, and no frontend "highest version = current" rule is applied.
// Default view: kind/version, title, status, short description, next move.
// Remaining unknowns stay one click away.
export function Deliverables({ deliverables }: { deliverables: DeliverableView[] }) {
  if (deliverables.length === 0) {
    return (
      <section className="v6-rail-card" aria-label="Deliverables">
        <div className="v6-rail-card-head">
          <h3>Deliverables</h3>
          <span>None yet</span>
        </div>
        <p className="muted v6-rail-empty">Nothing produced yet.</p>
      </section>
    );
  }
  const emphasized = deliverables.filter((item) => item.status === "current" || item.status === "verified");
  const rest = deliverables.filter((item) => item.status !== "current" && item.status !== "verified");
  return (
    <section className="v6-rail-card" aria-label="Deliverables">
      <div className="v6-rail-card-head">
        <h3>Deliverables</h3>
        <span>{deliverables.length}</span>
      </div>
      <ul className="v6-deliverable-list">
        {[...emphasized, ...rest].map((deliverable) => (
          <DeliverableRow key={deliverable.id} deliverable={deliverable} />
        ))}
      </ul>
    </section>
  );
}

function DeliverableRow({ deliverable }: { deliverable: DeliverableView }) {
  const emphasized = deliverable.status === "current" || deliverable.status === "verified";
  // Openable only when there is somewhere to open it to: the main-column Final
  // Deliverable section mounts exactly this row's content when it is present.
  const openable = emphasized && Boolean(deliverable.content);
  const unknowns = deliverable.unknowns ?? [];
  return (
    <li
      className={`v6-deliverable${emphasized ? " v6-deliverable--emphasized" : ""}`}
      data-deliverable-id={deliverable.id}
      data-deliverable-status={deliverable.status}
    >
      <div className="v6-deliverable-head">
        <p className="v6-deliverable-kicker">
          {deliverableKind(deliverable.type)} · v{deliverable.version}
        </p>
        <span className={`pill tone-${deliverableTone(deliverable.status)}`}>{DELIVERABLE_STATUS_LABEL[deliverable.status]}</span>
      </div>
      <p className="v6-deliverable-title">
        {openable ? (
          <a href="#final-deliverable" className="v6-deliverable-title-link">
            {deliverable.title}
          </a>
        ) : (
          deliverable.title
        )}
      </p>
      {deliverable.summary ? (
        <p className="muted v6-deliverable-summary">{presentDeliverableSummary(deliverable.summary)}</p>
      ) : null}
      {deliverable.recommendedNextMove ? (
        <div className="v6-deliverable-next">
          <span>Next move</span>
          <p>{deliverable.recommendedNextMove}</p>
        </div>
      ) : null}
      {unknowns.length > 0 ? (
        <details className="v6-deliverable-unknowns-disclosure">
          <summary>
            {unknowns.length} remaining unknown{unknowns.length === 1 ? "" : "s"}
          </summary>
          <ul className="v6-deliverable-unknowns muted">
            {unknowns.map((unknown) => (
              <li key={unknown}>{unknown}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
