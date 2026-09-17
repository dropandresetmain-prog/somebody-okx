# M3 OKX Payment Rail Readiness

**Access date:** 2026-09-17  
**Status:** Research complete; one design constraint and one token discrepancy to resolve before M3 integration

---

## 1. X Layer Testnet Chain Identity

| Fact | Value | Source | Confidence |
|------|-------|--------|------------|
| Canonical name | X Layer testnet | OKX official docs | VERIFIED |
| Chain ID (decimal) | 1952 | OKX official docs | VERIFIED |
| Chain ID (hex) | 0x7A0 | OKX official docs | VERIFIED |
| CAIP-2 / EIP-155 form | `eip155:1952` | Derived from chain ID | VERIFIED |
| Token symbol | OKB | OKX official docs | VERIFIED |
| Block explorer | https://www.okx.com/web3/explorer/xlayer-test | OKX official docs | VERIFIED |

**Source:** https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information  
**Access date:** 2026-09-17

**Repo assertion check:** ARCHITECTURE.md §14 and MASTER_PLAN.md M3 assert `eip155:1952`. **VERIFIED CORRECT.**

---

## 2. RPC Endpoint Expectations

| Property | Value | Confidence |
|----------|-------|------------|
| Primary testnet RPC | `https://testrpc.xlayer.tech/terigon` | VERIFIED |
| Secondary testnet RPC | `https://xlayertestrpc.okx.com/terigon` | VERIFIED |
| Transport | HTTPS JSON-RPC | VERIFIED |
| Authentication | None required (public) | VERIFIED |
| Rate limit | 100 requests/second/IP | VERIFIED |
| Sandbox reachability | **REACHABLE** via POST JSON-RPC (GET returns 405) | VERIFIED |

**Source:** https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints  
**Access date:** 2026-09-17

**Reachability test:** Both endpoints reachable via POST JSON-RPC. GET returns HTTP 405 Method Not Allowed (successful reach, not a block). Confirmed via live probe:
```bash
curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' https://testrpc.xlayer.tech/terigon
# Returns: {"jsonrpc":"2.0","result":"0x7a0","id":1}
```
Chain ID 0x7a0 = 1952 decimal. Independent on-chain confirmation of eip155:1952.

**Supported JSON-RPC methods:** Standard Ethereum methods including `eth_chainId`, `eth_blockNumber`, `eth_getBalance`, `eth_sendRawTransaction`, `eth_call`, etc. Full list in source.

---

## 3. Test Token / Faucet Flow

| Fact | Value | Source | Confidence |
|------|-------|--------|------------|
| Faucet URL | https://www.okx.com/xlayer/faucet/xlayerfaucet | OKX official docs | VERIFIED |
| Gas token | Test OKB | OKX official docs | VERIFIED |
| Payment token | Test USD₮0 | OKX official docs | VERIFIED |
| Per-address limits | Not documented | — | UNVERIFIED |
| Prerequisites | Not documented (wallet registration? cap? region?) | — | UNVERIFIED |

**Source:** https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk (testnet verification section)  
**Access date:** 2026-09-17

**Open uncertainty:** Faucet limits, prerequisites, and regional restrictions are not documented. Must be discovered empirically during M3 integration.

---

## 4. OKX Mock Merchant

| Fact | Value | Source | Confidence |
|------|-------|--------|------------|
| Exists | Yes | OKX official docs | VERIFIED |
| Endpoint | `https://www.okx.com/api/v1/pay/mock-merchant/resource` | OKX official docs | VERIFIED |
| Deployment | X Layer Testnet | OKX official docs | VERIFIED |
| Purpose | Reference implementation for x402 seller integration | OKX official docs | VERIFIED |
| Payment-required behavior | Returns HTTP 402 with payment terms in JSON body | Live probe | VERIFIED |

**Source:** https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk  
**Access date:** 2026-09-17

**Note:** Mock Merchant is described as "the official Mock Merchant" and is deployed on X Layer Testnet. It serves as a reference for the full x402 buyer lifecycle: `request → 402 → inspect terms → authorize/sign → pay → retry → resource/receipt`.

