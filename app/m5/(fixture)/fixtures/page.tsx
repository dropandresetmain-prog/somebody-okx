// Fixture lane — preserved acceptance/demo surface at /m5/fixtures.
// Fixture DEFINITIONS keep their development value (tests, design acceptance);
// production /m5 no longer depends on them. No ConvexClientProvider here: this
// route group is deliberately provider-free and fixture-only.
import { FixtureWorkspace } from "../../FixtureWorkspace";
import "../../mission-control.css";
import "../../xray.css";

export default async function M5FixturesPage({ searchParams }: { searchParams: Promise<{ scenario?: string; moment?: string }> }) {
  const params = await searchParams;
  return <FixtureWorkspace initialScenario={params.scenario} initialMoment={params.moment} />;
}
