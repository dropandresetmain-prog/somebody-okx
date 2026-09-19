import type { ObjectiveWorkspaceView } from "./workspace";
import { StateLabel } from "./MissionControl";
import { Mascot } from "../somebody/Mascot";
import { Icon } from "../somebody/Icon";

export function CompanyField({ view }: { view: ObjectiveWorkspaceView }) {
  return <section className="mc-company" aria-labelledby="company-title">
    <div className="mc-section-heading"><h2 id="company-title">The company for this Objective</h2><span>Assembled around the work</span></div>
    <div className={`mc-company-world ${view.external.length ? "has-external" : ""}`}>
      <div className="mc-company-inside"><span className="mc-section-label"><Icon name="lock" size={12} /> Inside your company</span>
        <div className="mc-manager"><Mascot pose={view.somebodyNow.condition === "verified" ? "done" : "reviewing"} size="sm" /><div><h3>Somebody</h3><p>Manages the outcome. Owns the next move.</p></div></div>
        <div className="mc-workers">{view.workers.map(worker => {
          const assignments = view.assignments.filter(a => a.workerKey === worker.workerKey);
          const latest = assignments.at(-1);
          return <article className="mc-worker" key={worker.workerKey} data-active={latest?.state === "running"}>
            <div className="mc-worker-top"><span className="mc-worker-symbol"><Icon name="laptop" size={18} /></span><span className="mc-section-label">That Guy</span><span className="mc-staffing">{worker.staffing.outcome.toUpperCase()}</span></div>
            <h3>{worker.displayName}</h3><p>{worker.responsibility}</p>
            <div className="mc-worker-status"><StateLabel value={worker.lifecycle} /><span>{latest?.state === "running" ? "Bounded work in progress" : latest?.state === "result_submitted" ? "Worker finished · proof pending" : "No run in progress"}</span></div>
            {latest && <div className="mc-assignment-line"><span>Assignment</span><StateLabel value={latest.state} /></div>}
            <details><summary>Why this That Guy?</summary><p>{worker.staffing.reason}</p>{worker.verifiedHistory.map((item, index) => <p key={index} className="mc-history-proof"><Icon name="check" size={12} />{item}</p>)}<p>{worker.reservedForAssignmentId ? "Reserved for the current assignment; not available for another run." : "No active reservation."}</p>
              {assignments.map(a => <div className="mc-assignment-detail" key={a.assignmentId}><strong>{view.requirements.find(r => r.requirementKey === a.requirementKey)?.title}</strong><StateLabel value={a.state} />{a.resultSummary && <p>{a.resultSummary}</p>}</div>)}
            </details>
          </article>;
        })}{!view.workers.length && <p className="mc-empty">No That Guy assigned. Missing authority is not solved by creating another worker.</p>}</div>
      </div>
      {view.external.length > 0 && <div className="mc-company-outside"><span className="mc-section-label"><Icon name="globe" size={12} /> Somebody Else</span><p className="mc-boundary-label">Outside your company</p>{view.external.map(provider => <article className="mc-provider" key={provider.providerId}>
        <div className="mc-provider-symbol"><Icon name="globe" size={22} /></div><h3>{provider.name}</h3><p>{provider.resource}</p><StateLabel value={provider.payment.state} /><small>{provider.intent ? "One authorized acquisition" : "Recommendation only · not authorized"}</small>
        <details><summary>Provider boundary</summary><p>{provider.boundaryNote}</p><p>Payment status does not imply Requirement satisfaction.</p></details>
      </article>)}</div>}
    </div>
  </section>;
}
