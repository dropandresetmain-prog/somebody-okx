import { ObjectiveWorkspaceRoot } from "./ObjectiveWorkspace";
import { ConvexClientProvider } from "./ConvexClientProvider";

// The Objective workspace is the app entry point: state an objective, Somebody
// plans it (MAKE), assembles a worker and proves the work with evidence.
export default function Home() {
  return <ConvexClientProvider><ObjectiveWorkspaceRoot /></ConvexClientProvider>;
}