**Sandbox reachability:** Endpoint is reachable. Confirmed via live probe:
```bash
curl -s -D - -o /tmp/mh.body --max-time 15 https://www.okx.com/api/v1/pay/mock-merchant/resource
# Returns: HTTP/2 402 with JSON body containing payment terms
```

---

## 5. x402 Protocol Specification

### 5.1 Request/Response Flow

| Step | Direction | Action | Confidence |
|------|-----------|--------|------------|
| 1 | Client → Server | HTTP request to protected resource | VERIFIED |
| 2 | Server → Client | HTTP 402 Payment Required + `PAYMENT-REQUIRED` header | VERIFIED |
| 3 | Client | Parse `PAYMENT-REQUIRED` header (Base64-encoded JSON) | VERIFIED |
| 4 | Client | Select payment requirement matching client's scheme/network | VERIFIED |
| 5 | Client | Sign payment payload via x402 SDK | VERIFIED |
| 6 | Client → Server | Retry request with `PAYMENT-SIGNATURE` header | VERIFIED |
| 7 | Server | Verify signature, attempt settlement via facilitator | VERIFIED |
| 8 | Server → Client | Return resource + `PAYMENT-RESPONSE` header | VERIFIED |

**Source:** https://docs.x402.org/core-concepts/http-402, https://docs.x402.org/faq  
**Access date:** 2026-09-17

### 5.2 Header Formats

| Header | Direction | Content | Format | Confidence |
|--------|-----------|---------|--------|------------|
| `PAYMENT-REQUIRED` | Server → Client | Payment requirements | Base64-encoded JSON `PaymentRequired` object | VERIFIED (x402 spec) |
| `PAYMENT-SIGNATURE` | Client → Server | Signed payment payload | Base64-encoded JSON `PaymentPayload` object | VERIFIED (x402 spec) |
| `PAYMENT-RESPONSE` | Server → Client | Settlement response | Base64-encoded JSON `SettlementResponse` object | VERIFIED (x402 spec) |

**Source:** https://docs.x402.org/core-concepts/http-402  
**Access date:** 2026-09-17

**⚠️ OKX Implementation Divergence:** The live OKX Mock Merchant does NOT use the `PAYMENT-REQUIRED` header. Instead, it returns payment terms directly in the JSON response body. This is a deviation from the x402 specification. M3 integration must handle both formats: header-based (per spec) and body-based (per OKX implementation).

### 5.3 Payment Requirements Structure (from 402 response)

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/weather",
    "description": "Weather data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "1000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0xYourEvmAddress",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

**Key fields:**
- `scheme`: Payment semantics (`exact`, `upto`, `batch-settlement`)
- `network`: CAIP-2 identifier (e.g., `eip155:84532` for Base Sepolia)
- `amount`: Payment amount in atomic units (string)
- `asset`: Token contract address
- `payTo`: Recipient address
- `maxTimeoutSeconds`: Authorization validity window
- `extra`: Scheme-specific metadata (EIP-712 name/version for EVM)

**Source:** https://docs.x402.org/schemes/overview  
**Access date:** 2026-09-17

### 5.4 Payment Schemes

| Scheme | Semantics | Description | Confidence |
|--------|-----------|-------------|------------|
| `exact` | Fixed-price | Buyer authorizes exactly the advertised amount | VERIFIED |
| `upto` | Usage-based | Buyer authorizes maximum, seller charges actual usage | VERIFIED |
| `batch-settlement` | High-frequency | Buyer deposits to escrow, pays with off-chain vouchers, batched onchain settlement | VERIFIED |
| `aggr_deferred` | Unknown | **Observed live** as the second entry in the Mock Merchant's `accepts[]`, with identical network/amount/asset/payTo to `exact`. Not documented in the x402 open-protocol scheme list. Assumed to be an OKX-specific aggregation/deferred-settlement scheme. | OBSERVED — NOT YET UNDERSTOOD |

**Source:** https://docs.x402.org/schemes/overview  
**Access date:** 2026-09-17

**Live-observed field-name divergence:** the open-protocol reference structure above uses `amount`, but the live OKX Mock Merchant returns **`maxAmountRequired`** (string, atomic units) in its `accepts[]` entries. M3 must parse the OKX field name, not the doc's. Raw evidence in `M3_PROBE_RESULTS.md`.

