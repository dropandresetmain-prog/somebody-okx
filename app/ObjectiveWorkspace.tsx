"use client";

// The current product entry point: the Objective workspace. A founder states
// an objective; Somebody validates the plan, decides MAKE, assembles an
// internal worker, and the worker executes with evidence-backed proof.
//
// Visual language (wordmark, mascot, status pills, "who has the ball") is
// reused from the inherited Mission Control surface via the shared components
// in ./somebody. The giant procurement component is NOT expanded; procurement
// semantics stay out of this file.

import {
  Component,
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ActivityEvent, ObjectiveRecord } from "@/lib/workforce";
import { Icon } from "./somebody/Icon";
import { Mascot } from "./somebody/Mascot";
import { cleanError, formatClock, type Tone } from "./somebody/presentation";
import { resolveResultDisplay, type CompletionField } from "./resultStatus";
import type { SourcingReason } from "@/lib/objective/types";

type NoticeState = { kind: "ok" | "error"; text: string } | null;

// Pure presentation helper: maps the PERSISTED sourcing shape to plan-section
// copy. It never re-decides MAKE/BUY/BLOCKED and never invents a field — a
// missing sourcing field renders as null. The decision and reason text always
// come from plan.sourcing (decided by lib/sourcing, adapted in
// lib/objective/sourcing.ts); this only labels what is already stored.
// Extracted for testability without React (see tests/ui.test.ts).
// The arrays arrived with M2, so objectives persisted before it legitimately
// lack them. `decision` and `reason` have always been stored; the new fields
// are read defensively so an existing row renders rather than throwing.
export function describeSourcing(sourcing: SourcingReason): {
  title: string;
  tone: Tone;
  whyLabel: string;
  missingLine: string | null;
  approvedLine: string | null;
  noApprovedLine: string | null;
} {
  const missing = sourcing.missing ?? [];
  const paths = sourcing.approvedProviderPaths ?? [];
  const missingLine =
    missing.length > 0 ? `Missing resources: ${missing.join(", ")}` : null;
  if (sourcing.decision === "MAKE") {
    return {
      title: "Make it in-house",
      tone: "viable",
      whyLabel: "WHY MAKE?",
      missingLine: null,
      approvedLine: null,
      noApprovedLine: null,
    };
  }
  if (sourcing.decision === "BUY") {
    return {
      title: "Buy",
      tone: "decision",
      whyLabel: "WHY BUY?",
      missingLine,
      approvedLine:
        paths.length > 0
          ? `Approved external path: ${paths
              .map((path) => `${path.pathId} (${path.forResourceClass})`)
              .join(", ")}`
          : null,
      noApprovedLine: null,
    };
  }
  return {
    title: "Blocked",
    tone: "ineligible",
    whyLabel: "WHY BLOCKED?",
    missingLine,
    approvedLine: null,
    noApprovedLine: "No approved external path is currently available.",
  };
}

// ── Shared bits (reused visual language) ────────────────────────────────────

function Wordmark() {
  return (
    <span className="wordmark" aria-label="Somebody">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="wordmark-avatar"
        src="/somebody-avatar.webp"
        alt=""
        width={28}
        height={28}
      />
      somebody<span className="wordmark-dot">.</span>
    </span>
  );
}

