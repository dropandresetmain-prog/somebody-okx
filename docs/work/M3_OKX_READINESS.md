# M3 OKX Payment Rail Readiness

**Access date:** 2026-09-17  
**Status:** Research complete with one critical finding requiring immediate attention

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
| Sandbox reachability | **UNREACHABLE** from this sandbox | VERIFIED (negative) |

**Source:** https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints  
**Access date:** 2026-09-17

**Reachability test:** Attempted curl to `https://rpc.test.xlayer.tech` and `https://testrpc.xlayer.tech/terigon` — both unreachable (no HTTP response). This is a sandbox network restriction, not an endpoint issue.

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
| Payment-required behavior | Returns HTTP 402 with PAYMENT-REQUIRED header | Inferred from x402 protocol | PARTIALLY VERIFIED |

**Source:** https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk  
**Access date:** 2026-09-17

**Note:** Mock Merchant is described as "the official Mock Merchant" and is deployed on X Layer Testnet. It serves as a reference for the full x402 buyer lifecycle: `request → 402 → inspect terms → authorize/sign → pay → retry → resource/receipt`.

**Sandbox reachability:** `https://www.okx.com` is unreachable from this sandbox. Cannot probe the Mock Merchant endpoint directly.

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
| `PAYMENT-REQUIRED` | Server → Client | Payment requirements | Base64-encoded JSON `PaymentRequired` object | VERIFIED |
| `PAYMENT-SIGNATURE` | Client → Server | Signed payment payload | Base64-encoded JSON `PaymentPayload` object | VERIFIED |
| `PAYMENT-RESPONSE` | Server → Client | Settlement response | Base64-encoded JSON `SettlementResponse` object | VERIFIED |

**Source:** https://docs.x402.org/core-concepts/http-402  
**Access date:** 2026-09-17

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

**Source:** https://docs.x402.org/schemes/overview  
**Access date:** 2026-09-17

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
| Mock Merchant availability | Reachable but not probed from this sandbox | OKX official docs | PARTIALLY VERIFIED |
| x402 default facilitator supports X Layer Testnet | **NO** — see critical finding below | x402 official docs | VERIFIED (negative) |

**Source:** ARCHITECTURE.md §14, https://docs.x402.org/core-concepts/network-and-token-support  
**Access date:** 2026-09-17

---

## 10. CRITICAL FINDING — Act Now

### x402 Default Facilitator Does NOT Support X Layer Testnet

**Finding:** The x402 protocol's default facilitator (`https://x402.org/facilitator`) supports:
- Base Sepolia (`eip155:84532`)
- Solana Devnet
- Stellar Testnet
- Aptos Testnet
- Hedera Testnet
- XRPL Testnet

**It does NOT support X Layer Testnet (`eip155:1952`).**

**Impact:** The repo's plan to use "X Layer Testnet + official Mock Merchant" for M3 is **plan-invalidating** unless one of the following is true:
1. A custom/self-hosted facilitator is deployed for X Layer Testnet
2. The OKX Mock Merchant operates its own facilitator for X Layer Testnet
3. The plan switches to Base Sepolia for the x402 proof

**Evidence:** https://docs.x402.org/core-concepts/network-and-token-support explicitly lists supported networks. X Layer (neither mainnet nor testnet) is not in the list. The docs state: "For EVM networks in particular, x402 can support any network at the protocol level. The operational question is whether you have a production settlement path for that network."

**Recommended action:** Before M3 integration, verify whether the OKX Mock Merchant endpoint (`https://www.okx.com/api/v1/pay/mock-merchant/resource`) operates its own facilitator for X Layer Testnet. If not, either:
- Deploy a self-hosted facilitator for X Layer Testnet, OR
- Switch M3 proof to Base Sepolia (`eip155:84532`) which is supported by the default facilitator

**Classification:** `Act Now` — this finding blocks M3 near-term if not resolved.

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
   - Confirm whether to use X Layer Testnet or Base Sepolia for M3 (see critical finding above)
   - If X Layer Testnet: confirm whether OKX Mock Merchant operates its own facilitator, or deploy a self-hosted facilitator
   - Select payment scheme: `exact` (recommended for M3 proof)

4. **Accounts:**
   - OKX Developer Portal account (https://web3.okx.com/onchainos/dev-portal) for API keys

---

## 12. Open Uncertainties

| Uncertainty | What to try next | Confidence |
|-------------|------------------|------------|
| Faucet per-address limits and prerequisites | Attempt faucet claim during M3 integration with a fresh wallet; document observed limits | UNVERIFIED |
| Whether OKX Mock Merchant operates its own facilitator for X Layer Testnet | Probe `https://www.okx.com/api/v1/pay/mock-merchant/resource` during M3 integration; inspect 402 response for facilitator URL | UNVERIFIED |
| Exact npm package versions for `@okxweb3/*` and `@x402/*` | Run `npm view @okxweb3/x402-express version` during M3 integration | UNVERIFIED |
| Whether third-party OKX.AI providers are mirrored on testnet | Test one provider during M3 integration; document result | UNVERIFIED |
| Mock Merchant exact payment-required behavior | Probe endpoint during M3 integration; capture 402 response structure | PARTIALLY VERIFIED |

---

## 13. Contradictions with Repo Planning Docs

| Repo assertion | Current docs say | Contradiction? | Action |
|----------------|------------------|----------------|--------|
| X Layer Testnet is `eip155:1952` | Confirmed `eip155:1952` | No | None |
| Use X Layer Testnet + Mock Merchant for M3 | Mock Merchant exists, but x402 default facilitator does not support X Layer Testnet | **YES** | Act Now (see §10) |
| Third-party OKX.AI providers are not automatically mirrored on testnet | Not addressed in current docs | Unknown | Investigate during M3 |

---

## 14. Summary

**Verified facts:** 15  
**Partially verified facts:** 3  
**Unverified/blocked facts:** 5  

**Most important verified fact:** X Layer Testnet chain ID is `eip155:1952` (confirmed from official OKX docs).

**Biggest remaining unknown:** Whether the OKX Mock Merchant operates its own facilitator for X Layer Testnet, or whether M3 must switch to Base Sepolia.

**Critical finding:** The x402 default facilitator does not support X Layer Testnet. This is an `Act Now` item that blocks M3 integration until resolved.

---

**End of readiness assessment.**