**M3 selection rule:** `exact` is the recommended scheme for the M3 proof. Treat `aggr_deferred` as present-but-unused until its semantics are documented.

### 5.5 Network Identifiers

x402 uses CAIP-2 format: `namespace:reference`

- EVM: `eip155:<chainId>` (e.g., `eip155:8453` for Base mainnet, `eip155:84532` for Base Sepolia)
- Solana: `solana:<genesisHash>`
- TON: `tvm:<workchain>`
- Others: Algorand, Stellar, Aptos, Hedera, Keeta, NEAR, Concordium, XRPL, Cardano

**Source:** https://docs.x402.org/core-concepts/network-and-token-support  
**Access date:** 2026-09-17

---

## 6. SDK / Package Names and Versions

| Package | Purpose | Source | Confidence |
|---------|---------|--------|------------|
| `@okxweb3/x402-express` | Express middleware for x402 seller | OKX official docs | VERIFIED |
| `@okxweb3/x402-core` | Core x402 protocol logic | OKX official docs | VERIFIED |
| `@okxweb3/x402-evm` | EVM-specific scheme implementations | OKX official docs | VERIFIED |
| `@x402/core` | Alternative core package (x402 foundation) | x402 official docs | VERIFIED |
| `@x402/evm` | Alternative EVM package (x402 foundation) | x402 official docs | VERIFIED |

**Current versions:** Not documented in official sources. Must be verified via npm registry during M3 integration.

**Source:** https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk  
**Access date:** 2026-09-17

**Note:** Two package namespaces exist:
1. `@okxweb3/*` — OKX-specific packages
2. `@x402/*` — x402 foundation packages (open protocol)

Both appear valid. The OKX docs use `@okxweb3/*` in their examples.

---

## 7. Network Identifiers and Testnet/Mainnet Selection

| Network | CAIP-2 | Environment | Confidence |
|---------|--------|-------------|------------|
| X Layer Mainnet | `eip155:196` | Production | VERIFIED |
| X Layer Testnet | `eip155:1952` | Development | VERIFIED |
| Base Mainnet | `eip155:8453` | Production | VERIFIED |
| Base Sepolia | `eip155:84532` | Development | VERIFIED |

**Testnet vs mainnet selection:** Explicit configuration in code. Example from OKX docs:

```typescript
const NETWORK = "eip155:1952";   // X Layer Testnet
// vs
const NETWORK = "eip155:196";    // X Layer Mainnet
```

**Source:** https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk  
**Access date:** 2026-09-17

---

## 8. Receipt / Settlement Observability

| Aspect | Observable? | How | Confidence |
|--------|-------------|-----|------------|
| Payment submitted | Yes | Transaction hash from wallet/signing | VERIFIED |
| Payment settled | Yes | `PAYMENT-RESPONSE` header from server | VERIFIED |
| Settlement confirmed onchain | Yes | Block explorer (transaction receipt) | VERIFIED |
| External result received | Yes | HTTP response from resource endpoint | VERIFIED |
| Result verified | Partially | Application must independently verify result matches expectations | PARTIALLY VERIFIED |
| Facilitator settlement proof | Yes | Facilitator provides settlement confirmation | VERIFIED |

**Source:** https://docs.x402.org/core-concepts/http-402, https://docs.x402.org/faq  
**Access date:** 2026-09-17

**Critical distinction:** Submission ≠ Settlement ≠ Verification. Three distinct facts:
1. **Submission:** Client signed and sent payment payload
2. **Settlement:** Facilitator confirmed onchain transfer
3. **Verification:** Application independently confirmed result matches expectations

---

## 9. Testnet Limitations and Known Caveats

| Limitation | Status | Source | Confidence |
|------------|--------|--------|------------|
| Third-party OKX.AI providers on testnet | **NOT automatically mirrored** | ARCHITECTURE.md §14 | UNVERIFIED (repo assertion) |
| Faucet rate limits | Unknown | — | UNVERIFIED |
| Faucet prerequisites | Unknown | — | UNVERIFIED |
| Mock Merchant availability | **REACHABLE** — probed, HTTP 402 observed | Live probe | VERIFIED |
| x402 default facilitator supports X Layer Testnet | **NO** — see §10 constraint | x402 official docs | VERIFIED (negative) |

