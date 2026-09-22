import { Mascot } from "../../somebody/Mascot";
import { DuoArt, InternArt, InternFrame } from "../characters";
import type {
  AcquisitionView,
  ActivityItem,
  ArtifactChangedPayload,
  FindingPayload,
  InternAssignedPayload,
  ManagerDecisionPayload,
  VerificationPayload,
  WorkSummaryPayload,
} from "../contracts";
import {
  ACQUISITION_STATUS_LABEL,
  activityEventClass,
  activityTypeLabel,
  activityWeightClass,
  APPROACH_LABEL,
} from "../presentation";

// Main-column Activity (DESIGN.md §3/§6, contract §19–23). Rendering is
// selected by ActivityItem.type only. Causality is shown only when
// causedByActivityId is supplied. Acquisition facts may be joined from a
// matching supplied AcquisitionView via related.acquisitionId — never invented.
export function Activity({
  items,
  acquisitions = [],
}: {
  items: ActivityItem[];
  acquisitions?: AcquisitionView[];
}) {
  if (items.length === 0) {
    return (
      <section className="v6-activity" aria-label="Activity">
        <div className="v6-section-head">
          <div>
            <h2>Activity</h2>
            <p>Meaningful moves. Not machine noise.</p>
          </div>
        </div>
        <p className="muted">No activity yet.</p>
      </section>
    );
  }
  return (
    <section className="v6-activity" aria-label="Activity">
      <div className="v6-section-head">
        <div>
          <h2>Activity</h2>
          <p>Meaningful moves. Not machine noise.</p>
        </div>
      </div>
      <ol className="v6-activity-list">
        {items.map((item) => (
          <ActivityEvent key={item.id} item={item} acquisitions={acquisitions} />
        ))}
      </ol>
    </section>
  );
}

function ActivityEvent({ item, acquisitions }: { item: ActivityItem; acquisitions: AcquisitionView[] }) {
  const causal = Boolean(item.causedByActivityId);
  const classes = [
    "v6-event",
    "v6-activity-item",
    activityWeightClass(item.importance),
    activityEventClass(item.importance),
    causal ? "v6-event--causal" : "",
    item.type === "verification_completed" || item.type === "objective_completed" ? "v6-event--done" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={classes}
      data-activity-id={item.id}
      data-activity-type={item.type}
      {...(item.causedByActivityId
        ? { "data-caused-by-activity-id": item.causedByActivityId, "data-caused-by-note": "true" }
        : {})}
    >
      <span className="v6-event-time" suppressHydrationWarning>
        {formatEventTime(item.occurredAt)}
      </span>
      <i className="v6-event-node" aria-hidden="true" />
      {item.causedByActivityId ? <span className="sr-only">Linked to an earlier event</span> : null}
      <EventBody item={item} acquisitions={acquisitions} />
    </li>
  );
}

function EventBody({ item, acquisitions }: { item: ActivityItem; acquisitions: AcquisitionView[] }) {
  switch (item.type) {
    case "intern_assigned":
      return <DelegationEvent item={item} />;
    case "finding_added":
      return <FindingEvent item={item} />;
    case "work_started":
    case "work_resumed":
      return <WorkNowEvent item={item} />;
    case "work_summary":
      return <CompressedWorkEvent item={item} />;
    case "evidence_gap_identified":
      return <EvidenceGapEvent item={item} />;
    case "manager_decision":
      return <DecisionEvent item={item} />;
    case "founder_action_required":
      return <InterruptEvent item={item} />;
    case "acquisition_started":
    case "acquisition_submitted":
    case "external_result_received":
    case "external_result_verified":
      return <ReceiptEvent item={item} acquisitions={acquisitions} />;
    case "artifact_changed":
      return <DiffEvent item={item} />;
    case "verification_started":
    case "verification_completed":
    case "objective_completed":
      return <VerificationEvent item={item} />;
    case "objective_interpreted":
    default:
      return <SomebodyEvent item={item} />;
  }
}

