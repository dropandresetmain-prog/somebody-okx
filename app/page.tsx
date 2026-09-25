import { redirect } from "next/navigation";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ProductWorkspace } from "./product/ProductWorkspace";
import { ReplayWorkspace } from "./replay/ReplayWorkspace";
import { shouldAutoStartReplay } from "./replay/replayRoutes";
import { isReplayMode } from "../lib/product/mode";

// V6 product surface — the app entry point.
//
// live:   reads only the accepted product contract (app/product/contracts.ts)
//         via convex/productWorkspace.ts; see DESIGN.md for the approved
//         information architecture.
// replay: the public website. No Convex provider is mounted at all; the
//         workspace plays the recorded completed run. Visitors arrive from
//         /start, which is where the public site begins.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ objective?: string; replay?: string | string[] }>;
}) {
  const params = await searchParams;
  if (isReplayMode()) {
    if (!shouldAutoStartReplay(params.replay)) redirect("/start");
    return <ReplayWorkspace autoStart />;
  }
  return (
    <ConvexClientProvider>
      <ProductWorkspace initialObjectiveId={params.objective} />
    </ConvexClientProvider>
  );
}
