import { Mascot } from "../somebody/Mascot";
import type { StartCapabilitiesView } from "../product/contracts";

// /start — capability-gated composer shell (task §17). Creation has no legal
// command this milestone, so canCreateObjective is (truthfully) always false
// right now; this view never fakes submission and never calls a setup or
// legacy create mutation. Controls for context/attachments/advanced only
// render when their StartCapabilitiesView flag is true.
export function StartView({ capabilities }: { capabilities: StartCapabilitiesView | null }) {
  const loaded = capabilities !== null;
  const canCreate = capabilities?.canCreateObjective ?? false;

  return (
    <div className="v6-start">
      <div className="v6-start-hero">
        <Mascot pose="typing" size="lg" />
        <p className="kicker">Start</p>
        <h1>Give Somebody an objective</h1>
        <p className="muted">Say what you need done. Somebody turns it into an outcome that can be proved.</p>
      </div>

      <div className="v6-start-composer" data-can-create={canCreate ? "true" : "false"}>
        <label htmlFor="v6-start-request">Objective</label>
        <textarea id="v6-start-request" rows={5} disabled placeholder="What do you need Somebody to do?" />

        {capabilities?.supportsContextRefs ? <div className="v6-start-field">Context</div> : null}
        {capabilities?.supportsAttachments ? <div className="v6-start-field">Attachments</div> : null}
        {capabilities?.advanced.spendLimit ? <div className="v6-start-field">Spend limit</div> : null}
        {capabilities?.advanced.deadline ? <div className="v6-start-field">Deadline</div> : null}
        {capabilities?.advanced.externalEffectPolicy ? <div className="v6-start-field">External effect policy</div> : null}

        <button type="button" className="button primary large" disabled data-start-submit="true">
          Start objective
        </button>

        <p className="muted v6-start-note" role="status">
          {loaded
            ? "Starting a new objective isn't available yet in this milestone."
            : "Checking what's available…"}
        </p>
      </div>
    </div>
  );
}
