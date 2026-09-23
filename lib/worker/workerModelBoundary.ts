/**
 * Test-only worker model injection for executeWorker.
 * Production never sets this; live runs use providerConfiguration + Agents SDK.
 */
import type { Model } from "@openai/agents";

let workerModelDouble: Model | null = null;

export function installWorkerModelDouble(model: Model | null): void {
  workerModelDouble = model;
}

export function getWorkerModelDouble(): Model | null {
  return workerModelDouble;
}
