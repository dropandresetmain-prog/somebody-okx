import { FixtureWorkspace } from "./FixtureWorkspace";
import "./mission-control.css";
import "./xray.css";

export default async function M5Page({ searchParams }: { searchParams: Promise<{ scenario?: string; moment?: string }> }) {
  const params = await searchParams;
  return <FixtureWorkspace initialScenario={params.scenario} initialMoment={params.moment} />;
}
