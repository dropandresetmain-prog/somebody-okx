import { DuoArt } from "../characters";
import type { AttentionActionView, AttentionState } from "../contracts";

export type AttentionActionHandler = (action: AttentionActionView) => void;

// Attention — renders view.attention and only the actions it supplies.
// Mutations stay in ProductWorkspace; this component stays presentational.
export function Attention({
  attention,
  onAction,
  pendingActionId,
  error,
  acknowledgement,
}: {
  attention: AttentionState | null;
  onAction?: AttentionActionHandler;
  pendingActionId?: string | null;
  error?: string | null;
  acknowledgement?: string | null;
}) {
  if (!attention) return null;
  const pending = Boolean(pendingActionId);
  return (
    <section
      className="v6-attention v6-right-attention"
      aria-label="Needs you"
      data-attention-id={attention.id}
      data-attention-type={attention.type}
      data-attention-pending={pending ? "true" : "false"}
    >
      <div className="v6-right-attention-copy">
        <p className="v6-event-type">Needs you</p>
        <p className="v6-attention-title">{attention.title}</p>
        <p className="v6-attention-detail">{attention.detail}</p>
        {attention.context?.reason ? <p className="muted">{attention.context.reason}</p> : null}
        {attention.context?.amount ? (
          <p className="v6-attention-amount">
            {attention.context.amount.amount} {attention.context.amount.currency}
          </p>
        ) : null}
        {attention.actions.length > 0 ? (
          <ul className="v6-attention-actions">
            {attention.actions.map((action) => {
              const isPending = pendingActionId === action.id;
              const disabled = !onAction || pending;
              return (
                <li key={action.id}>
                  <button
                    type="button"
                    className={action.type === "approve" ? "v6-approve" : "v6-secondary"}
                    disabled={disabled}
                    data-attention-action-id={action.id}
                    data-attention-action-type={action.type}
                    data-pending={isPending ? "true" : "false"}
                    onClick={() => {
                      if (!onAction || pending) return;
                      onAction(action);
                    }}
                  >
                    {isPending ? "Recording…" : action.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {acknowledgement ? (
          <p className="muted v6-attention-ack" role="status">
            {acknowledgement}
          </p>
        ) : null}
        {error ? (
          <p className="muted v6-attention-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="v6-right-attention-duo">
        <DuoArt pose="coffee" alt="Somebody waiting calmly while the Intern stays eager" />
      </div>
    </section>
  );
}