function SomebodyEvent({ item }: { item: ActivityItem }) {
  return (
    <div className="v6-event-card">
      <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
      <p className="v6-event-title v6-activity-title">
        <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
      </p>
      {item.detail ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
      <div className="v6-event-footer">
        <span className="v6-tag v6-tag--orange">Managerial interpretation</span>
        {item.provenance ? <ProvenanceTag provenance={item.provenance} /> : null}
      </div>
    </div>
  );
}

function DelegationEvent({ item }: { item: ActivityItem }) {
  const payload = isInternAssigned(item.payload) ? item.payload : null;
  const intern = payload?.intern;
  return (
    <div className="v6-event-card v6-delegation">
      <div className="v6-handoff-grid">
        <div className="v6-actor v6-actor--somebody">
          <Mascot pose="typing" size="sm" live={false} />
          <div>
            <p className="v6-actor-name">Somebody</p>
            <p className="v6-actor-role">Accountable manager</p>
          </div>
        </div>
        <div className="v6-handoff-arrow" aria-hidden="true">
          →
        </div>
        <div className="v6-delegation-detail">
          <div className="v6-actor v6-actor--intern">
            <InternFrame alt={intern ? intern.label : "Intern"} />
            <div>
              <p className="v6-actor-name">{intern?.label ?? internActorLabel(item)}</p>
              <p className="v6-actor-role">{intern?.specialty ?? "Intern"}</p>
            </div>
          </div>
          <div className="v6-assignment">
            <p className="v6-event-type">Delegated</p>
            <h4 className="v6-activity-title">{payload?.assignmentTitle ?? item.title}</h4>
            {payload?.scope || item.detail ? <p>{payload?.scope ?? item.detail}</p> : null}
            {payload?.authorityNote ? <small>{payload.authorityNote}</small> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingEvent({ item }: { item: ActivityItem }) {
  const payload = isFinding(item.payload) ? item.payload : null;
  const quote = payload?.finding ?? item.detail ?? item.title;
  return (
    <div className="v6-event-card v6-finding">
      <div className="v6-intern-moment">
        <div>
          <p className="v6-event-type">Finding</p>
          <p className="v6-finding-quote">“{quote}”</p>
          {item.detail && payload ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
          <p className="v6-activity-title">
            <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
          </p>
          {payload?.evidenceRefs && payload.evidenceRefs.length > 0 ? (
            <ul className="v6-evidence-chips v6-evidence-row">
              {payload.evidenceRefs.map((ref) => (
                <li key={ref.id} className="v6-evidence-chip">
                  {ref.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="v6-intern-moment-art">
          <InternArt alt={`${item.actor.label} presenting a finding`} />
        </div>
      </div>
    </div>
  );
}

function WorkNowEvent({ item }: { item: ActivityItem }) {
  return (
    <div className="v6-event-card">
      <div className="v6-now-intern">
        <div>
          <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
          <p className="v6-event-title v6-activity-title">
            <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
          </p>
          {item.detail ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
          <div className="v6-event-footer">
            <span className="v6-tag v6-tag--orange">Intern working</span>
            {item.provenance ? <ProvenanceTag provenance={item.provenance} /> : null}
          </div>
        </div>
        <DuoArt pose="working" alt="Somebody delegated work; Intern is actively doing it" />
      </div>
    </div>
  );
}

function CompressedWorkEvent({ item }: { item: ActivityItem }) {
  const payload = isWorkSummary(item.payload) ? item.payload : null;
  return (
    <div className="v6-event-card v6-compressed">
      <div className="v6-compressed-line">
        <div>
          <strong className="v6-activity-title">{item.title}</strong>
          {payload?.summary || item.detail ? <span>{payload?.summary ?? item.detail}</span> : null}
        </div>
        {payload?.actionCount !== undefined ? (
          <span className="v6-event-toggle">
            {payload.actionCount} action{payload.actionCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceGapEvent({ item }: { item: ActivityItem }) {
  return (
    <div className="v6-event-card v6-gap">
      <p className="v6-event-type">Evidence gap</p>
      <p className="v6-event-title v6-activity-title">
        <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
      </p>
      {item.detail ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
      <div className="v6-event-footer">
        <span className="v6-tag">Somebody identified missing proof</span>
      </div>
    </div>
  );
}

function DecisionEvent({ item }: { item: ActivityItem }) {
  const payload = isDecision(item.payload) ? item.payload : null;
  return (
    <div className="v6-event-card v6-decision">
      <p className="v6-event-type">Managerial decision</p>
      <p className="v6-event-title v6-activity-title">
        <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
      </p>
      {item.detail && !payload ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
      {payload ? (
        <>
          <div className="v6-decision-grid">
            {payload.alternative ? (
              <div className="v6-option">
                <p className="v6-option-label">{APPROACH_LABEL[payload.alternative.approach]}</p>
                <strong>{payload.alternative.label}</strong>
              </div>
            ) : null}
            <div className="v6-option is-selected">
              <span className="v6-selected-ribbon">Selected</span>
              <p className="v6-option-label">{APPROACH_LABEL[payload.selected.approach]}</p>
              <strong>{payload.selected.label}</strong>
            </div>
          </div>
          {payload.reason ? (
            <p className="v6-decision-reason">
              <strong>Why:</strong> {payload.reason}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function InterruptEvent({ item }: { item: ActivityItem }) {
  return (
    <div className="v6-event-card v6-interrupt">
      <div className="v6-interrupt-grid">
        <div>
          <p className="v6-event-type">Somebody needs your say</p>
          <h3 className="v6-activity-title">{item.title}</h3>
          {item.detail ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
          <div className="v6-event-footer">
            <span className="v6-tag v6-tag--attention">Authority required</span>
            {item.provenance ? <ProvenanceTag provenance={item.provenance} /> : null}
          </div>
        </div>
        <div className="v6-interrupt-intern">
          <InternArt alt="Intern waiting for input" />
        </div>
      </div>
    </div>
  );
}

function ReceiptEvent({ item, acquisitions }: { item: ActivityItem; acquisitions: AcquisitionView[] }) {
  const acquisition = item.related?.acquisitionId
    ? acquisitions.find((entry) => entry.id === item.related?.acquisitionId)
    : undefined;
  return (
    <div className="v6-event-card v6-receipt">
      <div className="v6-receipt-top">
        <div>
          <p className="v6-event-type">External capability</p>
          <p className="v6-event-title v6-activity-title">
            <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
          </p>
          {item.detail ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
        </div>
        {acquisition?.amount ? (
          <div className="v6-receipt-amount">
            <strong>
              {acquisition.amount.amount} {acquisition.amount.currency}
            </strong>
            <span>supplied amount</span>
          </div>
        ) : null}
      </div>
      {acquisition ? (
        <div className="v6-receipt-grid">
          <div className="v6-receipt-cell">
            <span>Resource</span>
            {acquisition.resourceLabel}
          </div>
          {acquisition.providerLabel ? (
            <div className="v6-receipt-cell">
              <span>Provider</span>
              {acquisition.providerLabel}
            </div>
          ) : null}
          <div className="v6-receipt-cell">
            <span>Status</span>
            {ACQUISITION_STATUS_LABEL[acquisition.status]}
          </div>
        </div>
      ) : null}
      {acquisition?.resultSummary ? <p className="v6-event-desc">{acquisition.resultSummary}</p> : null}
      {acquisition?.provenance || item.provenance ? (
        <p className="v6-truth-note">
          <ProvenanceTag provenance={acquisition?.provenance ?? item.provenance!} />
        </p>
      ) : null}
      {acquisition?.transaction ? (
        <p className="muted v6-acquisition-transaction" data-transaction-status={acquisition.transaction.status}>
          {acquisition.transaction.label}
        </p>
      ) : null}
    </div>
  );
}

function DiffEvent({ item }: { item: ActivityItem }) {
  const payload = isArtifactChanged(item.payload) ? item.payload : null;
  return (
    <div className="v6-event-card v6-diff" data-deliverable-id={payload?.deliverableId}>
      <p className="v6-event-type">Artifact changed</p>
      <p className="v6-event-title v6-activity-title">
        <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
      </p>
      {payload?.changeSummary ? <p className="v6-event-desc">{payload.changeSummary}</p> : item.detail ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
      {payload && (payload.before !== undefined || payload.after !== undefined) ? (
        <div className="v6-diff-grid v6-artifact-diff">
          <div className="v6-diff-side v6-artifact-diff-before">
            <span className="eyebrow">Before</span>
            <del>{payload.before ?? "—"}</del>
          </div>
          <div className="v6-diff-arrow" aria-hidden="true">
            →
          </div>
          <div className="v6-diff-side is-after v6-artifact-diff-after">
            <span className="eyebrow">After</span>
            <strong>{payload.after}</strong>
          </div>
        </div>
      ) : null}
      {payload?.evidenceRefs && payload.evidenceRefs.length > 0 ? (
        <ul className="v6-evidence-chips v6-evidence-row">
          {payload.evidenceRefs.map((ref) => (
            <li key={ref.id} className="v6-evidence-chip">
              {ref.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function VerificationEvent({ item }: { item: ActivityItem }) {
  const payload = isVerification(item.payload) ? item.payload : null;
  const completed = item.type === "verification_completed" || item.type === "objective_completed";
  return (
    <div className="v6-event-card v6-verification">
      <div className="v6-verify-wrap">
        {completed ? (
          <div className="v6-stamp">
            Required
            <br />
            outcome
            <br />
            verified
          </div>
        ) : (
          <div className="v6-stamp v6-stamp--pending">Checking</div>
        )}
        <div>
          <p className="v6-event-type">Verification</p>
          <p className="v6-event-title v6-activity-title">
            <span className="v6-activity-actor muted">{item.actor.label}</span> {item.title}
          </p>
          {item.detail ? <p className="v6-event-desc v6-activity-detail">{item.detail}</p> : null}
          {payload ? (
            <ul className="v6-verify-list v6-verification-checks">
              {payload.checks.map((check) => (
                <li key={check.label} className={`v6-verify-item v6-verification-check v6-verification-check--${check.status}`}>
                  {check.label}
                </li>
              ))}
            </ul>
          ) : null}
          {payload?.remainingUnknowns && payload.remainingUnknowns.length > 0 ? (
            <ul className="v6-verification-unknowns muted">
              {payload.remainingUnknowns.map((unknown) => (
                <li key={unknown}>{unknown}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <InternArt className="v6-verify-intern" alt="Intern after the assignment" />
      </div>
    </div>
  );
}

function ProvenanceTag({ provenance }: { provenance: NonNullable<ActivityItem["provenance"]> }) {
  return <span className={`v6-tag pill tone-neutral v6-activity-provenance`}>{provenanceLabel(provenance)}</span>;
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

function formatEventTime(occurredAt: number): string {
  const date = new Date(occurredAt);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function internActorLabel(item: ActivityItem): string {
  return item.actor.kind === "intern" ? item.actor.label : "Intern";
}

function isInternAssigned(payload: ActivityItem["payload"]): payload is InternAssignedPayload {
  return Boolean(payload && "assignmentTitle" in payload && "intern" in payload);
}

function isFinding(payload: ActivityItem["payload"]): payload is FindingPayload {
  return Boolean(payload && "finding" in payload);
}

function isDecision(payload: ActivityItem["payload"]): payload is ManagerDecisionPayload {
  return Boolean(payload && "selected" in payload);
}

function isWorkSummary(payload: ActivityItem["payload"]): payload is WorkSummaryPayload {
  return Boolean(payload && "summary" in payload && !("finding" in payload) && !("changeSummary" in payload));
}

function isArtifactChanged(payload: ActivityItem["payload"]): payload is ArtifactChangedPayload {
  return Boolean(payload && "changeSummary" in payload && "deliverableId" in payload);
}

function isVerification(payload: ActivityItem["payload"]): payload is VerificationPayload {
  return Boolean(payload && "checks" in payload);
}
