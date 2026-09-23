"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatPlaybackClock } from "../../lib/demo/playback";
import { useDemoPlayback } from "./useDemoPlayback";

/**
 * Subtle founder Demo Console — presentation controls only.
 * Does not mutate Convex, call models, or change acquisition provenance.
 */
export function DemoConsole({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const demo = useDemoPlayback();
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!demo.enabled) return null;

  const { scenario } = demo;
  const shortModel = scenario.source.model.includes("luna") ? "Luna" : scenario.source.model;
  const clock = formatPlaybackClock(demo.elapsedMs, demo.durationMs);
  const delaySec = (demo.startDelayMs / 1000).toFixed(0);
  const originalSec = (scenario.originalDurationMs / 1000).toFixed(0);
  const demoSec = (scenario.demoSequenceDurationMs / 1000).toFixed(0);
  const running = demo.phase === "playing" || demo.phase === "delaying";
  const canPause = running;
  const canResume = demo.phase === "paused";
  const canRestart = demo.active;
  const showPlayback = demo.active;

  return (
    <div className="demo-console" ref={rootRef} data-demo-console="true">
      <button
        type="button"
        className="demo-console-trigger"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        Demo Console
      </button>

      {open ? (
        <div className="demo-console-popover" role="dialog" aria-labelledby={titleId} id={titleId}>
          <p className="demo-console-title" id={titleId}>
            Demo Console
          </p>

          <div className="demo-console-block">
            <p className="demo-console-label">Scenario</p>
            <p className="demo-console-value">{scenario.label}</p>
          </div>

          <div className="demo-console-block">
            <p className="demo-console-label">Mode</p>
            <label className="demo-console-option">
              <input
                type="radio"
                name="demo-mode"
                checked={demo.mode === "original"}
                disabled={demo.active}
                onChange={() => demo.setMode("original")}
              />
              <span>Original timing</span>
              <span className="demo-console-meta">{originalSec}s</span>
            </label>
            <label className="demo-console-option">
              <input
                type="radio"
                name="demo-mode"
                checked={demo.mode === "demo_sequence"}
                disabled={demo.active}
                onChange={() => demo.setMode("demo_sequence")}
              />
              <span>Demo sequence</span>
              <span className="demo-console-meta">{demoSec}s</span>
            </label>
            <label className="demo-console-option">
              <input
                type="radio"
                name="demo-mode"
                checked={demo.mode === "immediate"}
                disabled={demo.active}
                onChange={() => demo.setMode("immediate")}
              />
              <span>Immediate</span>
              <span className="demo-console-meta">final frame</span>
            </label>
          </div>

          <div className="demo-console-block">
            <p className="demo-console-label">Start delay</p>
            <p className="demo-console-value">
              {demo.mode === "immediate" ? "None" : `${delaySec} seconds`}
              {demo.phase === "delaying" || (demo.phase === "paused" && demo.delayRemainingMs > 0) ? (
                <span className="demo-console-meta"> · countdown {(demo.delayRemainingMs / 1000).toFixed(1)}s</span>
              ) : null}
            </p>
          </div>

          {!demo.active ? (
            <button type="button" className="button primary demo-console-run" onClick={() => demo.run()}>
              Run Scenario
            </button>
          ) : null}

          {showPlayback ? (
            <div className="demo-console-block">
              <p className="demo-console-label">Playback</p>
              <p className="demo-console-clock" data-demo-clock="true">
                {clock}
              </p>
              <div className="demo-console-actions">
                {canPause ? (
                  <button type="button" className="button" onClick={() => demo.pause()}>
                    Pause
                  </button>
                ) : null}
                {canResume ? (
                  <button type="button" className="button" onClick={() => demo.resume()}>
                    Resume
                  </button>
                ) : null}
                {canRestart ? (
                  <button type="button" className="button" onClick={() => demo.restart()}>
                    Restart
                  </button>
                ) : null}
                <button type="button" className="button" onClick={() => demo.reset()}>
                  Reset
                </button>
              </div>
            </div>
          ) : null}

          <p className="demo-console-source">
            Source: {scenario.source.objectiveId} · {shortModel} · {scenario.source.candidateSha}
            <br />
            Acquisition provenance: {scenario.source.acquisitionProvenance}
          </p>
        </div>
      ) : null}
    </div>
  );
}
