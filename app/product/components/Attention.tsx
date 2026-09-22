import type { AttentionState } from "../contracts";

// Attention — read-only this milestone (contract §33, task §16/§21). Renders
// only view.attention and only the actions it supplies, as disabled/labelled
// affordances. No mutation is ever wired here: there is no V6 Product Command
// adapter yet.
export function Attention({ attention }: { attention: AttentionState | null }) {
  if (!attention) return null;
  return (
    <section className="v6-attention" aria-label="Needs you" data-attention-id={attention.id} data-attention-type={attention.type}>
      <p className="kicker">Needs you</p>
      <p className="v6-attention-title">{attention.title}</p>
      <p className="v6-attention-detail muted">{attention.detail}</p>
      {attention.context?.reason ? <p className="muted">{attention.context.reason}</p> : null}
      {attention.context?.amount ? (
        <p className="v6-attention-amount">
          {attention.context.amount.amount} {attention.context.amount.currency}
        </p>
      ) : null}
      {attention.actions.length > 0 ? (
        <ul className="v6-attention-actions">
          {attention.actions.map((action) => (
            <li key={action.id}>
              <button type="button" className="button quiet" disabled data-attention-action-id={action.id} data-attention-action-type={action.type}>
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
