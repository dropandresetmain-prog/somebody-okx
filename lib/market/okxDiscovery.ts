import type { MarketDiscovery, MarketDiscoveryInput, MarketOffering } from "./discovery";
import { createSnapshotDiscovery } from "./snapshotDiscovery";

/**
 * OKX discovery adapter — behind the MarketDiscovery interface.
 *
 * DISCOVERY FINDINGS (see docs/work/M2_DISCOVERY_FINDINGS.md):
 *
 * No supported official OKX programmatic discovery primitive was confirmed during
 * this pass. Specifically:
 *
 * - `@okx/agent` npm package does not exist (404).
 * - `okx-cli` on npm is an unrelated placeholder package (0.0.0, no OKX affiliation).
 * - `agent-tradekit-cli` is a trading CLI, not an agent/service discovery tool.
 * - OKX.AI official docs (asp-introduction, howtomcp) describe the marketplace
 *   concept and ASP registration but do NOT document any programmatic API, CLI
 *   command, or SDK for agent search, agent service-list, or agent asp-match.
 * - The docs mention "active order taking" where agents search for matching public
 *   tasks, but this is described as a UI/prompt workflow inside OKX.AI, not an
 *   externally callable API.
 *
 * CONCLUSION: No supported programmatic primitive exists → snapshot is the primary
 * discovery path. This adapter delegates to the snapshot implementation and
 * maintains the same MarketDiscovery interface so that when/if a founder-gated
 * live CLI integration becomes available, only this file needs to change.
 *
 * FUTURE: If OKX releases an official agent discovery CLI/SDK, implement it here
 * behind the same MarketDiscovery interface. The adapter should:
 * - Shell out to the CLI or call the SDK from a Next.js server bridge (NOT from
 *   a Convex Node action, since CLI tools may require filesystem/network access
 *   that Convex actions restrict).
 * - Parse machine-readable output (JSON) into MarketOffering[].
 * - Still pass results through the verified service registry before use.
 */

export function createOkxDiscovery(): MarketDiscovery {
  // Delegate to snapshot — the only confirmed-safe discovery path.
  const snapshot = createSnapshotDiscovery();

  return {
    async discover(input: MarketDiscoveryInput): Promise<MarketOffering[]> {
      // When a live CLI integration is available, replace this delegation.
      return snapshot.discover(input);
    },
  };
}
