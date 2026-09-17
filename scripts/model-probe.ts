import { runProcurementAgent } from "../lib/agent/procurement";
import { createMission } from "../lib/procurement/fixtures";
import { applyCommand } from "../lib/procurement/domain";

async function main() {
  if (!process.argv.includes("--live"))
    throw new Error(
      "Pass --live to deliberately enable this one live-model probe",
    );
  process.loadEnvFile(".env.local");
  const m = createMission(
    "model-probe",
    "Can you arrange some sponsor gifts for our event?",
    Date.now(),
  );
  const env = {
    ...process.env,
    LIVE_AI_ENABLED: "true",
    AI_PROVIDER: "openrouter",
    AI_MODEL: process.env.AI_MODEL || "openrouter/free",
  };
  const result = await runProcurementAgent(
    {
      read: async () => m,
      act: async (command) => {
        console.log(`Tool selected: ${command.type}`);
        if (command.type !== "ask_requirements")
          throw new Error("This probe only allows requirement clarification");
        return applyCommand(m, command, Date.now());
      },
    },
    { env, signal: AbortSignal.timeout(60000) },
  );
  if (!m.question)
    throw new Error("Model did not invoke the clarification tool");
  console.log(
    JSON.stringify({
      result: "PASS",
      model: env.AI_MODEL,
      question: m.question,
      output: result.finalOutput,
    }),
  );
}
main().catch((error) => {
  let message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Model probe failed";
  for (const [key, value] of Object.entries(process.env))
    if (value && /KEY|TOKEN|SECRET/.test(key))
      message = message.replaceAll(value, "[redacted]");
  console.error(message.slice(0, 1500));
  process.exitCode = 1;
});
