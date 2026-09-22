import { DuoArt } from "../product/characters";
import type { StartCapabilitiesView } from "../product/contracts";

// /start — capability-gated composer shell. Creation has no legal command
// this milestone, so canCreateObjective is (truthfully) false; this view never
// fakes submission. Unsupported controls stay hidden. The composer still
// looks like the approved V6 start state, not an engineering-disabled form.
export function StartView({ capabilities }: { capabilities: StartCapabilitiesView | null }) {
  const loaded = capabilities !== null;
  const canCreate = capabilities?.canCreateObjective ?? false;
  const showContext = Boolean(capabilities?.supportsContextRefs);
  const showAttachments = Boolean(capabilities?.supportsAttachments);
  const showSpend = Boolean(capabilities?.advanced.spendLimit);
  const showDeadline = Boolean(capabilities?.advanced.deadline);
  const showPolicy = Boolean(capabilities?.advanced.externalEffectPolicy);
  const showAdvanced = showSpend || showDeadline || showPolicy;
  const showTools = showContext || showAttachments;

  return (
    <div className="v6-start">
      <div className="v6-start-hero">
        <div className="v6-start-hero-art">
          <DuoArt
            pose="working"
            className="v6-start-hero-duo"
            alt="Somebody working while the Intern eagerly brings ideas"
          />
        </div>
        <p className="v6-objective-kicker">New objective</p>
        <h1>Give Somebody an objective</h1>
        <p>Describe the result you want. Add context, files or limits only when they matter.</p>
      </div>

      <div className="v6-start-composer" data-can-create={canCreate ? "true" : "false"}>
        <label className="sr-only" htmlFor="v6-start-request">
          Objective
        </label>
        <textarea
          id="v6-start-request"
          rows={5}
          disabled={!canCreate}
          placeholder="Our launch messaging isn’t working. Figure out what’s wrong and get a better relaunch ready…"
        />
        <div className="v6-composer-bar">
          {showTools ? (
            <div className="v6-composer-tools">
              {showContext ? <div className="v6-tool-btn v6-start-field">Context</div> : null}
              {showAttachments ? <div className="v6-tool-btn v6-start-field">Attachments</div> : null}
            </div>
          ) : (
            <div />
          )}
          <button type="button" className="v6-send-btn" disabled data-start-submit="true">
            Start objective →
          </button>
        </div>
        {showAdvanced ? (
          <div className="v6-advanced">
            {showSpend ? (
              <div className="v6-advanced-card v6-start-field">
                <span>Spending authority</span>
                <strong>Spend limit</strong>
              </div>
            ) : null}
            {showDeadline ? (
              <div className="v6-advanced-card v6-start-field">
                <span>Deadline</span>
                <strong>Deadline</strong>
              </div>
            ) : null}
            {showPolicy ? (
              <div className="v6-advanced-card v6-start-field">
                <span>External effects</span>
                <strong>External effect policy</strong>
              </div>
            ) : null}
          </div>
        ) : null}
        <p className="muted v6-start-note" role="status">
          {loaded ? "Starting a new objective isn’t available yet." : "Checking what’s available…"}
        </p>
      </div>

      <div className="v6-empty-zones">
        <div className="v6-empty-zone">
          <strong>Activity</strong>
          <span>Meaningful moves will appear here once Somebody starts managing the objective.</span>
        </div>
        <div className="v6-empty-zone">
          <strong>Deliverable</strong>
          <span>Nothing to show yet. Output appears when there is something real to review.</span>
        </div>
      </div>
    </div>
  );
}
