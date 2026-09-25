"use client";

import { useReplayPlayback } from "./ReplayPlaybackProvider";

// Minimal replay controls: ▶ Replay run (idle) · Pause/Resume (running) ·
// ↻ Replay (finished). Presentation only.
export function ReplayControls() {
  const playback = useReplayPlayback();
  const { phase } = playback;
  const progress = playback.durationMs > 0 ? Math.min(1, playback.elapsedMs / playback.durationMs) : 0;

  let label: string;
  let onClick: () => void;
  if (phase === "idle") {
    label = "▶ Replay run";
    onClick = playback.run;
  } else if (phase === "finished") {
    label = "↻ Replay";
    onClick = playback.restart;
  } else if (phase === "paused") {
    label = "▶ Resume";
    onClick = playback.resume;
  } else {
    label = "Pause";
    onClick = playback.pause;
  }

  return (
    <div className="v6-replay-controls" role="group" aria-label="Replay controls" data-replay-phase={phase}>
      <span className="v6-replay-controls-label">Replay of a completed run</span>
      <span className="v6-replay-controls-track" aria-hidden="true">
        <span className="v6-replay-controls-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      <button type="button" className="v6-replay-controls-button" data-action={`replay-${phase}`} onClick={onClick}>
        {label}
      </button>
    </div>
  );
}