**Source:** ARCHITECTURE.md §14, https://docs.x402.org/core-concepts/network-and-token-support  
**Access date:** 2026-09-17

### 9.1 TOKEN DISCREPANCY — top open item for M3

The live Mock Merchant and OKX's own documentation disagree on BOTH the payment token name and its contract address:

| Source | Token name | Contract address | Access date |
|---|---|---|---|
| LIVE Mock Merchant 402 (observed in this sandbox; raw evidence in `M3_PROBE_RESULTS.md`) | `USDC_TEST` | `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d` | 2026-09-17 |
| OKX buyer-guide doc example | `USD₮0` | `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c` | 2026-09-17 |
| Repo plan (ACTIVE_TASK.md / MASTER_PLAN.md M3) | test `USD₮0` | not stated | — |

**Implication for M3:** the buyer rail MUST consume asset / payTo / amount / EIP-712 `extra.name` + `extra.version` dynamically from the live 402 `accepts[]` entry, and MUST NOT hardcode either address or a token name. The EIP-712 name/version pair is exactly what a buyer signs for EIP-3009; hardcoding the wrong pair is a real signing failure mode, not a cosmetic one. The `payTo` recipient (`0x3509655ad99effc7f3f74205482b1cb337ca08f7`) must likewise be read from the live response rather than assumed. Treat all of these fields as seller-asserted and bind them before signing per the accepted architecture.

---

## 10. Facilitator Constraint — Investigate Now

### The x402.org DEFAULT facilitator does not settle X Layer Testnet

**Finding (accurate, remains VERIFIED-negative):** the x402.org default facilitator lists Base Sepolia (`eip155:84532`), Solana Devnet, Stellar Testnet, Aptos Testnet, Hedera Testnet and XRPL Testnet. X Layer (mainnet or testnet) is absent. https://docs.x402.org/core-concepts/network-and-token-support, accessed 2026-09-17.

**What this does NOT mean:** it does not invalidate the accepted M3 plan. The repo's M3 rail is OKX's OWN Mock Merchant on X Layer Testnet, and OKX's own buyer guide runs the complete flow there — the live 402 observed in this sandbox advertises `network: eip155:1952`, and the documented flow returns a `txHash` verifiable on OKLink X Layer Testnet. X Layer Testnet settlement therefore demonstrably works through OKX's rail. https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer, accessed 2026-09-17.

**The real constraint, correctly scoped:** do not point a generic `@x402/*` buyer client at the x402.org default facilitator and expect X Layer Testnet settlement. Settlement must go via OKX's payment rail/facilitator, or a self-hosted facilitator, or self-facilitation. x402 docs state the operational question is whether you have a settlement path for the network.

**Recommended action:** before M3 integration, confirm which facilitator the OKX buyer SDK/Onchain OS path uses for `eip155:1952`, and make that an explicit founder decision rather than an implicit default.

**Classification:** `Investigate Now` — a concrete M3 design constraint plus one named decision. Not a plan-invalidator.

---

## 11. Exact Founder Actions / Secrets Required Before M3 Can Integrate

The following human decisions, accounts, and environment variables are required. This lane did NOT create or request any of them:

1. **Funded testnet wallet:**
   - One EVM-compatible wallet address on X Layer Testnet
   - Funded with test OKB (gas) from https://www.okx.com/xlayer/faucet/xlayerfaucet
   - Funded with test USD₮0 (payment token) from the same faucet
   - Private key must be available for signing (never logged, never committed)

2. **Environment variables (never committed to git):**
   - `XLAYER_TESTNET_WALLET_ADDRESS` — the funded testnet wallet address
   - `XLAYER_TESTNET_WALLET_PRIVATE_KEY` — the private key for signing (secure storage required)
   - `OKX_API_KEY` — OKX Developer Portal API key (if using OKX facilitator)
   - `OKX_SECRET_KEY` — OKX Developer Portal secret key
   - `OKX_PASSPHRASE` — OKX Developer Portal passphrase

