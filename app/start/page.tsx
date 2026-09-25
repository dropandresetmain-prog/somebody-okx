import { ConvexClientProvider } from "../ConvexClientProvider";
import { ReplayStartContainer } from "../replay/ReplayStartContainer";
import { isReplayMode } from "../../lib/product/mode";
import { StartContainer } from "./StartContainer";

// /start — live: Create Objective through the Product Command seam, with the
// Convex provider scoped to this route segment. replay: the public start
// experience, which only launches the recorded run (no Convex provider).
export default function StartPage() {
  if (isReplayMode()) return <ReplayStartContainer />;
  return (
    <ConvexClientProvider>
      <StartContainer />
    </ConvexClientProvider>
  );
}
