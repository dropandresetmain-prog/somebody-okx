// Model selection for dynamically assembled MAKE workers.
// Deliberate, bounded and recorded: the selected model and the reason are
// persisted on every run. This is M1's pragmatic policy, not a general
// runtime router.

export type ModelSelection = {
  model: string;
  reason: string;
};

export type ModelSelectionInput = {
  env: Record<string, string | undefined>;
  // Tool-capable is required: the worker must perform tool-mediated work.
  requiresTools: true;
};

// Explicit configuration wins. A configured model must be tool-capable by
// declaration — the operator asserts it deliberately via env.
export function selectWorkerModel(input: ModelSelectionInput): ModelSelection {
  const model = input.env.AI_MODEL?.trim();
  if (!model)
    throw new Error(
      "Set AI_MODEL to a deliberately selected tool-capable model",
    );
  const provider = input.env.AI_PROVIDER?.trim() || "openrouter";
  if (provider !== "openrouter" && provider !== "openai")
    throw new Error("AI_PROVIDER must be openrouter or openai");
  return {
    model,
    reason:
      "Operator-selected tool-capable model for bounded research execution",
  };
}

// Provider configuration for live runs. Fail closed unless live AI is
// explicitly enabled, mirroring the inherited runtime's gate.
export function providerConfiguration(env: Record<string, string | undefined>) {
  if (env.LIVE_AI_ENABLED !== "true")
    throw new Error("LIVE_AI_ENABLED must be true to call a live model");
  const provider = env.AI_PROVIDER ?? "openrouter";
  if (provider !== "openrouter" && provider !== "openai")
    throw new Error("AI_PROVIDER must be openrouter or openai");
  const apiKey =
    provider === "openrouter" ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`Missing ${provider} API key`);
  const selection = selectWorkerModel({ env, requiresTools: true });
  return {
    provider,
    model: selection.model,
    modelSelectionReason: selection.reason,
    apiKey,
    baseURL:
      provider === "openrouter" ? "https://openrouter.ai/api/v1" : undefined,
  };
}
