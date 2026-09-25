"use client";

// Public replay /start. The composer is the real Somebody start experience, but
// submitting only starts the recorded run: the visitor's text stays in local
// component state and is never sent anywhere (no Convex, no model, no JEV).
// This module deliberately imports nothing from convex/*.

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { StartView } from "../start/StartView";
import { REPLAY_WORKSPACE_HREF } from "./replayRoutes";
import "../start/start.css";

export function ReplayStartContainer() {
  const router = useRouter();
  const onReplayStart = useCallback(() => {
    router.push(REPLAY_WORKSPACE_HREF);
  }, [router]);

  return (
    <div className="v6-start-page">
      <StartView mode="replay" capabilities={null} onReplayStart={onReplayStart} />
    </div>
  );
}
