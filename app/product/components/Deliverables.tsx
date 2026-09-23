import type { DeliverableView } from "../contracts";
import { DELIVERABLE_STATUS_LABEL, deliverableTone } from "../presentation";

// Right-rail Deliverables (contract §24–28). Status is rendered exactly as
// supplied — "verified" is never inferred from version/Intern/Requirement
// state, and no frontend "highest version = current" rule is applied.
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
        <span>{emphasized.some((item) => item.status === "verified") ? "Verified" : "Current"}</span>
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
  const unknowns = deliverable.unknowns ?? [];
  return (
    <li
      className={`v6-deliverable${emphasized ? " v6-deliverable--emphasized" : ""}`}
      data-deliverable-id={deliverable.id}
      data-deliverable-status={deliverable.status}
    >
      <p className="v6-deliverable-kicker">
        {deliverable.status === "verified" ? "Final deliverable" : "Working deliverable"} · v{deliverable.version}
      </p>
      <p className="v6-deliverable-title">{deliverable.title}</p>
      {deliverable.summary ? <p className="muted v6-deliverable-summary">{deliverable.summary}</p> : null}
      <span className={`pill tone-${deliverableTone(deliverable.status)}`}>{DELIVERABLE_STATUS_LABEL[deliverable.status]}</span>
      {deliverable.recommendedNextMove ? (
        <p className="muted v6-deliverable-next">Next: {deliverable.recommendedNextMove}</p>
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
