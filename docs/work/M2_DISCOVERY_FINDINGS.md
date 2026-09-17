# M2 Discovery Findings

Status: **Discovery research complete — no supported programmatic primitive confirmed**
Date: 2026-09-17
Lane: B (Market Discovery)

## Research Conducted

### 1. npm registry search

| Query | Result |
|-------|--------|
| `npm view @okx/agent` | **404 Not Found** — package does not exist |
| `npm search okx-agent` | Found `desic-okx-agent` (third-party, not official OKX), `hvip-mcp-server` (third-party OKX REST wrapper), `agent-tradekit-cli` (trading CLI by `okx_retail`, not agent discovery) |
| `npm view okx-cli` | **Unrelated placeholder** — v0.0.0, maintainer `scriptpower`, no OKX affiliation, 746 bytes unpacked |

### 2. Official OKX.AI documentation review

**Pages fetched and analyzed:**
- `https://web3.okx.com/onchainos/dev-docs/okxai/asp-introduction`
- `https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp`

**Findings:**
- ASP docs describe the marketplace concept: A2A (negotiated) and A2MCP (fixed-price per call) service types.
- "Active order taking" is mentioned — agents can search for matching public tasks — but this is described as a **UI/prompt workflow inside OKX.AI**, not an externally callable API or CLI.
- A2MCP guide covers how ASPs register endpoints (free or x402 pay-per-call), but does NOT document any consumer-side discovery API.
- No mention of `agent search`, `agent service-list`, or `agent asp-match` as documented CLI commands or programmatic endpoints.
- No SDK, REST API, or machine-readable discovery surface for searching/listing agent services from outside OKX.AI.

### 3. Contract-mentioned primitives

The shared contract (§4) mentions `agent search`, `agent service-list`, `agent asp-match` as concepts. However:
- These appear to be OKX.AI internal/marketplace UI concepts, not documented external APIs.
- No CLI binary, npm package, or programmatic endpoint was found that implements them.
- The OKX.AI FAQ page and agent installation guide were not separately fetched but the main docs make clear that discovery is a marketplace-internal workflow.

## Conclusion

**No supported official OKX programmatic discovery primitive was confirmed.**

- No official npm package for agent/service discovery exists.
- No documented REST API or CLI for `agent search` / `agent service-list` / `agent asp-match` exists in the public docs.
- The `agent-tradekit-cli` package is for trading, not agent discovery.
- Scraping OKX.AI HTML is explicitly forbidden by the contract and would be fragile/unreliable.

## Implementation Decision

**Snapshot is the primary discovery path.**

- `lib/market/snapshotData.ts` — small synchronized snapshot of the 4 demo offerings.
- `lib/market/snapshotDiscovery.ts` — `MarketDiscovery` impl filtering by resourceClass + task keywords.
- `lib/market/okxDiscovery.ts` — adapter behind the same `MarketDiscovery` interface, currently delegates to snapshot. Clearly documented as the file to replace when a founder-gated live CLI integration becomes available.

## Founder-Gated Next Steps

When/if OKX releases an official agent discovery CLI or SDK:

1. Install the official package.
2. Implement `createOkxDiscovery()` to shell out to the CLI or call the SDK from a **Next.js server bridge** (NOT from a Convex Node action — CLI tools may need filesystem/network access that Convex restricts).
3. Parse machine-readable JSON output into `MarketOffering[]`.
4. Pass results through the verified service registry before use.
5. The `MarketDiscovery` interface remains unchanged — only `okxDiscovery.ts` changes.
