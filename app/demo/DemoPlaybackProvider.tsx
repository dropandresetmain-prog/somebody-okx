"use client";

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
  engineReset,
  engineRestart,
  engineResume,
  engineRun,
  engineSnapshot,
  engineTick,
  type DemoPlaybackSnapshot,
  type DemoScenario,
  type DemoTimingMode,
  type PlaybackEngineState,
  DEFAULT_START_DELAY_MS,
} from "../../lib/demo/playback";
import { lunaRelaunchScenario } from "../../lib/demo/scenarios/lunaRelaunch";

type DemoPlaybackContextValue = DemoPlaybackSnapshot & {
  scenario: DemoScenario;
  enabled: boolean;
  run: (opts?: { mode?: DemoTimingMode; startDelayMs?: number }) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  reset: () => void;
  setMode: (mode: DemoTimingMode) => void;
  setStartDelayMs: (ms: number) => void;
};

const DemoPlaybackContext = createContext<DemoPlaybackContextValue | null>(null);

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function isDemoConsoleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_CONSOLE === "true";
}

export function DemoPlaybackProvider({
  children,
  scenario = lunaRelaunchScenario,
  enabled = isDemoConsoleEnabled(),
}: {
  children: ReactNode;
  scenario?: DemoScenario;
  enabled?: boolean;
}) {
  const engineRef = useRef<PlaybackEngineState>(createIdleEngine(scenario));
  const [snap, setSnap] = useState<DemoPlaybackSnapshot>(() => engineSnapshot(engineRef.current, nowMs()));

  const publish = useCallback(() => {
    setSnap(engineSnapshot(engineRef.current, nowMs()));
  }, []);

  const apply = useCallback(
    (next: PlaybackEngineState) => {
      engineRef.current = next;
      publish();
    },
    [publish],
  );

  useEffect(() => {
    engineRef.current = { ...engineRef.current, scenario };
    publish();
  }, [scenario, publish]);

  // Monotonic rAF tick while delaying/playing — never blocks the UI thread.
  useEffect(() => {
    if (snap.phase !== "delaying" && snap.phase !== "playing") return;
    let raf = 0;
    const loop = () => {
      const before = engineRef.current;
      const after = engineTick(before, nowMs());
      if (after !== before) {
        engineRef.current = after;
      }
      setSnap(engineSnapshot(engineRef.current, nowMs()));
      if (engineRef.current.phase === "delaying" || engineRef.current.phase === "playing") {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [snap.phase]);

  const run = useCallback(
    (opts?: { mode?: DemoTimingMode; startDelayMs?: number }) => {
      if (!enabled) return;
      let next = engineRef.current;
      if (opts?.mode) next = { ...next, mode: opts.mode };
      if (opts?.startDelayMs !== undefined) next = { ...next, startDelayMs: Math.max(0, opts.startDelayMs) };
      apply(engineRun(next, nowMs()));
    },
    [apply, enabled],
  );

  const pause = useCallback(() => {
    apply(enginePause(engineRef.current, nowMs()));
  }, [apply]);

  const resume = useCallback(() => {
    apply(engineResume(engineRef.current, nowMs()));
  }, [apply]);

  const restart = useCallback(() => {
    apply(engineRestart(engineRef.current, nowMs()));
  }, [apply]);

  const reset = useCallback(() => {
    // Frontend-only: restores live Convex product reads. No Convex writes.
    apply(engineReset(engineRef.current));
  }, [apply]);

  const setMode = useCallback(
    (mode: DemoTimingMode) => {
      const cur = engineRef.current;
      if (cur.phase !== "idle") return;
      apply({ ...cur, mode });
    },
    [apply],
  );

  const setStartDelayMs = useCallback(
    (ms: number) => {
      const cur = engineRef.current;
      if (cur.phase !== "idle") return;
      apply({ ...cur, startDelayMs: Math.max(0, ms) });
    },
    [apply],
  );

  const value = useMemo<DemoPlaybackContextValue>(
    () => ({
      ...snap,
      scenario,
      enabled,
      run,
      pause,
      resume,
      restart,
      reset,
      setMode,
      setStartDelayMs,
    }),
    [snap, scenario, enabled, run, pause, resume, restart, reset, setMode, setStartDelayMs],
  );

  return <DemoPlaybackContext.Provider value={value}>{children}</DemoPlaybackContext.Provider>;
}

export function useDemoPlayback(): DemoPlaybackContextValue {
  const ctx = useContext(DemoPlaybackContext);
  if (!ctx) {
    // Safe no-op fallback when the provider is absent (tests / non-demo mounts).
    const scenario = lunaRelaunchScenario;
    const idle = engineSnapshot(createIdleEngine(scenario), 0);
    return {
      ...idle,
      scenario,
      enabled: false,
      run: () => {},
      pause: () => {},
      resume: () => {},
      restart: () => {},
      reset: () => {},
      setMode: () => {},
      setStartDelayMs: () => {},
    };
  }
  return ctx;
}

export { DEFAULT_START_DELAY_MS };
