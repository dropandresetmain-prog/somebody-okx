import type { ReactNode } from "react";
import type { ObjectiveWorkspaceView } from "./workspace";
import { Mascot } from "../somebody/Mascot";
import { Icon } from "../somebody/Icon";

export function StateLabel({ value }: { value: string }) {
  return <span className={`mc-state mc-state-${value}`}>{value.replaceAll("_", " ")}</span>;
}

export function MissionControl({ view, objectiveNavigation, controls, company, attention, story, inspection }: {
  view: ObjectiveWorkspaceView;
  objectiveNavigation: ReactNode;
  controls: ReactNode;
  company?: ReactNode;
  attention?: ReactNode;
  story?: ReactNode;
  inspection?: ReactNode;
}) {
  const now = view.somebodyNow;
  const current = view.requirements.find(r => r.requirementKey === now.currentRequirementKey);
  const pose = now.condition === "verified" ? "done" : now.condition === "needs_you" ? "presenting" : now.condition === "blocked" ? "stopped" : now.condition === "waiting" ? "waiting" : "typing";
  return <div className="mc-root">
    <a className="mc-skip" href="#mission">Skip to mission</a>
    <header className="mc-topbar">
      <a className="wordmark" href="/m5" aria-label="Somebody mission control"><img className="wordmark-avatar" src="/somebody-avatar.webp" width="28" height="28" alt="" />somebody<span className="wordmark-dot">.</span></a>
      <span className="mc-product-label">Your company, in motion</span>
      <span className="mc-fixture-label"><i />Fixture workspace · not live</span>
    </header>
    <div className="mc-layout">
      <aside className="mc-objective-rail" aria-label="Objectives and outcome">
        <div className="mc-section-label">Your objectives <span>03</span></div>
        {objectiveNavigation}
        <section className="mc-outcome" aria-labelledby="outcome-title">
          <span className="mc-section-label">Outcome contract</span>
          <h2 id="outcome-title">Done means.</h2>
          {view.outcome ? <>
            <p>{view.outcome.intent}</p>
            <span className="mc-contract-revision">Contract revision {view.outcome.revision}</span>
            <ol className="mc-levels">{view.outcome.levels.map(level => <li key={level.levelKey} data-state={level.status}>
              <div className="mc-level-bar" />
              <div className="mc-level-heading"><strong>{level.label}</strong><StateLabel value={level.status} /></div>
              <p>{level.statement}</p>
              {level.levelKey === view.outcome!.minimumCompletionBar && <small><Icon name="lock" size={12} /> Minimum completion bar</small>}
            </li>)}</ol>
          </> : <p>Somebody is interpreting the Objective. No Outcome Contract has been accepted yet.</p>}
        </section>
        <p className="mc-rail-note">The Objective creates demand.<br />Somebody assembles the company.</p>
      </aside>
      <main id="mission" className="mc-main" tabIndex={-1}>
        <div className="mc-main-heading"><div><span className="mc-section-label">Objective / Mission control</span><h1>{view.objective.title}</h1><p className="mc-request">“{view.objective.request}”</p></div><StateLabel value={view.objective.state} /></div>
        <section className={`mc-now mc-now-${now.condition}`} aria-labelledby="somebody-now-title">
          <Mascot pose={pose} size="md" />
          <div><span className="mc-section-label">Somebody now</span><h2 id="somebody-now-title">{now.headline}</h2><p>{now.detail}</p></div>
          <span className="mc-ball"><i />Ball with <strong>{now.ball}</strong></span>
        </section>
        {current && <section className="mc-current" aria-label="Current Requirement"><span className="mc-section-label">Current requirement</span><div><strong>{current.title}</strong><p>{current.mustBeTrue}</p></div><StateLabel value={current.state} /></section>}
        {company ?? <section className="mc-company-placeholder"><span className="mc-section-label">Inside your company</span><div className="mc-manager"><Mascot pose={pose} size="md" /><div><h3>Somebody</h3><p>Accountable for the Objective</p></div></div><p>{view.workers.length ? `${view.workers.length} persistent That Guy in this Objective’s workspace.` : "No worker assigned. Somebody does not assemble capacity before it is needed."}</p></section>}
        <section className="mc-requirements" aria-labelledby="requirements-title"><div className="mc-section-heading"><h2 id="requirements-title">What has to be true</h2><span>Proof, not a task count</span></div>
          {view.requirements.length ? <ul>{view.requirements.map(r => <li key={r.requirementKey} className={r.requirementKey === now.currentRequirementKey ? "mc-requirement-current" : ""}>
            <span className={`mc-proof-mark ${r.state === "satisfied" ? "is-proved" : ""}`}><Icon name={r.state === "satisfied" ? "check" : r.state === "blocked" ? "lock" : "clock"} size={15} /></span><div><strong>{r.title}</strong><small>{r.priority === "required" ? "Required for completion" : "Supporting · not the completion bar"}</small></div><StateLabel value={r.state} />
          </li>)}</ul> : <p className="mc-empty">Requirements will follow the Outcome Contract. Nothing is invented in advance.</p>}
        </section>
        {story}
      </main>
      <aside className="mc-context-rail" aria-label="Founder attention and mission context">
        {attention ?? <section className="mc-context-note"><span className="mc-section-label">Who has the ball?</span><h2>{now.ball}</h2><p>{now.detail}</p></section>}
        {controls}
        {inspection}
        <p className="mc-fixture-note">Contract-faithful frontend fixtures. No live model, Convex, provider calls or payments. Current runtime does not emit this whole story end to end.</p>
      </aside>
    </div>
  </div>;
}
