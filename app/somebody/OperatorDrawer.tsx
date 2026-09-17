"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Command, Mission } from "../../lib/procurement/types";
import { CHANNEL_ICON, Icon } from "./Icon";
import { effectCopy, formatMoney } from "./presentation";

type Send = (command: Command, label?: string) => Promise<void>;

// Operator drawer: environment facts, the live-agent resume control and the
// Development fixture controls. Deliberately outside the product surface so it
// never reads as a Somebody feature during a demo. See DESIGN.md → "Operator layer".
export function OperatorDrawer({
  mission,
  liveAiEnabled,
  deployment,
  pending,
  send,
}: {
  mission: Mission | null;
  liveAiEnabled: boolean;
  deployment: string;
  pending: string | null;
  send: Send;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "Escape") setOpen(false);
      if (event.key === "`") setOpen((value) => !value);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        className="operator-toggle"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        title="Demo controls (`)"
      >
        <Icon name="sliders" size={15} />
        <span>Demo controls</span>
      </button>
      {open && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <aside
            className="operator-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Demo controls"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <span className="kicker">Operator only</span>
                <h2>Demo controls</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="Close demo controls"
              >
                <Icon name="close" />
              </button>
            </header>
            <dl className="env-facts">
              <div>
                <dt>Environment</dt>
                <dd>Development · {deployment}</dd>
              </div>
              <div>
                <dt>Worker</dt>
                <dd>
                  {liveAiEnabled
                    ? `Live AI${mission?.run ? ` · ${mission.run.model}` : ""}`
                    : "Live AI off · fixture controls only"}
                </dd>
              </div>
              {mission && (
                <>
                  <div>
                    <dt>Job key</dt>
                    <dd className="mono">{mission.key}</dd>
                  </div>
                  <div>
                    <dt>Workflow</dt>
                    <dd className="mono">
                      {mission.state} · evidence v{mission.evidenceVersion}
                      {mission.run &&
                        ` · run ${mission.run.status}, ${mission.run.toolCalls} tools`}
                    </dd>
                  </div>
                  {mission.run?.summary && (
                    <div className="wide">
                      <dt>Last run</dt>
                      <dd>{mission.run.summary}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
            <p className="fixture-warning">
              Vendor replies and accounting effects are Development fixtures.
              These controls persist Development data; they do not call external
              providers.
            </p>
            {mission ? (
              <FixtureControls
                mission={mission}
                liveAiEnabled={liveAiEnabled}
                pending={pending}
                send={send}
              />
            ) : (
              <p className="muted">Create a job to see fixture controls.</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function FixtureControls({
  mission,
  liveAiEnabled,
  pending,
  send,
}: {
  mission: Mission;
  liveAiEnabled: boolean;
  pending: string | null;
  send: Send;
}) {
  const outreachVendors = useMemo(
    () => mission.vendors.filter((vendor) => vendor.channel !== "Web"),
    [mission.vendors],
  );
  const [clarifyVendor, setClarifyVendor] = useState(
    outreachVendors[0]?.id ?? "",
  );
  const [clarification, setClarification] = useState(
    "Please confirm the delivery date, landed cost, stock, and branding requirement.",
  );
  const eligible = useMemo(
    () => mission.vendors.filter((v) => v.evaluation.status === "eligible"),
    [mission.vendors],
  );
  const [recommendVendor, setRecommendVendor] = useState(
    mission.ranking.topVendorId ?? eligible[0]?.id ?? "",
  );
  const [rationale, setRationale] = useState(
    "Best current fit across delivery, budget, availability, and branding constraints.",
  );
  const executable = mission.effects.filter((e) => e.status === "pending");
  const verifiable = mission.effects.filter(
    (e) => e.status === "attempted" || e.status === "unverified",
  );
  const waitingOnHuman =
    ["awaiting_approval", "complete", "blocked"].includes(mission.state) ||
    mission.noViableOption !== null;
  const busy = Boolean(pending);
  return (
    <div className="control-stack">
      <ControlGroup
        title="Worker"
        text="Ask the live model to read persisted state and choose its next tool."
      >
        <button
          className="button primary small"
          disabled={busy || !liveAiEnabled || waitingOnHuman}
          onClick={() => void send({ type: "run_agent" }, "run agent")}
        >
          {pending === "run agent"
            ? "Starting…"
            : mission.run?.status === "running"
              ? "Check / resume Somebody"
              : "Resume Somebody"}
        </button>
        {!liveAiEnabled && (
          <small className="disabled-note">
            Set <code>LIVE_AI_ENABLED=true</code> on Development to run the
            live worker.
          </small>
        )}
      </ControlGroup>
      <ControlGroup
        title="Request quotes"
        text="Records deterministic sourcing intents. Evidence arrives separately."
      >
        <div className="button-row">
          {mission.vendors.map((vendor) => (
            <button
              className="button quiet small"
              disabled={busy}
              key={vendor.id}
              onClick={() =>
                void send(
                  { type: "request_quote", vendorId: vendor.id },
                  `request ${vendor.name}`,
                )
              }
            >
              <Icon name={CHANNEL_ICON[vendor.channel]} size={14} />
              {vendor.name}
            </button>
          ))}
        </div>
      </ControlGroup>
      <ControlGroup
        title="Deliver vendor replies"
        text="Fixture observations through the same ingest contract real adapters use."
      >
        <div className="button-row">
          {outreachVendors.map((vendor) => (
            <button
              className="button quiet small"
              disabled={busy}
              key={`obs-${vendor.id}`}
              onClick={() =>
                void send(
                  {
                    type: "ingest_fixture_observation",
                    vendorId: vendor.id,
                    stage: "initial",
                  },
                  `observe ${vendor.name}`,
                )
              }
            >
              Reply · {vendor.name}
            </button>
          ))}
        </div>
      </ControlGroup>
      <ControlGroup
        title="Change reality"
        text="A later authoritative update. History is kept; stale claims are superseded."
      >
        <div className="button-row">
          {outreachVendors.map((vendor) => (
            <button
              className="button quiet small"
              disabled={busy}
              key={`upd-${vendor.id}`}
              onClick={() =>
                void send(
                  {
                    type: "ingest_fixture_observation",
                    vendorId: vendor.id,
                    stage: "update",
                  },
                  `update ${vendor.name}`,
                )
              }
            >
              Update · {vendor.name}
            </button>
          ))}
        </div>
      </ControlGroup>
      <form
        className="control-group"
        onSubmit={(event) => {
          event.preventDefault();
          void send(
            { type: "clarify_quote", vendorId: clarifyVendor, question: clarification },
            "clarify quote",
          );
        }}
      >
        <h3>Follow up on a quote</h3>
        <div className="control-fields">
          <label>
            Vendor
            <select
              value={clarifyVendor}
              onChange={(event) => setClarifyVendor(event.target.value)}
            >
              {outreachVendors.map((vendor) => (
                <option value={vendor.id} key={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Question
            <input
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
              required
            />
          </label>
        </div>
        <div className="button-row">
          <button className="button quiet small" disabled={busy || !clarifyVendor}>
            Queue follow-up
          </button>
          <button
            className="button quiet small"
            type="button"
            disabled={busy || !clarifyVendor}
            onClick={() =>
              void send(
                {
                  type: "ingest_fixture_observation",
                  vendorId: clarifyVendor,
                  stage: "clarification",
                },
                "observe clarification",
              )
            }
          >
            Deliver follow-up reply
          </button>
        </div>
      </form>
      <form
        className="control-group"
        onSubmit={(event) => {
          event.preventDefault();
          void send(
            { type: "recommend", vendorId: recommendVendor, rationale },
            "create recommendation",
          );
        }}
      >
        <h3>Recommend</h3>
        <p>Only vendors the domain layer marks eligible and top-ranked are accepted.</p>
        <div className="control-fields">
          <label>
            Eligible vendor
            <select
              value={recommendVendor}
              onChange={(event) => setRecommendVendor(event.target.value)}
              required
            >
              <option value="">Choose…</option>
              {eligible.map((vendor) => (
                <option value={vendor.id} key={vendor.id}>
                  {vendor.name} · {formatMoney(vendor.evaluation.totalCents)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rationale
            <input
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              required
            />
          </label>
        </div>
        <div className="button-row">
          <button className="button quiet small" disabled={busy || !recommendVendor}>
            Recommend
          </button>
          <button
            className="button quiet small"
            type="button"
            disabled={busy || !mission.ranking.noViableOption}
            onClick={() =>
              void send(
                {
                  type: "record_no_viable_option",
                  reason: "Every fully evaluated supplier fails a hard constraint.",
                },
                "record no viable option",
              )
            }
          >
            Record no viable option
          </button>
        </div>
      </form>
      {(executable.length > 0 || verifiable.length > 0) && (
        <ControlGroup
          title="Effect lifecycle"
          text="Execute, then independently verify. Retries reuse the same key."
        >
          <div className="button-row">
            {executable.map((effect) => (
              <button
                className="button quiet small"
                disabled={busy}
                key={effect.key}
                onClick={() =>
                  void send(
                    { type: "execute_effect", effectKey: effect.key },
                    `execute ${effect.kind}`,
                  )
                }
              >
                Execute · {effectCopy(effect, mission).title} ·{" "}
                {effect.targetId}
              </button>
            ))}
            {verifiable.map((effect) => (
              <button
                className="button quiet small"
                disabled={busy}
                key={effect.key}
                onClick={() =>
                  void send(
                    { type: "verify_effect", effectKey: effect.key },
                    `verify ${effect.kind}`,
                  )
                }
              >
                Verify · {effectCopy(effect, mission).title} · {effect.targetId}
              </button>
            ))}
          </div>
        </ControlGroup>
      )}
      <ControlGroup
        title="Completion gate"
        text="Domain policy fails closed until every required effect is verified."
      >
        <button
          className="button quiet small"
          disabled={busy}
          onClick={() => void send({ type: "complete_mission" }, "complete mission")}
        >
          Check completion
        </button>
      </ControlGroup>
    </div>
  );
}

function ControlGroup({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="control-group">
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </section>
  );
}