3. **Decisions:**
   - Confirm which facilitator / settlement path to use on X Layer Testnet (`eip155:1952`) — OKX rail, self-hosted, or self-facilitation. The rail itself is not in question (see §10).
   - If X Layer Testnet: confirm whether OKX Mock Merchant operates its own facilitator, or deploy a self-hosted facilitator
   - Select payment scheme: `exact` (recommended for M3 proof)

4. **Accounts:**
   - OKX Developer Portal account (https://web3.okx.com/onchainos/dev-portal) for API keys

---

## 12. Open Uncertainties

| Uncertainty | What to try next | Confidence |
|-------------|------------------|------------|
| **Which token the live Mock Merchant actually settles** — live 402 says `USDC_TEST`, OKX doc example says `USD₮0` (see §9.1) | Resolve during M3: read `accepts[]` from the live 402 at runtime, never hardcode; confirm the faucet funds the token the 402 actually demands | UNVERIFIED — TOP OPEN ITEM |
| Which facilitator / settlement path the OKX buyer SDK uses for `eip155:1952` | Read the OKX buyer SDK source or run the documented testnet flow once with a founder-funded wallet (see §10) | UNVERIFIED |
| Faucet per-address limits and prerequisites | Attempt faucet claim during M3 integration with a fresh wallet; document observed limits | UNVERIFIED |
| Exact npm package versions for `@okxweb3/*` and `@x402/*` | Run `npm view @okxweb3/x402-express version` during M3 integration | UNVERIFIED |
| Whether third-party OKX.AI providers are mirrored on testnet | Test one provider during M3 integration; document result | UNVERIFIED |
| Settlement / `PAYMENT-RESPONSE` shape after payment | Requires an actual funded payment in M3 — NOT attempted here (out of lane bounds: no signing, no payment) | UNVERIFIED BY DESIGN |

---

## 13. Contradictions with Repo Planning Docs

| Repo assertion | Current docs say | Contradiction? | Action |
|----------------|------------------|----------------|--------|
| X Layer Testnet is `eip155:1952` | Confirmed `eip155:1952` | No | None |
| Use X Layer Testnet + Mock Merchant for M3 | Rail works — live 402 advertises `eip155:1952` and OKX documents the full testnet flow; but the x402.org *default* facilitator does not cover X Layer | Partial — constraint, not contradiction | Investigate Now (§10): choose the settlement facilitator explicitly |
| M3 pays with test USD₮0 | Live Mock Merchant advertises `USDC_TEST` at a different contract address (see §9.1) | **YES** | Investigate Now: read terms from the live 402 at runtime; do not hardcode |
| Third-party OKX.AI providers are not automatically mirrored on testnet | Not addressed in current docs | Unknown | Investigate during M3 |

---

## 14. Summary

**VERIFIED from authoritative docs or live observation:** ~50 discrete rows; **PARTIALLY VERIFIED:** 1; **UNVERIFIED (open):** 11 — see §12.

**Most important verified facts:**
1. X Layer Testnet chain ID `eip155:1952` (`0x7a0`) — confirmed from OKX docs AND independently on-chain via live `eth_chainId` on both public RPCs.
2. The OKX Mock Merchant is live and reachable, and returns the expected x402 `402 Payment Required` shape on X Layer Testnet — observed directly in this sandbox (raw evidence in `M3_PROBE_RESULTS.md`).
3. x402 payment terms for the OKX rail arrive in the JSON **body**, not a `PAYMENT-REQUIRED` header — live-observed divergence from the open-protocol spec.

**Biggest remaining unknown:** which payment token the live Mock Merchant actually settles (live 402 advertises `USDC_TEST`, OKX docs say `USD₮0` — see §9.1), and which facilitator the OKX buyer path uses for `eip155:1952` (see §10).

**No Act Now items.** The accepted M3 plan (X Layer Testnet + official Mock Merchant) stands: the rail is live and the chain ID is confirmed. The two open items above are `Investigate Now` design constraints to resolve during M3 integration, not plan-invalidators.

---

**End of readiness assessment.**
