"use client";

// M5 INTEGRATION — production live workspace. ONE reactive Convex query
// (m5Workspace.getObjectiveWorkspaceV2) composes the normalized read model
// server-side; this component only selects an Objective and renders the
// accepted Mission Control surface. React is NOT the join layer.
//
// Commands audit (frozen accepted interactions):
//   - Objective selection / navigation: read-only — wired.
//   - Needs You "approve": NO public backend command exists to resolve a
//     pending approval or bind a founder spend grant (the supervised lane owns
//     that). The control is truthfully DISABLED with an explanation — it never
//     fakes success and never executes a payment.
//   - Fixture demo controls: not rendered in production.

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ObjectiveWorkspaceView } from "./workspace";
import { MissionControl } from "./MissionControl";
import { Icon } from "../somebody/Icon";
import { CompanyField } from "./CompanyField";
import { Decisions, NeedsYou } from "./DecisionAttention";
import { AcquisitionProgress, CompletionSummary, EvidenceInspector, MissionStory } from "./EvidenceStory";
import { buildXray } from "./xray";
import { SystemXray } from "./SystemXray";

type WorkspaceResult = { found: boolean; view: ObjectiveWorkspaceView | null } | null | undefined;

export function LiveWorkspace({ initialObjectiveKey }: { initialObjectiveKey?: string }) {
  const objectives = useQuery(api.objectives.listObjectives, {}) as
    | { key: string; request: string; state: string; updatedAt: number }[]
    | null
    | undefined;
  const [selected, setSelected] = useState<string | null>(initialObjectiveKey ?? null);
  const objectiveKey = selected ?? objectives?.[0]?.key ?? null;

  const result = useQuery(
    api.m5Workspace.getObjectiveWorkspaceV2,
    objectiveKey ? { objectiveKey } : "skip",
  ) as WorkspaceResult;

  const navigation = useMemo(
    () => (
      <nav className="mc-objectives" aria-label="Objectives">
        {(objectives ?? []).map((item, index) => (
          <button
            key={item.key}
            className="mc-objective-button"
            aria-current={objectiveKey === item.key ? "page" : undefined}
            onClick={() => {
              setSelected(item.key);
              const params = new URLSearchParams({ objective: item.key });
              window.history.replaceState(null, "", `?${params}`);
            }}
          >
            <span className="mc-objective-number">{String(index + 1).padStart(2, "0")}</span>
            <span>
              <strong>{item.request.length > 48 ? `${item.request.slice(0, 45).trimEnd()}…` : item.request}</strong>
              <small>{item.key}</small>
            </span>
            <Icon name="arrow" size={14} />
          </button>
        ))}
        {!objectives?.length && <p className="mc-empty">No Objectives persisted yet. Submit one from the main workspace; nothing is demo-seeded here.</p>}
      </nav>
    ),
    [objectives, objectiveKey],
  );

  if (!objectiveKey) {
    return (
      <div className="mc-root">
        <div className="mc-layout">
          <main className="mc-main" tabIndex={-1}>
            <div className="mc-main-heading">
              <div>
                <span className="mc-section-label">Objective / Mission control</span>
                <h1>No Objective selected</h1>
                <p className="mc-request">Choose a persisted Objective when one exists. This surface never fabricates demo state.</p>
              </div>
            </div>
            {navigation}
          </main>
        </div>
      </div>
    );
  }

  if (result === undefined || (objectives === undefined && selected === null)) {
    return (
      <div className="mc-root">
        <div className="mc-layout">
          <main className="mc-main" tabIndex={-1}>
            <div className="mc-main-heading">
              <div>
                <span className="mc-section-label">Objective / Mission control</span>
                <h1>Loading workspace…</h1>
                <p className="mc-request">Reading the authoritative Convex read model.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (result === null || !result.found || !result.view) {
    return (
      <div className="mc-root">
        <div className="mc-layout">
          <main className="mc-main" tabIndex={-1}>
            <div className="mc-main-heading">
              <div>
                <span className="mc-section-label">Objective / Mission control</span>
                <h1>Objective not found</h1>
                <p className="mc-request">No row exists for {objectiveKey}. The backend is authoritative; nothing is substituted from fixtures.</p>
              </div>
            </div>
            {navigation}
          </main>
        </div>
      </div>
    );
  }

  const view = result.view;
  return (
    <MissionControl
      view={view}
      company={<><CompanyField view={view} /><Decisions view={view} /></>}
      story={<><CompletionSummary view={view} /><AcquisitionProgress view={view} /><MissionStory view={view} /></>}
      inspection={
        <>
          <EvidenceInspector view={view} />
          <details className="mc-xray-toggle">
            <summary>System X-ray · secondary inspection</summary>
            <SystemXray xray={buildXray(view)} />
          </details>
        </>
      }
      attention={
        <>
          <NeedsYou view={view} />
          {view.attention.length > 0 && (
            <p className="mc-fixture-note">
              Approval and reconciliation actions run through the supervised backend lane; no public command exists yet, so
              these controls stay truthfully unavailable here. Nothing is faked and no payment can execute from this surface.
            </p>
          )}
        </>
      }
      objectiveNavigation={navigation}
      controls={null}
    />
  );
}
