"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { V6WorkspaceView } from "../../product/V6WorkspaceView";
import { StartView } from "../../start/StartView";
import {
  ALL_FALSE_START,
  QA_LIST,
  completedWorkspace,
  needsYouWorkspace,
  workingWorkspace,
} from "./fixtures";
import { lunaRelaunchScenario } from "../../../lib/demo/scenarios/lunaRelaunch";
import "../../product/product-workspace.css";
import "../../start/start.css";

function V6QaInner() {
  const params = useSearchParams();
  const scene = params.get("scene") ?? "working";

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  if (scene === "start") {
    return (
      <div className="v6-start-page">
        <StartView capabilities={ALL_FALSE_START} />
      </div>
    );
  }

  if (scene === "luna") {
    // Real recorded Luna replay frames (?frame=N, default last) for copy QA.
    const frames = lunaRelaunchScenario.frames;
    const requested = Number(params.get("frame") ?? frames.length - 1);
    const frame = frames[Math.min(Math.max(0, Number.isFinite(requested) ? requested : frames.length - 1), frames.length - 1)];
    return (
      <V6WorkspaceView
        list={frame.objectiveList}
        selectedId={frame.workspace.objective.id}
        onSelect={() => {}}
        onStartNew={() => {}}
        main={{ kind: "ready", view: frame.workspace }}
      />
    );
  }

  const view =
    scene === "needs_you" ? needsYouWorkspace() : scene === "complete" ? completedWorkspace() : workingWorkspace();
  const selectedId =
    scene === "needs_you" ? "obj_needs_you" : scene === "complete" ? "obj_done" : "obj_working";

  return (
    <V6WorkspaceView
      list={QA_LIST}
      selectedId={selectedId}
      onSelect={() => {}}
      onStartNew={() => {}}
      main={{ kind: "ready", view }}
    />
  );
}

// Local-only visual QA harness. Renders V6WorkspaceView from contract-shaped
// fixtures so screenshots do not depend on a live Convex environment.
export default function V6QaPage() {
  return (
    <Suspense fallback={null}>
      <V6QaInner />
    </Suspense>
  );
}
