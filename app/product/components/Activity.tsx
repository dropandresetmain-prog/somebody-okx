import { Mascot } from "../../somebody/Mascot";
import { DuoArt, InternArt, InternFrame } from "../characters";
import type {
  AcquisitionView,
  ActivityItem,
  ArtifactChangedPayload,
  FindingPayload,
  IntegrationActivityPayload,
  InternAssignedPayload,
  ManagerDecisionConsideredOption,
  ManagerDecisionPayload,
  VerificationPayload,
  WorkSummaryPayload,
} from "../contracts";
import { INTEGRATION_LOGO_ALT, INTEGRATION_LOGO_SRC } from "../integrations";
import {
  actorName,
  decisionAttributionLabel,
  humanizeKey,
  internName,
  internRole,
  presentActivity,
  presentConsideredLabel,
  presentEvidenceLabel,
  presentOption,
} from "../humanize";
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
// System copy goes through ../humanize; work content renders as supplied.

// Presentation-only context derived from the supplied list (order untouched):
// the full receipt shows once per acquisition (on its latest event), and a
// finding whose text repeats an earlier one renders as a compact line.
type ActivityContext = {
  fullReceiptIds: Set<string>;
  repeatedFindingIds: Set<string>;
};

function activityContext(items: ActivityItem[]): ActivityContext {
  const lastByAcquisition = new Map<string, string>();
  const seenFindings = new Set<string>();
  const repeatedFindingIds = new Set<string>();
  // `items` is supplied newest-first for display; chronological semantics
  // ("last encountered" = latest, "seen before" = earlier) require walking
  // oldest→newest, so derive context from a reversed copy — the array used
  // for rendering is never touched.
  for (const item of [...items].reverse()) {
    if (item.related?.acquisitionId) lastByAcquisition.set(item.related.acquisitionId, item.id);
    if (item.type === "finding_added" && isFinding(item.payload)) {
      const text = item.payload.finding.trim();
      if (seenFindings.has(text)) repeatedFindingIds.add(item.id);
      seenFindings.add(text);
    }
  }
  return { fullReceiptIds: new Set(lastByAcquisition.values()), repeatedFindingIds };
}

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
  const context = activityContext(items);
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
          <ActivityEvent key={item.id} item={item} acquisitions={acquisitions} context={context} />
        ))}
      </ol>
    </section>
  );
}

function ActivityEvent({
  item,
  acquisitions,
  context,
}: {
  item: ActivityItem;
  acquisitions: AcquisitionView[];
  context: ActivityContext;
}) {
  const causal = Boolean(item.causedByActivityId);
  const classes = [
    "v6-event",
    "v6-activity-item",
    activityWeightClass(item.importance),
    activityEventClass(item.importance),
    causal ? "v6-event--causal" : "",
    verificationPassed(item) ? "v6-event--done" : "",
    item.type === "integration_activity" ? "v6-event--integration" : "",
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
      <EventBody item={item} acquisitions={acquisitions} context={context} />
    </li>
  );
}

function EventBody({
  item,
  acquisitions,
  context,
}: {
  item: ActivityItem;
  acquisitions: AcquisitionView[];
  context: ActivityContext;
}) {
  switch (item.type) {
    case "intern_assigned":
      return <DelegationEvent item={item} />;
    case "finding_added":
      return context.repeatedFindingIds.has(item.id) ? <RepeatedFindingEvent item={item} /> : <FindingEvent item={item} />;
    case "work_started":
    case "work_resumed":
      return <WorkNowEvent item={item} />;
    case "work_summary":
    case "work_completed":
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
      return <ReceiptEvent item={item} acquisitions={acquisitions} full={context.fullReceiptIds.has(item.id)} />;
    case "artifact_changed":
      return <DiffEvent item={item} />;
    case "verification_started":
    case "verification_completed":
    case "objective_completed":
      return <VerificationEvent item={item} />;
    case "integration_activity":
      return <IntegrationActivityEvent item={item} />;
    case "objective_interpreted":
    default:
      return <SomebodyEvent item={item} />;
  }
}

