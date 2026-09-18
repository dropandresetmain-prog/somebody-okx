/**
 * Official Onchain OS CLI discovery bridge.
 *
 * Parses machine-readable JSON from:
 *   onchainos agent service-match --keywords …
 *   onchainos agent search --query …
 *   onchainos agent service-list --agent-id …
 *
 * This module has NO provider-name conditionals and grants NO spend authority.
 * Output is untrusted MarketOffering[] until registry + assessment.
 */

import { spawn } from "node:child_process";
import type { MarketOffering, OfferingPrice } from "./discovery";

export type OkxCliRunner = (args: string[]) => Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}>;

export type OkxServiceMatchRow = {
  asp?: {
    aspAgentId?: string | number;
    aspName?: string;
    securityRate?: number | null;
    feedbackRate?: number | null;
    soldCount?: number | null;
  };
  serviceId?: string;
  sid?: string | number;
  serviceName?: string;
  serviceDescription?: string;
  serviceType?: string;
  feeAmount?: number | string | null;
  feeToken?: string | null;
  feeTokenSymbol?: string | null;
};

export type OkxDiscoveryParseResult = {
  offerings: MarketOffering[];
  raw: unknown;
  command: string[];
};

const DEFAULT_LIMIT = 5;
const HARD_CAP = 10;

/** Extract keyword tokens from a need/task description (≥4 chars). */
export function keywordsFromTaskDescription(
  taskDescription: string,
  max = 10,
): string[] {
  const words = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  const unique: string[] = [];
  for (const w of words) {
    if (!unique.includes(w)) unique.push(w);
    if (unique.length >= max) break;
  }
  return unique.length > 0 ? unique : ["service"];
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function priceFromRow(row: OkxServiceMatchRow): OfferingPrice | null {
  if (row.feeAmount === null || row.feeAmount === undefined) return null;
  const amount =
    typeof row.feeAmount === "number"
      ? String(row.feeAmount)
      : String(row.feeAmount).trim();
  if (!amount) return null;
  const asset =
    asString(row.feeTokenSymbol) ?? asString(row.feeToken) ?? "UNKNOWN";
  return { amount, asset, unit: "per_use" };
}

/**
 * Map one service-match row into an untrusted MarketOffering.
 * compatibleResourceClasses stays [] — registry fills them later.
 */
export function offeringFromServiceMatchRow(
  row: OkxServiceMatchRow,
  retrievedAt: number,
): MarketOffering | null {
  const providerId = asString(row.asp?.aspAgentId);
  const serviceId =
    asString(row.sid) ??
    asString(row.serviceId) ??
    null;
  if (!providerId || !serviceId) return null;
  const name = asString(row.serviceName) ?? `service:${serviceId}`;
  const description =
    asString(row.serviceDescription) ??
    asString(row.asp?.aspName) ??
    name;
  return {
    offeringId: `${providerId}:${serviceId}`,
    providerId,
    serviceId,
    name,
    description,
    price: priceFromRow(row),
    source: {
      kind: "okx_cli",
      retrievedAt,
      raw: row,
    },
    compatibleResourceClasses: [],
  };
}

/**
 * Parse `onchainos agent service-match` JSON stdout.
 * Accepts either `{ ok, data: { services: [...] } }` or a bare services array.
 */
export function parseServiceMatchStdout(
  stdout: string,
  input: { command: string[]; retrievedAt?: number; limit?: number },
): OkxDiscoveryParseResult {
  const retrievedAt = input.retrievedAt ?? Date.now();
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, HARD_CAP);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("okx discovery: service-match stdout is not JSON");
  }

  const root = parsed as {
    ok?: boolean;
    error?: string;
    data?: { services?: unknown };
    services?: unknown;
  };
  if (root && root.ok === false) {
    throw new Error(
      `okx discovery: service-match failed: ${root.error ?? "unknown error"}`,
    );
  }

  const servicesUnknown =
    root?.data?.services ?? root?.services ?? [];
  if (!Array.isArray(servicesUnknown)) {
    throw new Error("okx discovery: service-match missing services array");
  }

  const offerings: MarketOffering[] = [];
  for (const row of servicesUnknown) {
    const offering = offeringFromServiceMatchRow(
      row as OkxServiceMatchRow,
      retrievedAt,
    );
    if (offering) offerings.push(offering);
    if (offerings.length >= limit) break;
  }

  return { offerings, raw: parsed, command: input.command };
}

/**
 * Build argv for need-driven service-match (no job id, no provider name).
 */
export function buildServiceMatchArgs(input: {
  taskDescription: string;
  limit?: number;
}): string[] {
  const keywords = keywordsFromTaskDescription(input.taskDescription);
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, HARD_CAP);
  return [
    "agent",
    "service-match",
    "--keywords",
    ...keywords,
    "--limit",
    String(limit),
  ];
}

/**
 * Default runner: spawn local `onchainos` / `onchainos.exe`.
 * Returns ok:false when the binary is missing or non-zero without JSON.
 */
export function createLocalOnchainosRunner(
  binary = process.platform === "win32" ? "onchainos.exe" : "onchainos",
): OkxCliRunner {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(binary, args, {
        windowsHide: true,
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      child.on("error", (err) => {
        resolve({
          ok: false,
          stdout,
          stderr: `${stderr}\n${err.message}`.trim(),
          exitCode: null,
        });
      });
      child.on("close", (code) => {
        resolve({
          ok: code === 0,
          stdout,
          stderr,
          exitCode: code,
        });
      });
    });
}
