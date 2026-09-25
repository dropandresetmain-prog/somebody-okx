"use client";

// Public replay workspace. Renders the real V6 product UI from the frozen
// Product Contract frames of a completed run. This module deliberately imports
// nothing from convex/* — replay mode has no read or write path to a backend,
// and no Product Command (create Objective, spend approval) is reachable.

import { useRouter } from "next/navigation";
import { okxSubmissionRunScenario } from "../../lib/demo/scenarios/okxSubmissionRun";
import { V6WorkspaceView } from "../product/V6WorkspaceView";
import { ReplayControls } from "./ReplayControls";
import { ReplayPlaybackProvider, useReplayPlayback } from "./ReplayPlaybackProvider";
import "../product/product-workspace.css";
import "../product/okx-demo-surface.css";
import "./replay.css";

export function ReplayWorkspace({ autoStart }: { autoStart: boolean }) {
  return (
    <ReplayPlaybackProvider scenario={okxSubmissionRunScenario} autoStart={autoStart}>
      <ReplayWorkspaceBody />
    </ReplayPlaybackProvider>
  );
}

function ReplayWorkspaceBody() {
  const router = useRouter();
  const playback = useReplayPlayback();
  // Before the clock starts the first recorded frame is shown, never a blank shell.
  const frame = playback.currentFrame ?? playback.scenario.frames[0]!;

  return (
    <div className="v6-replay" data-replay-phase={playback.phase}>
      <V6WorkspaceView
        mode="replay"
        list={frame.objectiveList}
        selectedId={frame.workspace.objective.id}
        onSelect={() => {}}
        onStartNew={() => router.push("/start")}
        main={{ kind: "ready", view: frame.workspace, stale: false }}
      />
      <ReplayControls />
    </div>
  );
}
