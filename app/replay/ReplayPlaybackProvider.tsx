"use client";

// Replay-mode playback clock. Advances precomputed Product Contract frames of a
// completed run. Frontend-only: it never talks to Convex, calls a model, or
// submits Product Commands.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createIdleEngine,
  enginePause,
  engineRestart,
  engineResume,
  engineRun,
  engineSnapshot,
  engineTick,
  type DemoPlaybackSnapshot,
  type DemoScenario,
  type PlaybackEngineState,
} from "../../lib/demo/playback";

export type ReplayPlaybackValue = DemoPlaybackSnapshot & {
  scenario: DemoScenario;
  run: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
};

const ReplayPlaybackContext = createContext<ReplayPlaybackValue | null>(null);

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Short beat between arriving in the workspace and the first frame advancing. */
export const REPLAY_START_DELAY_MS = 600;
const REPLAY_TICK_MS = 250;

export function ReplayPlaybackProvider({
  children,
  scenario,
  autoStart = false,
  startDelayMs = REPLAY_START_DELAY_MS,
}: {
  children: ReactNode;
  scenario: DemoScenario;
  autoStart?: boolean;
  startDelayMs?: number;
}) {
  const engineRef = useRef<PlaybackEngineState>(createIdleEngine(scenario, "demo_sequence", startDelayMs));
  const [snap, setSnap] = useState<DemoPlaybackSnapshot>(() => engineSnapshot(engineRef.current, nowMs()));

  const apply = useCallback((next: PlaybackEngineState) => {
    engineRef.current = next;
    setSnap(engineSnapshot(next, nowMs()));
  }, []);

  useEffect(() => {
    if (autoStart && engineRef.current.phase === "idle") apply(engineRun(engineRef.current, nowMs()));
  }, [autoStart, apply]);

  // Coarse tick while delaying/playing. Frames change every few seconds, so
  // publishing ~4×/s keeps the progress indicator smooth without re-rendering
  // the workspace on every animation frame.
  useEffect(() => {
    if (snap.phase !== "delaying" && snap.phase !== "playing") return;
    const timer = setInterval(() => {
      engineRef.current = engineTick(engineRef.current, nowMs());
      setSnap(engineSnapshot(engineRef.current, nowMs()));
    }, REPLAY_TICK_MS);
    return () => clearInterval(timer);
  }, [snap.phase]);

  const run = useCallback(() => apply(engineRun(engineRef.current, nowMs())), [apply]);
  const pause = useCallback(() => apply(enginePause(engineRef.current, nowMs())), [apply]);
  const resume = useCallback(() => apply(engineResume(engineRef.current, nowMs())), [apply]);
  const restart = useCallback(() => apply(engineRestart(engineRef.current, nowMs())), [apply]);

  const value = useMemo<ReplayPlaybackValue>(
    () => ({ ...snap, scenario, run, pause, resume, restart }),
    [snap, scenario, run, pause, resume, restart],
  );

  return <ReplayPlaybackContext.Provider value={value}>{children}</ReplayPlaybackContext.Provider>;
}

export function useReplayPlayback(): ReplayPlaybackValue {
  const ctx = useContext(ReplayPlaybackContext);
  if (!ctx) throw new Error("useReplayPlayback must be used inside ReplayPlaybackProvider");
  return ctx;
}
