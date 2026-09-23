/**
 * Demo playback — product-contract frame timing only.
 *
 * This module advances precomputed Product Contract snapshots. It never talks
 * to Convex, never calls a model, and never mutates acquisition provenance.
 * "Demo playback" is UI presentation of recorded product states — not
 * acquisition `recorded_replay`.
 */

import type { ObjectiveListView, ObjectiveWorkspaceView } from "../../app/product/contracts";

export type DemoTimingMode = "original" | "demo_sequence";

export type DemoFrame = {
  /** Elapsed ms from the historical run start (authoritative where known). */
  elapsedMs: number;
  objectiveList: ObjectiveListView;
  workspace: ObjectiveWorkspaceView;
};

export type DemoSequenceEntry = {
  frameIndex: number;
  atMs: number;
};

export type DemoScenario = {
  id: string;
  label: string;
  source: {
    candidateSha: string;
    objectiveId: string;
    model: string;
    evidencePath: string;
    /** Historical acquisition provenance — never rewritten for UI playback. */
    acquisitionProvenance: "live" | "simulation" | "recorded_replay";
  };
  originalDurationMs: number;
  demoSequenceDurationMs: number;
  frames: DemoFrame[];
  originalSequence: DemoSequenceEntry[];
  demoSequence: DemoSequenceEntry[];
};

export type DemoPlaybackPhase = "idle" | "delaying" | "playing" | "paused" | "finished";

export type DemoPlaybackSnapshot = {
  active: boolean;
  scenarioId: string | null;
  mode: DemoTimingMode;
  startDelayMs: number;
  phase: DemoPlaybackPhase;
  /** Elapsed within the chosen timing track (0…duration). Excludes start delay. */
  elapsedMs: number;
  /** Remaining start-delay ms while phase === "delaying". */
  delayRemainingMs: number;
  frameIndex: number;
  durationMs: number;
  currentFrame: DemoFrame | null;
};

export type DemoPlaybackControls = {
  run: (opts?: { mode?: DemoTimingMode; startDelayMs?: number }) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  /** Exit playback and restore live product reads. Never mutates Convex. */
  reset: () => void;
  setMode: (mode: DemoTimingMode) => void;
  setStartDelayMs: (ms: number) => void;
};

export const DEFAULT_START_DELAY_MS = 3_000;

export function durationForMode(scenario: DemoScenario, mode: DemoTimingMode): number {
  return mode === "original" ? scenario.originalDurationMs : scenario.demoSequenceDurationMs;
}

export function sequenceForMode(scenario: DemoScenario, mode: DemoTimingMode): DemoSequenceEntry[] {
  return mode === "original" ? scenario.originalSequence : scenario.demoSequence;
}

/** Last frame whose sequence atMs ≤ elapsedMs (clamped). */
export function frameIndexAtElapsed(scenario: DemoScenario, mode: DemoTimingMode, elapsedMs: number): number {
  const sequence = sequenceForMode(scenario, mode);
  if (sequence.length === 0) return 0;
  let index = sequence[0]!.frameIndex;
  for (const entry of sequence) {
    if (entry.atMs <= elapsedMs) index = entry.frameIndex;
    else break;
  }
  return Math.max(0, Math.min(index, scenario.frames.length - 1));
}

export function formatPlaybackClock(elapsedMs: number, durationMs: number): string {
  const e = Math.max(0, elapsedMs) / 1000;
  const d = Math.max(0, durationMs) / 1000;
  return `${e.toFixed(1)}s / ${d.toFixed(1)}s`;
}

/**
 * Pure timing step used by the provider and Level-1 tests.
 * `nowMs` is monotonic frontend time (e.g. performance.now()).
 */
export type PlaybackEngineState = {
  scenario: DemoScenario;
  mode: DemoTimingMode;
  /** Configured pre-run delay (unchanged by pause). */
  startDelayMs: number;
  phase: DemoPlaybackPhase;
  /** Elapsed on the timing track when not actively playing. */
  frozenElapsedMs: number;
  /** Delay already consumed when paused during the start delay. */
  frozenDelayElapsedMs: number;
  /** Monotonic timestamp when the current running segment began. */
  segmentStartedAtMs: number | null;
};

export function createIdleEngine(scenario: DemoScenario, mode: DemoTimingMode = "demo_sequence", startDelayMs = DEFAULT_START_DELAY_MS): PlaybackEngineState {
  return {
    scenario,
    mode,
    startDelayMs,
    phase: "idle",
    frozenElapsedMs: 0,
    frozenDelayElapsedMs: 0,
    segmentStartedAtMs: null,
  };
}

