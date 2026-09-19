import type { ObjectiveWorkspaceView, MissionStoryEvent } from "./workspace";
import { StateLabel } from "./MissionControl";
import { Icon } from "../somebody/Icon";

const clock = (at: number) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(at);
const stages = ["prepared", "awaiting_approval", "approved", "payment_attempted", "submitted", "settled", "result_received", "verified"] as const;

function ProofLinks({ refs, view }: { refs: string[]; view: ObjectiveWorkspaceView }) {
  return <ul className="mc-proof-links">{refs.map(ref => <li key={ref}><a href={`#${ref}`}><Icon name="document" size={12} />{view.evidence.find(e => e.evidenceId === ref)?.label ?? ref}</a></li>)}</ul>;
}

export function EvidenceInspector({ view }: { view: ObjectiveWorkspaceView }) {
  return <section className="mc-evidence" aria-labelledby="evidence-title"><div className="mc-section-heading"><h2 id="evidence-title">The proof</h2><span>{view.evidence.length} records</span></div>
    {!view.evidence.length && <p className="mc-empty">No evidence yet. Absence of proof is not success.</p>}
    {view.evidence.map(evidence => <article id={evidence.evidenceId} key={evidence.evidenceId} className="mc-evidence-item"><div><Icon name={evidence.state === "verified" ? "check" : "document"} size={15} /><strong>{evidence.label}</strong></div><StateLabel value={evidence.state} /><details><summary>Inspect evidence</summary><p>{evidence.summary}</p><dl><dt>Origin</dt><dd>{evidence.origin.replaceAll("_", " ")} · fixture</dd><dt>Observed</dt><dd>{clock(evidence.observedAt)} UTC</dd><dt>Requirement</dt><dd>{view.requirements.find(r => r.requirementKey === evidence.requirementKey)?.title}</dd></dl></details></article>)}
    {view.artifacts.map(artifact => <article className="mc-artifact" key={artifact.artifactId} id={artifact.artifactId}><span className="mc-section-label">Company artifact</span><h3>{artifact.label}</h3><span className="mc-version">Version {artifact.versions.at(-1)?.version}</span><p>{artifact.versions.at(-1)?.summary}</p><details><summary>Inspect revision history</summary>{artifact.versions.map(version => <div key={version.id} className="mc-revision"><strong>v{version.version} · {clock(version.at)} UTC</strong><p>{version.summary}</p><span className="mc-section-label">Explicit evidence references</span><ProofLinks refs={version.evidenceRefs} view={view} /></div>)}</details></article>)}
  </section>;
}

export function AcquisitionProgress({ view }: { view: ObjectiveWorkspaceView }) {
  return <>{view.external.map(external => <section key={external.providerId} className="mc-acquisition" aria-label={`${external.name} acquisition lifecycle`}>
    <div className="mc-section-heading"><h2>One bounded acquisition</h2><StateLabel value={external.payment.state} /></div><p>{external.name} · {external.resource} · up to ${external.payment.maximumUsd.toFixed(2)} <span className="mc-inline-fixture">fixture</span></p>
    <ol className="mc-payment-stages">{stages.map(stage => {
      const recorded = external.payment.history.find(event => event.state === stage);
      const current = stage === external.payment.state;
      return <li key={stage} data-recorded={Boolean(recorded)} aria-current={current ? "step" : undefined}><span>{recorded ? <Icon name={current ? "clock" : "check"} size={12} /> : <i />}</span><strong>{stage.replaceAll("_", " ")}</strong><small>{recorded ? `${clock(recorded.at)} UTC` : "Not reached"}</small></li>;
    })}</ol><details><summary>Acquisition boundary</summary><p>{external.boundaryNote}</p><p>Generic intent: {external.intent ? external.intent.state.replaceAll("_", " ") : "not authorized"}. Payment and provider evidence are separate records. Settled does not mean result received; result received does not mean verified.</p></details>
  </section>)}</>;
}

export function CompletionSummary({ view }: { view: ObjectiveWorkspaceView }) {
  if (!view.completion.accepted) return <p className="mc-completion-pending"><Icon name="lock" size={13} />Completion is a separate verdict. {view.completion.summary}</p>;
  return <section className="mc-completion" aria-labelledby="completion-title"><span className="mc-section-label"><Icon name="check" size={15} /> Independent completion verdict · fixture</span><h2 id="completion-title">Required outcome. Verified.</h2><p>{view.completion.summary}</p><ProofLinks refs={view.completion.proofRefs} view={view} /><div className="mc-remaining"><strong>Still pending / outside scope</strong><ul>{view.completion.remaining.map(item => <li key={item}>{item}</li>)}</ul></div></section>;
}

export function MissionStory({ view }: { view: ObjectiveWorkspaceView }) {
  const labels = new Map([
    [view.objective.objectiveKey, view.objective.title],
    ...(view.outcome ? [[view.outcome.contractId, "Outcome Contract"]] : []),
    ...view.requirements.map(r => [r.requirementKey, r.title]),
    ...view.workers.map(w => [w.workerKey, w.displayName]),
    ...view.assignments.map(a => [a.assignmentId, `Assignment · ${view.requirements.find(r => r.requirementKey === a.requirementKey)?.title}`]),
    ...view.decisions.map(d => [d.decisionId, d.summary]),
    ...view.external.flatMap(e => [[e.providerId, e.name], ...(e.intent ? [[e.intent.intentId, `Acquisition · ${e.name}`]] : [])]),
    ...view.artifacts.map(a => [a.artifactId, a.label]),
    ...view.evidence.map(e => [e.evidenceId, e.label]),
  ].map(([key, value]) => [key, value] as const));
  function events(items: MissionStoryEvent[]) {
    return <ol className="mc-story-events">{items.map(event => <li key={event.id}><span className={`mc-story-mark mc-story-${event.kind}`}><Icon name={event.kind === "verification" || event.kind === "completion" ? "check" : event.kind === "approval" ? "hand" : event.kind === "artifact" ? "document" : "arrow"} size={13} /></span><div><div className="mc-event-heading"><strong>{event.title}</strong><time dateTime={new Date(event.at).toISOString()}>{clock(event.at)} UTC</time></div><p>{event.detail}</p><details><summary>Related records · {event.relatedIds.length}</summary><ul>{event.relatedIds.map(id => <li key={id}>{labels.get(id) ?? id}</li>)}</ul><small>Explicit record references. Order does not imply causality.</small></details></div></li>)}</ol>;
  }
  const latest = view.missionStory.slice(-4).reverse();
  const earlier = view.missionStory.slice(0, -4).reverse();
  return <section className="mc-story" aria-labelledby="story-title"><div className="mc-section-heading"><h2 id="story-title">Mission Story</h2><span>Meaningful moves. Not machine noise.</span></div>{events(latest)}{earlier.length > 0 && <details className="mc-earlier"><summary>Earlier in this mission · {earlier.length} events</summary>{events(earlier)}</details>}</section>;
}
