"use client";

import { useState } from "react";
import { fixtureScenarios, selectFixture } from "./fixtures";
import { MissionControl } from "./MissionControl";
import { Icon } from "../somebody/Icon";
import { CompanyField } from "./CompanyField";
import { Decisions, NeedsYou } from "./DecisionAttention";
import { AcquisitionProgress, CompletionSummary, EvidenceInspector, MissionStory } from "./EvidenceStory";

export function FixtureWorkspace({ initialScenario = "launch", initialMoment }: { initialScenario?: string; initialMoment?: string }) {
  const initial = selectFixture(initialScenario, initialMoment);
  const [scenarioId, setScenarioId] = useState(initial.scenario.id);
  const [moments, setMoments] = useState<Record<string, string>>({ [initial.scenario.id]: initial.snapshot.id });
  const { scenario, snapshot } = selectFixture(scenarioId, moments[scenarioId]);
  function select(id: string, moment?: string) {
    const choice = selectFixture(id, moment);
    setScenarioId(choice.scenario.id);
    setMoments(previous => ({ ...previous, [choice.scenario.id]: choice.snapshot.id }));
    const params = new URLSearchParams({ scenario: choice.scenario.id, moment: choice.snapshot.id });
    window.history.replaceState(null, "", `?${params}`);
  }
  return <MissionControl view={snapshot.view}
    company={<><CompanyField view={snapshot.view} /><Decisions view={snapshot.view} /></>}
    story={<><CompletionSummary view={snapshot.view} /><AcquisitionProgress view={snapshot.view} /><MissionStory view={snapshot.view} /></>}
    inspection={<EvidenceInspector view={snapshot.view} />}
    attention={<NeedsYou view={snapshot.view} onApprove={snapshot.action?.requiresFounder ? () => select(scenario.id, snapshot.action!.nextSnapshotId) : undefined} />}
    objectiveNavigation={<nav className="mc-objectives" aria-label="Fixture Objectives">{fixtureScenarios.map((item, index) => <button key={item.id} className="mc-objective-button" aria-current={scenario.id === item.id ? "page" : undefined} onClick={() => select(item.id, moments[item.id])}><span className="mc-objective-number">0{index + 1}</span><span><strong>{item.title}</strong><small>{item.path}</small></span><Icon name="arrow" size={14} /></button>)}</nav>}
    controls={<section className="mc-demo-controls" aria-label="Fixture controls"><span className="mc-section-label">Fixture controls</span><p>Explore the operating story. Every action below changes fixture data only.</p>
      {snapshot.action && !snapshot.action.requiresFounder && <button className="button primary" onClick={() => select(scenario.id, snapshot.action!.nextSnapshotId)}>Simulate: {snapshot.action.label}<Icon name="arrow" size={14} /></button>}
      <details><summary>Choose a saved moment</summary><label htmlFor="fixture-moment">Scenario moment</label><select id="fixture-moment" value={snapshot.id} onChange={e => select(scenario.id, e.target.value)}>{scenario.snapshots.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button className="button quiet small" onClick={() => select(scenario.id, scenario.snapshots[0].id)}>Start from the Objective</button></details>
    </section>}
  />;
}