function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill tone-${tone}`}>{children}</span>;
}

function LivePill({ record }: { record: ObjectiveRecord }) {
  // The pill answers "who has the ball?" — Somebody (orange) or you (yellow).
  const live = record.run?.status === "running";
  const [label, tone]: [string, Tone] =
    record.state === "completed"
      ? ["Done and verified", "verified"]
      : record.state === "failed"
        ? ["Needs attention", "ineligible"]
        : record.state === "received"
          ? ["Waiting on you", "decision"]
          : [live ? "Somebody is working" : "Somebody is on it", "somebody"];
  return (
    <span className={`live-pill tone-${tone}`}>
      <i className={live ? "live-dot" : "still-dot"} />
      {label}
    </span>
  );
}

function SectionHead({
  kicker,
  title,
  aside,
}: {
  kicker: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <span className="kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {aside && <div className="section-aside">{aside}</div>}
    </div>
  );
}

function EventCopy({ kind }: { kind: ActivityEvent["kind"] }) {
  return {
    agent: { label: "Somebody", tone: "somebody" as Tone },
    evidence: { label: "New info", tone: "waiting" as Tone },
    decision: { label: "Decision", tone: "decision" as Tone },
    result: { label: "Result", tone: "verified" as Tone },
    system: { label: "Update", tone: "neutral" as Tone },
  }[kind];
}

function ActivityLog({ events }: { events: ActivityEvent[] }) {
  return (
    <aside className="activity">
      <SectionHead
        kicker="Activity"
        title="Everything, in order"
        aside={<span className="count">{events.length}</span>}
      />
      {events.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ol className="timeline">
          {events.slice(-24).reverse().map((event, index) => {
            const copy = EventCopy({ kind: event.kind });
            return (
              <li key={`${event.at}-${index}`} className={`tone-${copy.tone}`}>
                <i className="timeline-dot" />
                <div>
                  <span className="timeline-meta">
                    <strong>{copy.label}</strong> · {formatClock(event.at)}
                  </span>
                  <p title={event.text}>{event.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

// ── Composer: YOU ASKED ─────────────────────────────────────────────────────

function ObjectiveComposer({
  onSubmit,
  pending,
}: {
  onSubmit: (request: string) => Promise<void>;
  pending: string | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim() || pending) return;
    onSubmit(value);
  }
  return (
    <form className="composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="somebody-objective">
        What needs handling?
      </label>
      <textarea
        id="somebody-objective"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        rows={3}
        maxLength={2000}
        placeholder="State the objective — Somebody will plan it, decide how to source it, and do the work."
        required
        disabled={Boolean(pending)}
      />
      {error && <p className="composer-error">{error}</p>}
      <div className="composer-footer">
        <p className="composer-hint">
          e.g. “Evaluate whether Acme is a suitable partnership target for us.”
        </p>
        <button
          className="button primary"
          type="submit"
          disabled={!value.trim() || Boolean(pending)}
        >
          <Icon name="send" size={16} /> Give it to Somebody
        </button>
      </div>
    </form>
  );
}

// ── Plan section: SOMEBODY'S PLAN / WHY MAKE? ───────────────────────────────

function PlanSection({ record }: { record: ObjectiveRecord }) {
  const plan = record.plan;
  if (!plan) return null;
  // Display only: every string below comes from the persisted sourcing truth.
  const sourcing = describeSourcing(plan.sourcing);
  return (
    <section className="section" id="plan">
      <SectionHead
        kicker="Somebody's plan"
        title={sourcing.title}
        aside={<StatusPill tone={sourcing.tone}>{plan.sourcing.decision}</StatusPill>}
      />
      <div className="plan-grid">
        <div className="plan-card">
          <h3>{sourcing.whyLabel}</h3>
          <p>{plan.sourcing.reason}</p>
          {sourcing.missingLine && <p className="muted">{sourcing.missingLine}</p>}
          {sourcing.approvedLine && (
            <p className="muted">{sourcing.approvedLine}</p>
          )}
          {sourcing.noApprovedLine && (
            <p className="muted">{sourcing.noApprovedLine}</p>
          )}
          <p className="muted">
            Capabilities: {plan.validated.capabilityKeys.join(", ")}
          </p>
          {plan.validated.rejectedCapabilityKeys.length > 0 && (
            <p className="muted">
              Rejected (unknown to the catalog):{" "}
              {plan.validated.rejectedCapabilityKeys.join(", ")}
            </p>
          )}
          {plan.validated.deniedToolPermissions.length > 0 && (
            <p className="muted">
              Denied tool permissions:{" "}
              {plan.validated.deniedToolPermissions.join(", ")}
            </p>
          )}
        </div>
        <div className="plan-card">
          <h3>THE WORK</h3>
          <p>{record.workItems[0]?.assignment ?? plan.validated.responsibility}</p>
          <p className="muted">
            Proof: {record.workItems[0]?.contract.minObservations ?? 3}{" "}
            observations from{" "}
            {record.workItems[0]?.contract.requiredSourceClasses.join(" + ")}
          </p>
        </div>
      </div>
    </section>
  );
}

// ── THAT GUY: the assembled worker ──────────────────────────────────────────

function WorkerSection({ record }: { record: ObjectiveRecord }) {
  const workItem = record.workItems[0];
  if (!workItem) return null;
  const run = record.run;
  return (
    <section className="section" id="worker">
      <SectionHead
        kicker="That guy"
        title={workItem.title}
        aside={
          <StatusPill
            tone={
              workItem.state === "completed"
                ? "verified"
                : workItem.state === "failed"
                  ? "ineligible"
                  : "somebody"
            }
          >
            {workItem.state}
          </StatusPill>
        }
      />
      <div className="worker-card">
        <Mascot
          pose={run?.status === "running" ? "typing" : workItem.state === "completed" ? "done" : workItem.state === "failed" ? "stopped" : "reviewing"}
          size="md"
          live={run?.status === "running"}
        />
        <div className="worker-facts">
          <p className="muted">Worker: {workItem.workerKey}</p>
          {run && (
            <p className="muted">
              Model: <strong>{run.model}</strong> — {run.modelSelectionReason}
            </p>
          )}
          {run && run.toolCalls > 0 && (
            <p className="muted">Tool calls: {run.toolCalls}</p>
          )}
          {run?.summary && <p>{run.summary}</p>}
        </div>
      </div>
    </section>
  );
}

// ── EVIDENCE ────────────────────────────────────────────────────────────────

function EvidenceSection({
  evidence,
}: {
  evidence: { sourceClass: string; label: string; text: string; url?: string; recordRef?: string; observedAt: number }[];
}) {
  return (
    <section className="section" id="evidence">
      <SectionHead
        kicker="Evidence"
        title="What the worker actually saw"
        aside={<span className="count">{evidence.length}</span>}
      />
      {evidence.length === 0 ? (
        <p className="muted">No observations recorded yet.</p>
      ) : (
        <ul className="evidence-list">
          {evidence
            .slice()
            .reverse()
            .map((item, index) => (
              <li key={`${item.observedAt}-${index}`} className="evidence-item">
                <div className="evidence-meta">
                  <StatusPill
                    tone={item.sourceClass === "company_record" ? "decision" : "waiting"}
                  >
                    {item.sourceClass === "company_record" ? "internal record" : "public web"}
                  </StatusPill>
                  <span className="muted">{formatClock(item.observedAt)}</span>
                </div>
                <strong>{item.label}</strong>
                <blockquote title={item.text}>{item.text}</blockquote>
                {item.url && (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.url}
                  </a>
                )}
                {item.recordRef && <code>{item.recordRef}</code>}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

// ── RESULT ──────────────────────────────────────────────────────────────────

function ResultSection({
  record,
  completion,
}: {
  record: ObjectiveRecord;
  completion: CompletionField;
}) {
  const displayState = resolveResultDisplay(completion, Boolean(record.result));

  if (displayState.kind === "no_result") return null;

  if (displayState.kind === "not_accepted") {
    return (
      <section className="section" id="result">
        <SectionHead
          kicker="Result"
          title="The evaluation"
          aside={
            <StatusPill tone="ineligible">
              Not accepted
            </StatusPill>
          }
        />
        <div className="result-card">
          <p className="result-summary muted">
            The application has not accepted this result.
          </p>
          <div className="result-row">
            <span className="kicker">Unmet requirements</span>
            <ul>
              {displayState.unmet.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  // accepted
  const result = record.result!;
  return (
    <section className="section" id="result">
      <SectionHead
        kicker="Result"
        title="The evaluation"
        aside={
          <StatusPill tone="verified">
            Accepted
          </StatusPill>
        }
      />
      <div className="result-card">
        <p className="result-summary">{result.summary}</p>
        <div className="result-row">
          <span className="kicker">Fit</span>
          <p>{result.fit}</p>
        </div>
        <div className="result-row">
          <span className="kicker">Risks</span>
          <ul>
            {result.risks.map((risk, index) => (
              <li key={index}>{risk}</li>
            ))}
          </ul>
        </div>
        <div className="result-row">
          <span className="kicker">Unknowns</span>
          <ul>
            {result.unknowns.map((unknown, index) => (
              <li key={index}>{unknown}</li>
            ))}
          </ul>
        </div>
        <div className="result-row">
          <span className="kicker">Recommended next action</span>
          <p>{result.recommendedNextAction}</p>
        </div>
      </div>
    </section>
  );
}

// ── Workspace ───────────────────────────────────────────────────────────────

class ObjectiveErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <main className="state-page">
          <div className="state-card">
            <Mascot pose="stopped" size="md" />
            <span className="kicker">Connection interrupted</span>
            <h1>Somebody lost the thread.</h1>
            <p>
              {this.state.error.message ||
                "The workspace returned an unexpected error."}
            </p>
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        </main>
      );
    return this.props.children;
  }
}

function ObjectiveWorkspace() {
  const [activeKey, setActiveKey] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  // Read-only deep link: ?objective=<key> reopens an already-persisted
  // objective (e.g. for verification) without granting any new authority.
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("objective");
    if (key) setActiveKey(key);
  }, []);

  const view = useQuery(api.objectives.getObjective,
    activeKey ? { objectiveKey: activeKey } : "skip",
  ) as
    | {
        record: ObjectiveRecord;
        evidence: {
          sourceClass: string;
          label: string;
          text: string;
          url?: string;
          recordRef?: string;
          observedAt: number;
        }[];
        events: ActivityEvent[];
        completion: CompletionField;
      }
    | null
    | undefined;

  const submitObjective = useMutation(api.objectives.submitObjective);
  const requestServerPlan = useAction(api.objectives.planObjectiveFromModel);
  const startRun = useMutation(api.objectives.startRunPublic);

  const record = view?.record ?? null;

  // ── Flow actions ──────────────────────────────────────────────────────────
  async function handleSubmitObjective(request: string) {
    setPending("objective");
    setNotice(null);
    try {
      const { key } = await submitObjective({ request });
      setActiveKey(key);
      // Blocker D: the client does not author the plan. This action performs one
      // bounded model call server-side and returns the deterministic validation
      // decision; capabilities, resources and responsibility never come from
      // here. It is an action, not a mutation, because it calls the model.
      await requestServerPlan({ objectiveKey: key });
      await startRun({ objectiveKey: key });
      setNotice({ kind: "ok", text: "Objective accepted. Somebody is on it." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: cleanError(error instanceof Error ? error.message : String(error)),
      });
    } finally {
      setPending(null);
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!activeKey || !view) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="topbar-left">
            <Wordmark />
          </div>
          <div className="topbar-right">
            <span className="live-pill tone-neutral">
              <i className="still-dot" /> Nobody yet
            </span>
          </div>
        </header>
        <main className="page">
          <div className="objective-intro">
            <Mascot pose="idle" size="lg" live />
            <span className="kicker">Somebody has to do it. Now Somebody can.</span>
            <h1>What needs handling?</h1>
            <p className="muted">
              State the objective. Somebody plans it, decides whether to make it
              in-house, assembles the worker, and proves the work with evidence.
            </p>
          </div>
          <ObjectiveComposer
            onSubmit={handleSubmitObjective}
            pending={pending}
          />
          {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}
        </main>
      </div>
    );
  }

  // ── Workspace state ───────────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <Wordmark />
          <span className="crumb">{record?.request.slice(0, 60) ?? "Objective"}</span>
        </div>
        <div className="topbar-right">
          {record && <LivePill record={record} />}
        </div>
      </header>
      <main className="page">
        <div className="job-header">
          <div className="job-ask">
            <span className="kicker">YOU ASKED</span>
            <blockquote>{record?.request}</blockquote>
          </div>
          <div className="brief-facts">
            <dl className="fact">
              <dt>
                <Icon name="clock" size={14} /> Last update
              </dt>
              <dd>{record ? formatClock(record.updatedAt) : "—"}</dd>
            </dl>
            <dl className="fact">
              <dt>
                <Icon name="ledger" size={14} /> Spend authority
              </dt>
              {/* Spend stays None for every decision: M2 records an approved
                  provider path but never pays or calls a provider. The old copy
                  hard-coded "(MAKE)", which mislabelled BUY/BLOCKED rows. */}
              <dd>
                {record?.plan
                  ? `None — sourcing ${record.plan.sourcing.decision}`
                  : "None"}
              </dd>
            </dl>
          </div>
        </div>
        {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}
        <div className="columns">
          <div className="stack">
            {record && <PlanSection record={record} />}
            {record && <WorkerSection record={record} />}
            {view && <EvidenceSection evidence={view.evidence} />}
            {record && <ResultSection record={record} completion={view.completion} />}
          </div>
          {view && <ActivityLog events={view.events} />}
        </div>
      </main>
    </div>
  );
}

export function ObjectiveWorkspaceRoot() {
  return (
    <ObjectiveErrorBoundary>
      <ObjectiveWorkspace />
    </ObjectiveErrorBoundary>
  );
}