export function engineSnapshot(engine: PlaybackEngineState, nowMs: number): DemoPlaybackSnapshot {
  const durationMs = durationForMode(engine.scenario, engine.mode);
  let delayRemainingMs = 0;
  let elapsedMs = engine.frozenElapsedMs;

  if (engine.phase === "delaying" && engine.segmentStartedAtMs !== null) {
    const waited = engine.frozenDelayElapsedMs + (nowMs - engine.segmentStartedAtMs);
    delayRemainingMs = Math.max(0, engine.startDelayMs - waited);
    elapsedMs = 0;
  } else if (engine.phase === "paused" && engine.frozenElapsedMs <= 0 && engine.frozenDelayElapsedMs < engine.startDelayMs) {
    delayRemainingMs = Math.max(0, engine.startDelayMs - engine.frozenDelayElapsedMs);
    elapsedMs = 0;
  } else if (engine.phase === "playing" && engine.segmentStartedAtMs !== null) {
    elapsedMs = Math.min(durationMs, engine.frozenElapsedMs + (nowMs - engine.segmentStartedAtMs));
  } else if (engine.phase === "finished") {
    elapsedMs = durationMs;
  }

  const frameIndex =
    engine.phase === "idle" ? 0 : frameIndexAtElapsed(engine.scenario, engine.mode, elapsedMs);
  const currentFrame = engine.phase === "idle" ? null : (engine.scenario.frames[frameIndex] ?? null);

  return {
    active: engine.phase !== "idle",
    scenarioId: engine.phase === "idle" ? null : engine.scenario.id,
    mode: engine.mode,
    startDelayMs: engine.startDelayMs,
    phase: engine.phase,
    elapsedMs,
    delayRemainingMs,
    frameIndex,
    durationMs,
    currentFrame,
  };
}

export function engineRun(engine: PlaybackEngineState, nowMs: number): PlaybackEngineState {
  const startDelayMs = Math.max(0, engine.startDelayMs);
  if (startDelayMs <= 0) {
    return {
      ...engine,
      phase: "playing",
      frozenElapsedMs: 0,
      frozenDelayElapsedMs: 0,
      segmentStartedAtMs: nowMs,
    };
  }
  return {
    ...engine,
    phase: "delaying",
    frozenElapsedMs: 0,
    frozenDelayElapsedMs: 0,
    segmentStartedAtMs: nowMs,
  };
}

export function enginePause(engine: PlaybackEngineState, nowMs: number): PlaybackEngineState {
  if (engine.phase !== "playing" && engine.phase !== "delaying") return engine;
  if (engine.phase === "delaying" && engine.segmentStartedAtMs !== null) {
    return {
      ...engine,
      phase: "paused",
      frozenElapsedMs: 0,
      frozenDelayElapsedMs: engine.frozenDelayElapsedMs + (nowMs - engine.segmentStartedAtMs),
      segmentStartedAtMs: null,
    };
  }
  const snap = engineSnapshot(engine, nowMs);
  return {
    ...engine,
    phase: "paused",
    frozenElapsedMs: snap.elapsedMs,
    frozenDelayElapsedMs: engine.startDelayMs,
    segmentStartedAtMs: null,
  };
}

export function engineResume(engine: PlaybackEngineState, nowMs: number): PlaybackEngineState {
  if (engine.phase !== "paused") return engine;
  if (engine.frozenDelayElapsedMs < engine.startDelayMs) {
    return {
      ...engine,
      phase: "delaying",
      segmentStartedAtMs: nowMs,
    };
  }
  return {
    ...engine,
    phase: "playing",
    segmentStartedAtMs: nowMs,
  };
}

export function engineRestart(engine: PlaybackEngineState, nowMs: number): PlaybackEngineState {
  return engineRun({ ...engine, frozenElapsedMs: 0, frozenDelayElapsedMs: 0 }, nowMs);
}

export function engineReset(engine: PlaybackEngineState): PlaybackEngineState {
  return createIdleEngine(engine.scenario, engine.mode, engine.startDelayMs);
}

/** Advance phases when timers elapse (delay → play → finished). */
export function engineTick(engine: PlaybackEngineState, nowMs: number): PlaybackEngineState {
  if (engine.phase === "delaying" && engine.segmentStartedAtMs !== null) {
    const waited = engine.frozenDelayElapsedMs + (nowMs - engine.segmentStartedAtMs);
    if (waited >= engine.startDelayMs) {
      return {
        ...engine,
        phase: "playing",
        frozenElapsedMs: 0,
        frozenDelayElapsedMs: engine.startDelayMs,
        segmentStartedAtMs: nowMs,
      };
    }
    return engine;
  }
  if (engine.phase === "playing" && engine.segmentStartedAtMs !== null) {
    const durationMs = durationForMode(engine.scenario, engine.mode);
    const elapsed = engine.frozenElapsedMs + (nowMs - engine.segmentStartedAtMs);
    if (elapsed >= durationMs) {
      return {
        ...engine,
        phase: "finished",
        frozenElapsedMs: durationMs,
        segmentStartedAtMs: null,
      };
    }
  }
  return engine;
}
