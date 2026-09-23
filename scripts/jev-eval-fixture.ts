/**
 * Read-only eval runner for the Jev option-selector adapter.
 *
 * Invokes selectEligibleOption() against a supplied fixture (a JSON file
 * shaped like { requirement: JevRequirementContext; eligible: GroundedOption[] })
 * or, with no fixture given, a small built-in demo shaped like a real
 * recommendation boundary. Makes a REAL call through Vercel AI Gateway to
 * typesafe-ai/jev — no transaction, no payment, no live Objective execution.
 *
 * This exists so the later integration lane can feed it real
 * recommendation-boundary snapshots once the backend stabilizes. It is
 * intentionally tiny — not a benchmark harness.
 *
 * Usage:
 *   npx tsx scripts/jev-eval-fixture.ts [--env-file=.env.local] [fixture.json]
 */
import { readFileSync } from "fs";
import { selectEligibleOption } from "../lib/management/jev/selectEligibleOption";
import type { JevOptionSelectionInput } from "../lib/management/jev/types";

function loadEnv(argv: string[]) {
  let envFile = ".env.local";
  for (const a of argv) if (a.startsWith("--env-file=")) envFile = a.slice("--env-file=".length);
  const text = readFileSync(envFile, "utf8");
  const m = text.match(/^\s*AI_GATEWAY_API_KEY\s*=\s*(.+)$/m);
  if (!m) throw new Error(`AI_GATEWAY_API_KEY missing in ${envFile}`);
  process.env.AI_GATEWAY_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
}

const DEMO_FIXTURE: JevOptionSelectionInput = {
  requirement: {
    requirementKey: "req_demo",
    title: "Acquire proprietary market pricing data",
    mustBeTrue: "Proprietary market pricing data for the target sector has been acquired.",
    scope: "one-time data acquisition for the current objective only",
    expectedOutput: "a licensed pricing dataset",
    requiredResourceClasses: ["proprietary_data"],
  },
  eligible: [
    {
      optionId: "opt_external_newsliquid",
      requirementKey: "req_demo",
      contractRevision: 1,
      kind: "external",
      strategy: "BUY",
      internal: null,
      external: {
        offeringId: "newsliquid:market-pricing-feed",
        providerId: "newsliquid",
        serviceId: "market-pricing-feed",
        resourceClass: "proprietary_data",
        priceUsd: 4.5,
        priceSource: "measured",
        registryVerified: true,
        compatibleResourceClass: true,
        executionPathConfigured: true,
        purposeScopeCompatible: true,
      },
      facts: {
        scope: "sector-wide pricing snapshot",
        expectedQuality: null,
        setupMinutes: null,
        queueMinutes: null,
        executionMinutes: null,
        verificationMinutes: null,
        internalCostUsd: null,
        externalPriceUsd: null,
        reliability: null,
        availability: null,
        reuseValue: null,
        externalAdvantage: null,
      },
      eligibility: { eligible: true, checksPassed: ["registry_verified", "execution_path_configured", "purpose_scope_compatible"] },
    },
    {
      optionId: "opt_external_xbird",
      requirementKey: "req_demo",
      contractRevision: 1,
      kind: "external",
      strategy: "BUY",
      internal: null,
      external: {
        offeringId: "xbird:sector-pricing-bundle",
        providerId: "xbird",
        serviceId: "sector-pricing-bundle",
        resourceClass: "proprietary_data",
        priceUsd: 12,
        priceSource: "measured",
        registryVerified: true,
        compatibleResourceClass: true,
        executionPathConfigured: true,
        purposeScopeCompatible: true,
      },
      facts: {
        scope: "broader bundle, includes adjacent sectors",
        expectedQuality: null,
        setupMinutes: null,
        queueMinutes: null,
        executionMinutes: null,
        verificationMinutes: null,
        internalCostUsd: null,
        externalPriceUsd: null,
        reliability: null,
        availability: null,
        reuseValue: null,
        externalAdvantage: null,
      },
      eligibility: { eligible: true, checksPassed: ["registry_verified", "execution_path_configured", "purpose_scope_compatible"] },
    },
  ],
};

async function main() {
  const argv = process.argv.slice(2);
  loadEnv(argv);
  const fixturePath = argv.find((a) => !a.startsWith("--"));
  const input: JevOptionSelectionInput = fixturePath
    ? (JSON.parse(readFileSync(fixturePath, "utf8")) as JevOptionSelectionInput)
    : DEMO_FIXTURE;

  console.error(`[jev-eval-fixture] ${input.eligible.length} eligible option(s), requirement ${input.requirement.requirementKey}`);
  const t0 = Date.now();
  const result = await selectEligibleOption(input);
  console.log(JSON.stringify({ latencyMs: Date.now() - t0, result }, null, 2));
  if (result.kind === "unavailable" || result.kind === "invalid_response") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
