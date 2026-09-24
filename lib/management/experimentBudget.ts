/**
 * Experiment Objective wall-clock budget.
 *
 * When Jev sourcing selection is enabled under testnet_demo, use a bounded
 * 5-minute Objective experiment window instead of the prior 4-hour Testnet
 * continuation budget. Production / non-experiment testnet keeps prior defaults.
 *
 * Reads the JEV env flag directly (not via isJevOptionSelectionEnabled) so
 * this module stays free of the Jev gateway / `ai` import graph.
 */

import { readSomebodyExecutionMode } from "../execution/executionMode";

/** Keep in sync with lib/management/jevStage3.ts JEV_OPTION_SELECTION_ENV. */
const JEV_OPTION_SELECTION_ENV = "JEV_OPTION_SELECTION_ENABLED";

/** 5-minute maximum elapsed Objective window for the sourcing experiment. */
export const EXPERIMENT_OBJECTIVE_MAX_ELAPSED_MS = 5 * 60_000;

/** Prior Testnet continuation window (not used for Jev sourcing experiment Objectives). */
export const TESTNET_CONTINUATION_MAX_ELAPSED_MS = 4 * 60 * 60_000;

function jevSelectionEnabled(env: NodeJS.ProcessEnv): boolean {
  return String(env[JEV_OPTION_SELECTION_ENV] ?? "").trim().toLowerCase() === "true";
}

/**
 * Resolve maxElapsedMs override for budget init/renew.
 * Returns undefined when the caller should keep the ordinary default.
 */
export function resolveExperimentMaxElapsedMs(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const explicit = String(env.SOMEBODY_EXPERIMENT_MAX_ELAPSED_MS ?? "").trim();
  if (explicit) {
    const parsed = Number(explicit);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  if (readSomebodyExecutionMode(env) === "testnet_demo" && jevSelectionEnabled(env)) {
    return EXPERIMENT_OBJECTIVE_MAX_ELAPSED_MS;
  }
  if (readSomebodyExecutionMode(env) === "testnet_demo") {
    return TESTNET_CONTINUATION_MAX_ELAPSED_MS;
  }
  return undefined;
}
