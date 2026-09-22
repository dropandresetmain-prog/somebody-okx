import { Icon } from "../../somebody/Icon";
import type {
  ActivityItem,
  ArtifactChangedPayload,
  FindingPayload,
  InternAssignedPayload,
  ManagerDecisionPayload,
  VerificationPayload,
  WorkSummaryPayload,
} from "../contracts";
import { activityIcon, activityWeightClass, APPROACH_LABEL } from "../presentation";

// Main-column Activity (DESIGN.md §3/§6, contract §19–23) — the primary V6
// differentiator. Switches on ActivityItem.type only; never reconstructs,
// reorders, or infers causality beyond an explicitly supplied
// causedByActivityId. Renders the supplied product list order as-is.
export function Activity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <section className="v6-activity" aria-label="Activity">
        <p className="kicker">Activity</p>
        <p className="muted">No activity yet.</p>
      </section>
    );
  }
  return (
    <section className="v6-activity" aria-label="Activity">
      <p className="kicker">Activity</p>
      <ol className="v6-activity-list">
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </ol>
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <li
      className={`v6-activity-item ${activityWeightClass(item.importance)}`}
      data-activity-id={item.id}
      data-activity-type={item.type}
      {...(item.causedByActivityId ? { "data-caused-by-activity-id": item.causedByActivityId } : {})}
    >
      <span className="v6-activity-icon icon-button" aria-hidden="true">
        <Icon name={activityIcon(item.type)} size={16} />
      </span>
      <div className="v6-activity-body">
        <p className="v6-activity-title">
          <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
        </p>
        {item.detail ? <p className="v6-activity-detail muted">{item.detail}</p> : null}
        {item.provenance ? <span className={`pill tone-neutral v6-activity-provenance`}>{provenanceLabel(item.provenance)}</span> : null}
        {item.causedByActivityId ? (
          <p className="v6-activity-caused-by muted" data-caused-by-note="true">
            Continues from an earlier linked event
          </p>
        ) : null}
        <ActivityPayload item={item} />
      </div>
    </li>
  );
}

function provenanceLabel(provenance: NonNullable<ActivityItem["provenance"]>): string {
  switch (provenance) {
    case "live":
      return "Live";
    case "simulation":
      return "Simulation";
    case "recorded_replay":
      return "Recorded replay";
  }
}

function ActivityPayload({ item }: { item: ActivityItem }) {
  if (!item.payload) return null;
  switch (item.type) {
    case "intern_assigned":
      return <InternAssignedCard payload={item.payload as InternAssignedPayload} />;
    case "finding_added":
      return <FindingCard payload={item.payload as FindingPayload} />;
    case "manager_decision":
      return <ManagerDecisionCard payload={item.payload as ManagerDecisionPayload} />;
    case "work_summary":
      return <WorkSummaryCard payload={item.payload as WorkSummaryPayload} />;
    case "artifact_changed":
      return <ArtifactChangedCard payload={item.payload as ArtifactChangedPayload} />;
    case "verification_completed":
      return <VerificationCard payload={item.payload as VerificationPayload} />;
    default:
      return null;
  }
}

function InternAssignedCard({ payload }: { payload: InternAssignedPayload }) {
  return (
    <div className="v6-activity-payload v6-payload-handoff">
      <p>
        Somebody <span aria-hidden="true">→</span> {payload.intern.label}: {payload.assignmentTitle}
      </p>
      {payload.scope ? <p className="muted">{payload.scope}</p> : null}
      {payload.authorityNote ? <p className="muted">{payload.authorityNote}</p> : null}
    </div>
  );
}

function FindingCard({ payload }: { payload: FindingPayload }) {
  return (
    <div className="v6-activity-payload v6-payload-finding">
      <p>{payload.finding}</p>
      {payload.evidenceRefs && payload.evidenceRefs.length > 0 ? (
        <ul className="v6-evidence-chips">
          {payload.evidenceRefs.map((ref) => (
            <li key={ref.id} className="pill tone-unknown">
              {ref.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ManagerDecisionCard({ payload }: { payload: ManagerDecisionPayload }) {
  return (
    <div className="v6-activity-payload v6-payload-decision">
      <div className="v6-decision-selected">
        <span className="pill tone-somebody">{APPROACH_LABEL[payload.selected.approach]}</span>
        <span>{payload.selected.label}</span>
      </div>
      {payload.alternative ? (
        <div className="v6-decision-alternative muted">
          <span>vs</span> {APPROACH_LABEL[payload.alternative.approach]} — {payload.alternative.label}
        </div>
      ) : null}
      {payload.reason ? <p className="muted">{payload.reason}</p> : null}
    </div>
  );
}

function WorkSummaryCard({ payload }: { payload: WorkSummaryPayload }) {
  return (
    <div className="v6-activity-payload v6-payload-summary">
      <p>{payload.summary}</p>
      {payload.actionCount !== undefined ? <p className="muted">{payload.actionCount} action{payload.actionCount === 1 ? "" : "s"}</p> : null}
    </div>
  );
}

function ArtifactChangedCard({ payload }: { payload: ArtifactChangedPayload }) {
  return (
    <div className="v6-activity-payload v6-payload-artifact" data-deliverable-id={payload.deliverableId}>
      <p>{payload.changeSummary}</p>
      {payload.before !== undefined || payload.after !== undefined ? (
        <div className="v6-artifact-diff">
          <div className="v6-artifact-diff-before">
            <p className="muted eyebrow">Before</p>
            <p>{payload.before ?? "—"}</p>
          </div>
          <div className="v6-artifact-diff-after">
            <p className="muted eyebrow">After</p>
            <p>{payload.after}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VerificationCard({ payload }: { payload: VerificationPayload }) {
  return (
    <div className="v6-activity-payload v6-payload-verification">
      <ul className="v6-verification-checks">
        {payload.checks.map((check) => (
          <li key={check.label} className={`v6-verification-check v6-verification-check--${check.status}`}>
            {check.label}
          </li>
        ))}
      </ul>
      {payload.remainingUnknowns && payload.remainingUnknowns.length > 0 ? (
        <ul className="v6-verification-unknowns muted">
          {payload.remainingUnknowns.map((unknown) => (
            <li key={unknown}>{unknown}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