function SomebodyEvent({ item }: { item: ActivityItem }) {
  const display = presentActivity(item);
  return (
    <div className="v6-event-card">
      <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
      <p className="v6-event-title v6-activity-title">{display.title}</p>
      {display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
      {item.provenance ? (
        <div className="v6-event-footer">
          <ProvenanceTag provenance={item.provenance} />
        </div>
      ) : null}
    </div>
  );
}

// Dedicated visual treatment for an infrastructure moment (OKX Marketplace,
// OKX Agentic Wallet, OKX x402, X Layer Testnet). Renders ONLY what the
// backend supplied on the payload — never invents merchants, amounts, tx
// hashes, or a stronger lifecycle claim than the persisted fact. Required
// hierarchy (spec §5): [LOGO] Integration name / what it's doing / factual
// details.
function IntegrationActivityEvent({ item }: { item: ActivityItem }) {
  const payload = isIntegrationActivity(item.payload) ? item.payload : null;
  if (!payload) return <SomebodyEvent item={item} />;
  const { integration } = payload;
  return (
    <div className="v6-event-card v6-integration" data-integration-id={integration.id} data-integration-action={payload.action}>
      <div className="v6-integration-header">
        <img
          className="v6-integration-logo"
          src={INTEGRATION_LOGO_SRC[integration.logoKey]}
          alt={INTEGRATION_LOGO_ALT[integration.logoKey]}
        />
        <div>
          <p className="v6-integration-name">{integration.label}</p>
          <p className="v6-integration-action">{payload.headline}</p>
        </div>
      </div>
      {payload.detail ? <p className="v6-event-desc v6-integration-detail">{payload.detail}</p> : null}
      {payload.resourceNeed ? (
        <div className="v6-integration-field">
          <span>Need</span>
          <strong>{payload.resourceNeed}</strong>
        </div>
      ) : null}
      {payload.candidates && payload.candidates.length > 0 ? (
        <div className="v6-integration-candidates">
          <p className="v6-integration-candidates-count">
            {payload.candidateCount ?? payload.candidates.length} Testnet service
            {(payload.candidateCount ?? payload.candidates.length) === 1 ? "" : "s"} considered
          </p>
          <ul>
            {payload.candidates.map((candidate, index) => (
              <li key={`${candidate.label}:${index}`}>
                {candidate.label}
                {candidate.status ? <span className="v6-integration-candidate-status">{candidate.status}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {payload.merchantLabel || payload.amount || payload.networkLabel ? (
        <div className="v6-integration-fields">
          {payload.merchantLabel ? (
            <div className="v6-integration-field">
              <span>Merchant</span>
              <strong>{payload.merchantLabel}</strong>
            </div>
          ) : null}
          {payload.amount ? (
            <div className="v6-integration-field">
              <span>Amount</span>
              <strong>
                {payload.amount.amount} {payload.amount.currency}
              </strong>
            </div>
          ) : null}
          {payload.networkLabel ? (
            <div className="v6-integration-field">
              <span>Network</span>
              <strong>{payload.networkLabel}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
      {payload.txHash ? (
        <div className="v6-integration-field v6-integration-tx">
          <span>Transaction</span>
          {payload.explorerUrl ? (
            <a href={payload.explorerUrl} target="_blank" rel="noreferrer noopener">
              {shortenTxHash(payload.txHash)}
            </a>
          ) : (
            <strong>{shortenTxHash(payload.txHash)}</strong>
          )}
        </div>
      ) : null}
    </div>
  );
}

function shortenTxHash(hash: string): string {
  return hash.length <= 14 ? hash : `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function DelegationEvent({ item }: { item: ActivityItem }) {
  const payload = isInternAssigned(item.payload) ? item.payload : null;
  const intern = payload?.intern;
  const name = internName(intern?.label ?? (item.actor.kind === "intern" ? item.actor.label : undefined));
  const role = internRole(intern);
  const scope = payload?.scope ?? null;
  return (
    <div className="v6-event-card v6-delegation">
      <div className="v6-handoff-grid">
        <div className="v6-actor v6-actor--somebody">
          <Mascot pose="typing" size="sm" live={false} />
          <div>
            <p className="v6-actor-name">Somebody</p>
            <p className="v6-actor-role">Manager</p>
          </div>
        </div>
        <div className="v6-handoff-arrow" aria-hidden="true">
          →
        </div>
        <div className="v6-delegation-detail">
          <div className="v6-actor v6-actor--intern">
            <InternFrame alt={name} />
            <div>
              <p className="v6-actor-name">{name}</p>
              {role ? <p className="v6-actor-role">{role}</p> : null}
            </div>
          </div>
          <div className="v6-assignment">
            <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
            <h4 className="v6-activity-title">{payload?.assignmentTitle ?? item.detail ?? "New assignment"}</h4>
            {scope ? (
              scope.length > 140 ? (
                <details className="v6-assignment-brief">
                  <summary>Brief</summary>
                  <p>{scope}</p>
                </details>
              ) : (
                <p>{scope}</p>
              )
            ) : null}
            {payload?.authorityNote ? <small>{payload.authorityNote}</small> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingEvent({ item }: { item: ActivityItem }) {
  const payload = isFinding(item.payload) ? item.payload : null;
  const display = presentActivity(item);
  const actor = actorName(item.actor);
  const quote = payload?.finding ?? item.detail ?? item.title;
  const titleRepeatsQuote = display.title.replace(/^["“]|["”]$/g, "").trim() === quote.trim();
  // Evidence chips that only repeat the source line add nothing.
  const refs = (payload?.evidenceRefs ?? []).filter((ref) => ref.label.trim() !== item.title.trim());
  return (
    <div className="v6-event-card v6-finding">
      <div className="v6-intern-moment">
        <div>
          <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
          <p className="v6-finding-quote">“{quote}”</p>
          <p className="v6-finding-source">
            <span className="v6-activity-actor">{actor}</span>
            {!titleRepeatsQuote ? <> · {display.title}</> : null}
          </p>
          {refs.length > 0 ? (
            <ul className="v6-evidence-chips v6-evidence-row">
              {refs.map((ref) => (
                <li key={ref.id} className="v6-evidence-chip">
                  {presentEvidenceLabel(ref.label)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="v6-intern-moment-art">
          <InternArt alt={`${actor} presenting a finding`} />
        </div>
      </div>
    </div>
  );
}

// Identical finding text recorded again under a later assignment.
function RepeatedFindingEvent({ item }: { item: ActivityItem }) {
  const display = presentActivity(item);
  return (
    <div className="v6-event-card v6-compressed v6-finding-repeat">
      <div className="v6-compressed-line">
        <div>
          <strong className="v6-activity-title">
            {actorName(item.actor)} · {display.title}
          </strong>
          <span>Same finding as earlier</span>
        </div>
      </div>
    </div>
  );
}

function WorkNowEvent({ item }: { item: ActivityItem }) {
  const display = presentActivity(item);
  return (
    <div className="v6-event-card">
      <div className="v6-now-intern">
        <div>
          <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
          <p className="v6-event-title v6-activity-title">{display.title}</p>
          {display.meta ? <EventMeta label="Goal" value={display.meta} /> : null}
          {display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
          {item.provenance ? (
            <div className="v6-event-footer">
              <ProvenanceTag provenance={item.provenance} />
            </div>
          ) : null}
        </div>
        <DuoArt pose="working" alt="Somebody delegated work; Intern is actively doing it" />
      </div>
    </div>
  );
}

function CompressedWorkEvent({ item }: { item: ActivityItem }) {
  const payload = isWorkSummary(item.payload) ? item.payload : null;
  const display = presentActivity(item);
  return (
    <div className="v6-event-card v6-compressed">
      <div className="v6-compressed-line">
        <div>
          <strong className="v6-activity-title">{display.title}</strong>
          {display.detail ? <span>{display.detail}</span> : null}
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
  const display = presentActivity(item);
  return (
    <div className="v6-event-card v6-gap">
      <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
      <p className="v6-event-title v6-activity-title">{display.title}</p>
      {display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
    </div>
  );
}

function DecisionEvent({ item }: { item: ActivityItem }) {
  const payload = isDecision(item.payload) ? item.payload : null;
  const display = presentActivity(item);
  // A real sourcing comparison (more than one persisted option) gets the full
  // considered-market list + a separate Selected line; a single-option or
  // legacy decision keeps the original two-up grid unchanged.
  const isComparison = (payload?.considered?.length ?? 0) > 1;
  const attribution = payload ? decisionAttributionLabel(payload.selectionSource) : null;
  return (
    <div className="v6-event-card v6-decision">
      <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
      <p className="v6-event-title v6-activity-title">{display.title}</p>
      {display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
      {payload ? (
        <>
          {isComparison ? (
            <>
              <ConsideredOptions considered={payload.considered!} selectedOptionId={payload.selected.optionId} />
              <div className="v6-decision-selected-line">
                <span className="v6-decision-selected-label">Selected</span>
                <strong>
                  {APPROACH_LABEL[payload.selected.approach]} · {presentConsideredLabel(payload.selected)}
                </strong>
              </div>
            </>
          ) : (
            <div className="v6-decision-grid">
              {payload.alternative ? <DecisionOption option={payload.alternative} /> : null}
              <DecisionOption option={payload.selected} selected />
            </div>
          )}
          {attribution ? <p className="v6-decision-attribution">{attribution}</p> : null}
          {payload.reason ? (
            <details className="v6-decision-why">
              <summary>Why</summary>
              <p>{payload.reason}</p>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DecisionOption({
  option,
  selected = false,
}: {
  option: ManagerDecisionPayload["selected"];
  selected?: boolean;
}) {
  const display = presentOption(option);
  return (
    <div className={`v6-option${selected ? " is-selected" : ""}`}>
      {selected ? <span className="v6-selected-ribbon">Selected</span> : null}
      <p className="v6-option-label">{APPROACH_LABEL[option.approach]}</p>
      <strong>{display.label}</strong>
      {display.source ? <span className="v6-option-source">from {display.source}</span> : null}
    </div>
  );
}

// Every persisted option Somebody weighed — eligible and ineligible alike, so
// the founder can see the marketplace was actually checked, not just the pick.
function ConsideredOptions({
  considered,
  selectedOptionId,
}: {
  considered: ManagerDecisionConsideredOption[];
  selectedOptionId?: string;
}) {
  return (
    <ul className="v6-considered-list">
      {considered.map((option, index) => {
        const isSelected = Boolean(selectedOptionId) && option.optionId === selectedOptionId;
        const eligible = option.status === "eligible";
        return (
          <li
            key={option.optionId || index}
            className={`v6-considered-option v6-considered-option--${option.status}${isSelected ? " is-selected" : ""}`}
          >
            {isSelected ? <span className="v6-selected-ribbon">Selected</span> : null}
            <p className="v6-option-label">{option.approach ? APPROACH_LABEL[option.approach] : "Option"}</p>
            <strong>{presentConsideredLabel(option)}</strong>
            {option.providerLabel ? <span className="v6-option-source">{humanizeKey(option.providerLabel)}</span> : null}
            {option.amount ? (
              <span className="v6-considered-amount">
                {option.amount.amount} {option.amount.currency}
              </span>
            ) : null}
            <span className="v6-considered-status">
              {eligible ? "Eligible" : option.reason ? `Not suitable — ${option.reason}` : "Not suitable"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function InterruptEvent({ item }: { item: ActivityItem }) {
  const display = presentActivity(item);
  return (
    <div className="v6-event-card v6-interrupt">
      <div className="v6-interrupt-grid">
        <div>
          <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
          <h3 className="v6-activity-title">{display.title}</h3>
          {display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
          <div className="v6-event-footer">
            <span className="v6-tag v6-tag--attention">Waiting on you</span>
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

function ReceiptEvent({
  item,
  acquisitions,
  full,
}: {
  item: ActivityItem;
  acquisitions: AcquisitionView[];
  full: boolean;
}) {
  const acquisition = item.related?.acquisitionId
    ? acquisitions.find((entry) => entry.id === item.related?.acquisitionId)
    : undefined;
  const display = presentActivity(item);
  if (acquisition && !full) {
    // Earlier step of an acquisition whose full receipt appears on its latest event.
    return (
      <div className="v6-event-card v6-receipt v6-receipt--step">
        <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
        <p className="v6-event-title v6-activity-title">{display.title}</p>
        {item.provenance ? (
          <div className="v6-event-footer">
            <ProvenanceTag provenance={item.provenance} />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="v6-event-card v6-receipt">
      <div className="v6-receipt-top">
        <div>
          <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
          <p className="v6-event-title v6-activity-title">{display.title}</p>
          {!acquisition && display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
        </div>
        {acquisition?.amount ? (
          <div className="v6-receipt-amount">
            <strong>
              {acquisition.amount.amount} {acquisition.amount.currency}
            </strong>
            <span>Cost</span>
          </div>
        ) : null}
      </div>
      {acquisition ? (
        <div className="v6-receipt-grid">
          <div className="v6-receipt-cell">
            <span>Resource</span>
            {humanizeKey(acquisition.resourceLabel)}
          </div>
          {acquisition.providerLabel ? (
            <div className="v6-receipt-cell">
              <span>Provider</span>
              {humanizeKey(acquisition.providerLabel)}
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
  const display = presentActivity(item);
  return (
    <div className="v6-event-card v6-diff" data-deliverable-id={payload?.deliverableId}>
      <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
      <p className="v6-event-title v6-activity-title">{display.title}</p>
      {display.meta ? <p className="v6-event-meta">{display.meta}</p> : null}
      {display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
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
              {presentEvidenceLabel(ref.label)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function VerificationEvent({ item }: { item: ActivityItem }) {
  const payload = isVerification(item.payload) ? item.payload : null;
  const display = presentActivity(item);
  const passed = verificationPassed(item);
  const failed = payload?.checks.some((check) => check.status === "failed") ?? false;
  return (
    <div className="v6-event-card v6-verification">
      <div className="v6-verify-wrap">
        {passed ? (
          <div className="v6-stamp">
            Required
            <br />
            outcome
            <br />
            verified
          </div>
        ) : (
          <div className="v6-stamp v6-stamp--pending">{failed ? "Not yet" : "Checking"}</div>
        )}
        <div>
          <p className="v6-event-type">{activityTypeLabel(item.type)}</p>
          <p className="v6-event-title v6-activity-title">{display.title}</p>
          {display.detail ? <p className="v6-event-desc v6-activity-detail">{display.detail}</p> : null}
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
            <details className="v6-verification-unknowns-disclosure">
              <summary>
                {payload.remainingUnknowns.length} remaining unknown
                {payload.remainingUnknowns.length === 1 ? "" : "s"}
              </summary>
              <ul className="v6-verification-unknowns muted">
                {payload.remainingUnknowns.map((unknown) => (
                  <li key={unknown}>{unknown}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
        <InternArt className="v6-verify-intern" alt="Intern after the assignment" />
      </div>
    </div>
  );
}

function EventMeta({ label, value }: { label: string; value: string }) {
  return (
    <p className="v6-event-meta">
      <span>{label}</span> {value}
    </p>
  );
}

// The "verified" stamp needs a passed verification or a completed Objective —
// a completed-but-failed check never renders as verified.
function verificationPassed(item: ActivityItem): boolean {
  if (item.type === "objective_completed") return true;
  if (item.type !== "verification_completed") return false;
  const payload = isVerification(item.payload) ? item.payload : null;
  return Boolean(payload && payload.checks.length > 0 && payload.checks.every((check) => check.status === "passed"));
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

function isIntegrationActivity(payload: ActivityItem["payload"]): payload is IntegrationActivityPayload {
  return Boolean(payload && "integration" in payload && "action" in payload);
}
