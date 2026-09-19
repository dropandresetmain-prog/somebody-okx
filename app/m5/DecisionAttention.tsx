import type { ObjectiveWorkspaceView, OptionView } from "./workspace";
import { StateLabel } from "./MissionControl";
import { Icon } from "../somebody/Icon";

function OptionFacts({ option, fixture }: { option: OptionView; fixture: boolean }) {
  return <div className="mc-option"><div><span className="mc-strategy">{option.strategy}</span><strong>{option.label}</strong><StateLabel value={option.eligibility} /></div><p>{option.reason}</p><dl>{option.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}<small>{fact.provenance.replaceAll("_", " ")}{fixture ? " · fixture" : ""}</small></dd></div>)}</dl></div>;
}

export function Decisions({ view }: { view: ObjectiveWorkspaceView }) {
  const current = view.decisions.findLast(d => d.requirementKey === view.somebodyNow.currentRequirementKey) ?? view.decisions.at(-1);
  if (!current) return null;
  const selected = current.options.find(o => o.optionId === current.selectedOptionId);
  const alternatives = current.options.filter(o => o.optionId !== current.selectedOptionId);
  return <section className="mc-decisions" aria-labelledby="decision-title"><div className="mc-section-heading"><h2 id="decision-title">Somebody’s call</h2><StateLabel value={current.authorization} /></div>
    <div className="mc-decision-summary"><span className="mc-strategy mc-strategy-chosen">{current.strategy.replaceAll("_", " ")}</span><h3>{current.summary}</h3></div><p>{current.rationale}</p>
    {selected && <details className="mc-options"><summary>Inspect recommended option · {selected.label}</summary><OptionFacts option={selected} fixture={view.provenance === "frontend_fixture"} /></details>}
    {alternatives.length > 0 && <details className="mc-options"><summary>{alternatives.length} alternatives considered · MAKE / BUY / HYBRID</summary>{alternatives.map(option => <OptionFacts key={option.optionId} option={option} fixture={view.provenance === "frontend_fixture"} />)}</details>}
    {view.decisions.length > 1 && <details className="mc-options"><summary>Earlier management decisions</summary>{view.decisions.filter(d => d.decisionId !== current.decisionId).map(d => <div key={d.decisionId} className="mc-option"><strong>{d.strategy} · {d.summary}</strong><p>{d.rationale}</p></div>)}</details>}
  </section>;
}

export function NeedsYou({ view, onApprove }: { view: ObjectiveWorkspaceView; onApprove?: () => void }) {
  return <section className="mc-attention" aria-labelledby="attention-title">
    <span className="mc-section-label" id="attention-title">Needs you <span>{view.attention.length ? `0${view.attention.length}` : "Clear"}</span></span>
    {view.attention.length ? view.attention.map(item => <article key={item.id} className={`mc-attention-item mc-attention-${item.kind}`}>
      <span className="mc-attention-symbol"><Icon name={item.kind === "approval" ? "hand" : "lock"} size={22} /></span><h2>{item.title}</h2><p>{item.detail}</p>
      {item.maximumUsd !== null && <div className="mc-spend"><strong>${item.maximumUsd.toFixed(2)}</strong><span>maximum · one acquisition<br />{view.provenance === "frontend_fixture" ? "illustrative fixture amount" : "persisted backend bound"}</span></div>}
      {item.kind === "approval" && onApprove ? <button className="button primary" onClick={onApprove}>Simulate: {item.requestedAction}<Icon name="arrow" size={15} /></button> : <div className="mc-requested-action"><strong>Your next action</strong><p>{item.requestedAction}</p></div>}
      <small>{item.kind === "approval" ? (view.provenance === "frontend_fixture" ? "Fixture approval only. No money moves." : "Approval is recorded through the supervised path. No payment executes from this surface.") : "Paused safely. No automatic retries or invented authority."}</small>
    </article>) : <div className="mc-attention-clear"><Icon name="check" size={18} /><div><strong>You can stay out of the weeds.</strong><p>No founder action is required in this snapshot.</p></div></div>}
  </section>;
}
