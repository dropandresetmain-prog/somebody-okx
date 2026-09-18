import type { MarketDiscovery, MarketDiscoveryInput, MarketOffering } from "./discovery";
import { createSnapshotDiscovery } from "./snapshotDiscovery";
import {
  buildServiceMatchArgs,
  createLocalOnchainosRunner,
  parseServiceMatchStdout,
  type OkxCliRunner,
} from "./okxCliBridge";
import { VERIFIED_SERVICE_REGISTRY } from "./registryData";
import { resolveCompatibleClasses } from "./registry";

/**
 * Official OKX Onchain OS discovery adapter behind MarketDiscovery.
 *
 * Preferred path: `onchainos agent service-match` (need/keywords driven).
 * Snapshot is an EXPLICIT fallback only — every fallback offering carries
 * source.kind === "snapshot" and raw.fallbackReason (never silent degrade).
 *
 * Discovery output is UNTRUSTED. Registry + assessment authorize use.
 * This file must not live inside sourcing policy, Objective lifecycle,
 * worker runtime, or completion logic beyond injecting MarketDiscovery.
 */

export type OkxDiscoveryOptions = {
  /** Injected CLI runner (tests / bridge). Default: local onchainos spawn. */
  runner?: OkxCliRunner;
  /** When false, live failure throws instead of snapshot fallback. Default true. */
  allowSnapshotFallback?: boolean;
  /** Clock for retrievedAt. */
  now?: () => number;
};

function withRegistryClasses(offerings: MarketOffering[]): MarketOffering[] {
  return offerings.map((o) => ({
    ...o,
    compatibleResourceClasses: resolveCompatibleClasses(
      o,
      VERIFIED_SERVICE_REGISTRY,
    ),
  }));
}

function registryCompatible(
  offerings: MarketOffering[],
  resourceClass: MarketDiscoveryInput["resourceClass"],
): MarketOffering[] {
  return withRegistryClasses(offerings).filter((o) =>
    o.compatibleResourceClasses.includes(resourceClass),
  );
}

async function discoverLive(
  runner: OkxCliRunner,
  input: MarketDiscoveryInput,
  now: number,
): Promise<{ offerings: MarketOffering[]; command: string[]; raw: unknown }> {
  const command = buildServiceMatchArgs({
    taskDescription: input.taskDescription,
    limit: input.limit,
  });
  const result = await runner(command);
  if (!result.ok && !result.stdout.trim()) {
    throw new Error(
      `okx discovery CLI failed: ${result.stderr || `exit ${result.exitCode}`}`,
    );
  }
  const parsed = parseServiceMatchStdout(result.stdout, {
    command: ["onchainos", ...command],
    retrievedAt: now,
    limit: input.limit,
  });
  return {
    offerings: parsed.offerings,
    command: parsed.command,
    raw: parsed.raw,
  };
}

async function snapshotFallback(
  input: MarketDiscoveryInput,
  reason: string,
  liveMeta: { command?: string[]; liveCount?: number; liveError?: string },
  now: number,
): Promise<MarketOffering[]> {
  const snapshot = createSnapshotDiscovery();
  const base = await snapshot.discover(input);
  return base.map((o) => ({
    ...o,
    source: {
      kind: "snapshot" as const,
      retrievedAt: now,
      raw: {
        fallbackReason: reason,
        liveAttempted: true,
        ...(liveMeta.command ? { liveCommand: liveMeta.command } : {}),
        ...(liveMeta.liveCount !== undefined
          ? { liveOfferingCount: liveMeta.liveCount }
          : {}),
        ...(liveMeta.liveError ? { liveError: liveMeta.liveError } : {}),
        snapshotOfferingId: o.offeringId,
      },
    },
  }));
}

export function createOkxDiscovery(
  options: OkxDiscoveryOptions = {},
): MarketDiscovery {
  const runner = options.runner ?? createLocalOnchainosRunner();
  const allowSnapshotFallback = options.allowSnapshotFallback !== false;
  const nowFn = options.now ?? (() => Date.now());

  return {
    async discover(input: MarketDiscoveryInput): Promise<MarketOffering[]> {
      const now = nowFn();
      try {
        const live = await discoverLive(runner, input, now);
        const compatible = registryCompatible(live.offerings, input.resourceClass);
        if (compatible.length > 0) {
          // Live offerings that the application registry recognizes.
          return compatible;
        }
        if (!allowSnapshotFallback) {
          return withRegistryClasses(live.offerings);
        }
        // Live ran, but nothing maps to a verified resource class for this need.
        return snapshotFallback(
          input,
          "live_returned_no_registry_compatible_offerings",
          {
            command: live.command,
            liveCount: live.offerings.length,
          },
          now,
        );
      } catch (err) {
        if (!allowSnapshotFallback) throw err;
        const message = err instanceof Error ? err.message : String(err);
        return snapshotFallback(
          input,
          "live_cli_unavailable_or_failed",
          { liveError: message },
          now,
        );
      }
    },
  };
}
