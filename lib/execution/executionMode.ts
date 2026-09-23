/**
 * Application execution-mode policy for Somebody financial signing/submission.
 *
 * This is an application-owned boundary, not a UI label. It gates which
 * networks may reach wallet signing / transaction submission. Read-only
 * discovery and challenge inspection may remain available where callers
 * deliberately avoid the signing path.
 *
 *   disabled      — default; no financial signing/submission
 *   testnet_demo  — ONLY X Layer Testnet (eip155:1952) may sign/submit
 *   mainnet_live  — exposes the Mainnet execution boundary for future use;
 *                   this lane does not authorize Mainnet signing
 */

export const XLAYER_TESTNET_CAIP2 = "eip155:1952" as const;
export const XLAYER_MAINNET_CAIP2 = "eip155:196" as const;

export type SomebodyExecutionMode =
  | "disabled"
  | "testnet_demo"
  | "mainnet_live";

export const SOMEBODY_EXECUTION_MODE_ENV = "SOMEBODY_EXECUTION_MODE" as const;
export const DEFAULT_SOMEBODY_EXECUTION_MODE: SomebodyExecutionMode = "disabled";

export function parseSomebodyExecutionMode(
  raw: string | null | undefined,
): SomebodyExecutionMode {
  const value = (raw ?? "").trim();
  if (!value || value === "disabled") return "disabled";
  if (value === "testnet_demo") return "testnet_demo";
  if (value === "mainnet_live") return "mainnet_live";
  // Unknown values fail closed rather than inventing a mode.
  return "disabled";
}

export function readSomebodyExecutionMode(
  env: NodeJS.ProcessEnv = process.env,
): SomebodyExecutionMode {
  return parseSomebodyExecutionMode(env[SOMEBODY_EXECUTION_MODE_ENV]);
}

/** Networks that may appear in rail config for a mode (empty when disabled). */
export function allowedNetworksForExecutionMode(
  mode: SomebodyExecutionMode,
): readonly string[] {
  if (mode === "testnet_demo") return [XLAYER_TESTNET_CAIP2];
  if (mode === "mainnet_live") return [XLAYER_MAINNET_CAIP2];
  return [];
}

/**
 * Whether this process may attempt financial signing/submission at all.
 * Mainnet live signing is deliberately not authorized in this build lane
 * even when the mode string is set — preserve the boundary without paying.
 */
export function isFinancialSigningEnabled(
  mode: SomebodyExecutionMode,
  options: { supervisedExecutionEnabled?: boolean } = {},
): boolean {
  if (mode === "disabled") return false;
  if (mode === "mainnet_live") return false;
  if (mode === "testnet_demo") {
    return options.supervisedExecutionEnabled === true;
  }
  return false;
}

/**
 * Hard gate immediately before wallet signing / transaction submission.
 * Refuses Mainnet (and any non-Testnet network) when mode is testnet_demo.
 */
export function assertNetworkMaySignOrSubmit(
  mode: SomebodyExecutionMode,
  network: string,
): void {
  const trimmed = (network ?? "").trim();
  if (mode === "disabled") {
    throw new Error(
      "SOMEBODY_EXECUTION_MODE=disabled refuses financial signing/submission",
    );
  }
  if (mode === "testnet_demo") {
    if (trimmed !== XLAYER_TESTNET_CAIP2) {
      throw new Error(
        `SOMEBODY_EXECUTION_MODE=testnet_demo refuses non-Testnet execution target ${trimmed || "(empty)"} before signing (only ${XLAYER_TESTNET_CAIP2} is permitted)`,
      );
    }
    return;
  }
  if (mode === "mainnet_live") {
    throw new Error(
      "SOMEBODY_EXECUTION_MODE=mainnet_live signing/submission is not authorized in this lane",
    );
  }
  throw new Error(
    `SOMEBODY_EXECUTION_MODE=${String(mode)} refuses financial signing/submission`,
  );
}

/** True when a composed Mainnet offering must be refused under testnet_demo. */
export function isMainnetExecutionTarget(network: string): boolean {
  return (network ?? "").trim() === XLAYER_MAINNET_CAIP2;
}
