# M3 OKX Rail Probe Results

**Access date:** 2026-09-17  
**Sandbox:** /data/lanes/m3-okx-readiness  
**Branch:** prep/m3-okx-readiness

---

## Probe 1: X Layer Testnet RPC (Primary)

**Command:**
```bash
curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' https://testrpc.xlayer.tech/terigon
```

**Response:**
```json
{"jsonrpc":"2.0","result":"0x7a0","id":1}
```

**Interpretation:**
- HTTP status: 200 (reachable via POST JSON-RPC)
- Chain ID: 0x7a0 (hex) = 1952 (decimal)
- Confirms: X Layer Testnet chain ID is eip155:1952

---

## Probe 2: X Layer Testnet RPC (Secondary)

**Command:**
```bash
curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' https://xlayertestrpc.okx.com/terigon
```

**Response:**
```json
{"jsonrpc":"2.0","result":"0x7a0","id":1}
```

**Interpretation:**
- HTTP status: 200 (reachable via POST JSON-RPC)
- Chain ID: 0x7a0 (hex) = 1952 (decimal)
- Confirms: Both RPC endpoints return identical chain ID

---

## Probe 3: OKX Mock Merchant

**Command:**
```bash
curl -s -D - -o /tmp/mh.body --max-time 15 https://www.okx.com/api/v1/pay/mock-merchant/resource
```

**Response Headers:**
```
HTTP/2 402 
date: Thu, 17 Sep 2026 15:56:26 GMT
content-type: application/json;charset=UTF-8
content-length: 706
b-locale: en_US
content-security-policy: frame-ancestors 'self'
x-brokerid: 0
cf-cache-status: DYNAMIC
set-cookie: __cf_bm=6GGgmpZIbu.vH3pQ_.UEANTGCTNw1HN1UUmMaMntoNU-1789660586.231981-1.0.1.1-POBof5VoE5leX4x.W2FSEZTYjgbDCi6vjuzsuAp7TwlleV.IMg7wtQb9PU.b63UuIp0Ckv2YzPwQ4iHES1hJHymWgZunWOHgP0c0pkxjowwVzi3PZt45GFrrINHmfJ9p; HttpOnly; SameSite=None; Secure; Path=/; Domain=okx.com; Expires=Thu, 17 Sep 2026 16:26:26 GMT
server: cloudflare
cf-ray: a3c94d07fa601e94-SIN
```

**Response Body (706 bytes):**
```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:1952",
      "maxAmountRequired": "10000",
      "asset": "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
      "payTo": "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
      "resource": "/api/v1/pay/mock-merchant/resource",
      "mimeType": "application/json",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC_TEST",
        "version": "1"
      }
    },
    {
      "scheme": "aggr_deferred",
      "network": "eip155:1952",
      "maxAmountRequired": "10000",
      "asset": "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
      "payTo": "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
      "resource": "/api/v1/pay/mock-merchant/resource",
      "mimeType": "application/json",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC_TEST",
        "version": "1"
      }
    }
  ],
  "error": "Payment Required"
}
```

**Interpretation:**
- HTTP status: 402 Payment Required (reachable)
- Payment terms are in the JSON BODY, NOT in a PAYMENT-REQUIRED header
- Two schemes offered: `exact` and `aggr_deferred`
- Network: eip155:1952 (X Layer Testnet)
- maxAmountRequired: "10000" (field name, not "amount")
- Asset: 0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d
- EIP-712 name: USDC_TEST
- Recipient: 0x3509655ad99effc7f3f74205482b1cb337ca08f7

---

## Critical Findings

### 1. RPC Endpoints ARE Reachable
Both X Layer Testnet RPC endpoints are reachable via POST JSON-RPC. My earlier readiness doc incorrectly stated they were "UNREACHABLE". The correct statement is: reachable via POST, not GET (GET returns HTTP 405 Method Not Allowed, which is a successful reach, not a block).

### 2. Mock Merchant IS Reachable
The OKX Mock Merchant endpoint is reachable and returns HTTP 402 with payment terms in the JSON body. My earlier readiness doc incorrectly stated "www.okx.com is unreachable, cannot probe". This was a self-imposed limitation based on incorrect network assumptions.

### 3. Wire Format Discrepancy
The live Mock Merchant returns payment terms in the JSON BODY, not in a PAYMENT-REQUIRED header. This contradicts the x402 open-protocol documentation (docs.x402.org) which states terms come in a base64-encoded PAYMENT-REQUIRED header. The OKX implementation diverges from the open-protocol spec.

### 4. Field Name Discrepancy
The live Mock Merchant uses `maxAmountRequired`, not `amount`. The x402 open-protocol docs use `amount`. This is a wire-format detail that M3 integration must handle correctly.

### 5. Unknown Scheme: aggr_deferred
The live Mock Merchant offers two schemes: `exact` and `aggr_deferred`. The `aggr_deferred` scheme is NOT documented in the x402 open-protocol spec (which documents `exact`, `upto`, and `batch-settlement`). This is an OKX-specific scheme that must be investigated during M3 integration.

### 6. Token Discrepancy (HIGHEST-PRIORITY UNKNOWN)
The live Mock Merchant advertises:
- Asset: 0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d
- EIP-712 name: USDC_TEST

But the repo plan (MASTER_PLAN M3, ACTIVE_TASK) says "test USD₮0", and the OKX buyer-guide doc (https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer, accessed 2026-09-17) shows USD₮0 at address 0x9e29b3aada05bf2d8c827af80bd28dc0b9b4fb0c.

**Three conflicting sources:**
1. Live Mock Merchant: USDC_TEST at 0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d
2. OKX buyer-guide doc: USD₮0 at 0x9e29b3aada05bf2d8c827af80bd28dc0b9b4fb0c
3. Repo plan: "test USD₮0" (no address specified)

**Recommendation:** The buyer rail must be built against what the LIVE 402 response returns, not a hardcoded constant. Do not let M3 hardcode either address. The buyer client must parse the `asset` field from the 402 response dynamically.

---

## Summary

All three probes succeeded. The X Layer Testnet infrastructure is reachable and operational. The Mock Merchant returns a valid 402 response with payment terms. The wire format diverges from the x402 open-protocol spec in two ways: (1) terms are in the JSON body, not a header; (2) field name is `maxAmountRequired`, not `amount`. An OKX-specific scheme `aggr_deferred` is offered but not documented. A token discrepancy exists between the live endpoint, the buyer-guide doc, and the repo plan — this is the highest-priority unknown for M3 integration.

**End of probe results.**
