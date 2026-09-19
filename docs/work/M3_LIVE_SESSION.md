# M3 supervised live-session ledger

Status: **POST-SIGN PAYMENT INTEGRATION DEFECT**
Recorded: **2026-09-18T20:43:01+08:00**

This ledger contains only public challenge terms and safe payment identifiers.
It deliberately contains no private key, authorization header, session token,
email address, or signing material.

## Wallet and network

- Official CLI: `onchainos 4.6.1`.
- Agentic Wallet login: successful; active account/address intentionally not
  reproduced here beyond the testnet receive address previously provided to the
  founder.
- Network: `eip155:1952` (X Layer Testnet only).
- Official balance readback: `0.2` test OKB and `10` test USD₮0 at
  `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`.

## Live Mock Merchant challenge

Endpoint: `https://www.okx.com/api/v1/pay/mock-merchant/resource`  
Observed via: `onchainos payment quote` (no signing)

- HTTP status: `402`.
- `x402Version`: `2`.
- Resource: `/api/v1/pay/mock-merchant/resource`.
- Schemes: `exact`, `aggr_deferred`; M3 selects `exact` only.
- Network: `eip155:1952` (X Layer Testnet).
- Asset: `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d`.
- Amount / `maxAmountRequired`: `10000` atomic units (`0.01`).
- Recipient / `payTo`: `0x3509655ad99effc7f3f74205482b1cb337ca08f7`.
- Timeout: `60` seconds.
- `extra.name`: `USDC_TEST`.
- `extra.version`: `1`.
- Quote payment reference: `pay_81a7538fe620a43d0e21a027` — **unapproved,
  unsigned, unreplayed, and never to be used as an authorization substitute**.

## Token discrepancy — live challenge is authoritative

The current official buyer guide documents test USD₮0 at
`0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`. The live endpoint above instead
requires `USDC_TEST` at `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d`.

Conclusion: the live exact challenge governs this M3 transaction. The wallet
has the documented USD₮0 balance, but the official quote reports the required
USDC_TEST balance unavailable. The application must not change the asset to
match documentation and must not sign, submit, or replay this quote.

## Required next safe action

## Funding and fresh quote evidence

After funding, the official direct asset balance and official funding check both
confirmed `10` USDC_TEST and sufficient balance for `0.01` USDC_TEST. The
current official quote is:

- Quote payment reference: `pay_0fed9c340f5b9f85b611f1ed`.
- Selected scheme: index `0`, `exact`.
- Quote preflight `balanceStatus` still says `unavailable`; this contradicts
  the direct balance read and `wallet funding-check`, which returned
  `decision: ready` and `sufficient: true`. This stale quote preflight is
  documented as an observation, not bypassed as a source of settlement truth.

## Application approval and READY_TO_SIGN proof

The application created a distinct supervised proof record without secrets:

- Purchase ID: `purchase-m3-mock-pay-0fed9c340f5b9f85b611f1ed`.
- Idempotency key: `idem-m3-mock-pay-0fed9c340f5b9f85b611f1ed`.
- Approval ID: `approval-m3-mock-pay-0fed9c340f5b9f85b611f1ed`.
- Purchase state: `approved`.
- Bound intent state: `ready_to_sign`.

The approval is exact-bound to the network, asset, amount, recipient, resource,
scheme, timeout, and EIP-712 domain listed above. It is not a wildcard approval
and does not authorize another PurchaseRecord.

## Required next safe action

**Founder confirmation required:** display the exact TESTNET confirmation
surface and receive an explicit confirmation before invoking
`onchainos payment pay --payment-id pay_0fed9c340f5b9f85b611f1ed --selected-index 0 --yes`.

## Submission attempt and reconciliation — no retry authorized

The original quote expired before signing. Wallet history showed no outgoing
payment, so a fresh identical quote was obtained and executed only after the
existing explicit confirmation was checked against its unchanged live terms.

- Replacement quote reference: `pay_af95d85ff8bc7d6fe3b66ac2`.
- Official command used: `onchainos payment pay --payment-id … --selected-index 0 --yes`.
- Result: `status: pending`, `txHash: null`, `decodedReceipt: null`.
- Error: `facilitator non-terminal: HTTP 402`; merchant response remained
  `Payment Required`.

This is ambiguous, not a failed payment. The application lifecycle is:

`approved -> payment_attempted -> uncertain -> reconciliation_required`

Immediate reconciliation evidence:

- official wallet history shows only the three inbound faucet transfers, with
  no outgoing USDC_TEST payment;
- official direct USDC_TEST balance remains `10`.

Those reads show no settled transfer at observation time, but they do not
override the official pending payment status. No second `pay` command, new
signature, or replay is authorized until an official status/receipt readback
resolves this specific payment reference.

## Current official testnet-guide expectation

The current OKX buyer guide explicitly runs this verification flow on X Layer
Testnet. It says the Skill tracks payment status and retrieves a receipt; its
concrete Mock Merchant success example is the paid response body containing
`data` plus `payment.status: "success"`, `payment.txHash`, and
`payment.network: "eip155:1952"`. The guide then directs the buyer to verify
that returned transaction hash on the X Layer Testnet explorer.

Correction: a `PAYMENT-RESPONSE` header can be an x402 receipt format and the
CLI can decode it when present, but this OKX testnet guide does not require it
as the only success evidence. Our pending response has neither that terminal
paid response body nor a transaction hash, so it still cannot be accepted.

## Previous attempt reconciliation — closed before fresh authorization

The prior replacement payment command is recorded in the official CLI audit at
`2026-09-18 +08:00 18:09:01.566`, with the exact challenge timeout of `60`
seconds. Therefore its authorization `validBefore` was no later than
`2026-09-18T18:10:01.566+08:00`; the read-only reconciliation at
`2026-09-18T18:50:48.445+08:00` was safely later.

Read-only evidence:

- direct `USDC_TEST` balance: `10` (`10000000` atomic units);
- funding-check: `decision: ready`, `sufficient: true`, `shortfall: 0`;
- official wallet history: three inbound faucet transfers only, zero outgoing
  orders, and no settlement receipt attributable to `pay_af95d85ff8bc7d6fe3b66ac2`.

Formal closure:

`EXPIRED_UNSETTLED`
`authorization expired`
`no settlement observed`
`no outgoing transfer observed`

## Fresh quote and application binding

Fresh quote audit time: `2026-09-18 +08:00 18:51:15.293`. This is a new local
CLI handle and was not reused from either previous attempt:

- paymentId: `pay_eaf2d6069444dfb04c1a8ad1`;
- x402Version: `2`;
- accepts count: `2`;
- selected index/scheme: `0` / `exact`;
- alternate index/scheme: `1` / `aggr_deferred` (not selected);
- network: `eip155:1952` (X Layer Testnet);
- asset: `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d` (`USDC_TEST`);
- amount: `10000` atomic units (`0.01` human);
- recipient: `0x3509655ad99effc7f3f74205482b1cb337ca08f7`;
- resource: `/api/v1/pay/mock-merchant/resource`;
- maxTimeoutSeconds: `60`;
- EIP-712 domain: name `USDC_TEST`, version `1`;
- quote preflight: `balanceStatus: unavailable`, `hasBalance: false`;
- contemporaneous direct balance at `18:51:51.738+08:00`: `10` USDC_TEST;
- contemporaneous funding-check: `decision: ready`, `sufficient: true`,
  `shortfall: 0`.

The quote terms matched the previous challenge materially. The application
created a new exact-bound record and stopped at `READY_TO_SIGN`:

- Purchase ID: `purchase-m3-mock-af2d6069444dfb04c1a8ad1`;
- idempotency key: `idem-m3-mock-af2d6069444dfb04c1a8ad1`;
- approval ID: `approval-m3-mock-af2d6069444dfb04c1a8ad1`;
- intent ID: `intent-m3-mock-af2d6069444dfb04c1a8ad1`;
- purchase state: `approved`;
- bound intent state: `ready_to_sign`.

Founder confirmation was explicit in chat (`Proceed`) for the displayed
TESTNET terms. No authorization, signature, or private signing material is
stored here.

## Single fresh payment command — CLI stopped before signing

The only fresh command permitted in this session was run once at
`2026-09-18 +08:00 19:37:51.093`:

`onchainos payment pay --payment-id pay_eaf2d6069444dfb04c1a8ad1 --selected-index 0 --yes`

Safe CLI response:

- exit code: `1`;
- top-level `ok`: `false`;
- `data`: absent (`null`);
- `data.status`: absent;
- `data.txHash`: absent;
- `data.decodedReceipt`: absent;
- `data.result`: absent;
- `data.error`: absent in the stdout envelope;
- official audit error: `quote_expired_or_missing: pay_eaf2d6069444dfb04c1a8ad1`;
- duration: `22ms`;
- fresh local payment state file: absent after the command.

There was no wallet signature, no `PAYMENT-SIGNATURE` retained, no merchant
replay, no `PAYMENT-RESPONSE`, no second challenge, no transaction hash, and
no receipt. The command failed before signing because the fresh local quote
handle was no longer available when the founder confirmation was acted on.
No automatic retry, re-quote, or second payment command was made.

Post-command read-only evidence at `2026-09-18T19:38:49.684+08:00`:

- direct `USDC_TEST` balance remained `10` (`10000000` atomic units);
- wallet history remained three inbound faucet transfers and zero outgoing
  orders.

This is classified as `PAYMENT_COMMAND_ABORTED_BEFORE_SIGNING`, not
`SIGNED_REPLAY_REJECTED_OR_UNACCEPTED`; the merchant was never reached in this
attempt. M3 is not an acceptance candidate. The immediate integration result
is **APPLICATION DEFECT FOUND**: the supervised flow allowed a local quote
handle to age out between quote/confirmation and the one-shot payment gate,
without a freshness check that could fail before presenting confirmation.

## Quote-lifetime fix (application)

Committed on `feat/m3-live-payment` as
`fix(payment): execute from fresh confirmed quote`
(`4c01c1c1e4fbbf8ebd878da58459d465239ad471`):

- PreviewQuote vs ExecutionQuote separation;
- `paymentTermsFingerprint()` over material terms only (not local paymentId);
- founder confirmation binds to purchase identity + economic terms;
- JIT ExecutionQuote after confirmation; terms must match before pay;
- conservative local freshness window `EXECUTION_QUOTE_MAX_AGE_MS = 30000`;
- focused tests cover term mutation, paymentId change OK, stale quote block,
  and cross-purchase confirmation isolation.

## JIT attempt — PreviewQuote then founder confirmation

PreviewQuote acquired `2026-09-18T20:02:58.595+08:00` (display/approval only;
local handle intentionally not used for signing):

- preview paymentId: `pay_cc4692839ef83614994b982d` (not durable authority);
- network: `eip155:1952` (X Layer Testnet);
- scheme/index: `exact` / `0`;
- asset: `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d` (`USDC_TEST`);
- amount: `10000` atomic (`0.01`);
- recipient: `0x3509655ad99effc7f3f74205482b1cb337ca08f7`;
- resource: `/api/v1/pay/mock-merchant/resource`;
- maxTimeoutSeconds: `60`;
- EIP-712: `USDC_TEST` / `1`;
- contemporaneous funding-check: `decision: ready`, balance `10`, sufficient.

Founder confirmation at `2026-09-18T20:42:48.190+08:00` authorized those exact
transaction terms (not the expired preview paymentId). Confirmation arrived
after a delay; the preview CLI handle was deliberately discarded.

## JIT ExecutionQuote and single payment command

Immediate ExecutionQuote at `2026-09-18T20:42:48.216+08:00`:

- execution paymentId: `pay_3ab1ba75284e1b135d78f118`
  (different from preview; allowed);
- material terms fingerprint: **identical** to confirmed preview terms;
- network verified testnet (`isMainnet: false`);
- age before pay: `2812` ms (under 30s freshness window).

Single authorized command at `2026-09-18T20:42:51.579+08:00`:

`onchainos payment pay --payment-id pay_3ab1ba75284e1b135d78f118 --selected-index 0 --yes`

Safe CLI response (one attempt; no retry):

- exit code: `1`;
- top-level `ok`: `false`;
- `data`: absent;
- `data.status` / `txHash` / `decodedReceipt` / `result`: absent;
- top-level `error`: `HPKE decryption failed: Failed to open ciphertext`;
- no `PAYMENT-SIGNATURE` retained;
- no merchant replay body;
- no second 402 challenge returned in the envelope;
- no transaction hash;
- no decoded receipt.

Post-attempt read-only evidence at `2026-09-18T20:43:01.318+08:00`:

- direct `USDC_TEST` balance remained `10` (`10000000` atomic units);
- funding-check remained `decision: ready`, `sufficient: true`;
- wallet history remained three inbound faucet transfers only; zero outgoing
  orders attributable to this paymentId.

Classification:

`PAYMENT_COMMAND_FAILED_DURING_WALLET_CRYPTO`
`HPKE decryption failed before merchant/settlement evidence`
`quote-lifetime application defect not reproduced`
`no settlement observed`

M3 is **not** an acceptance candidate. Session status:

**POST-SIGN PAYMENT INTEGRATION DEFECT**

Meaning: application gates (confirmation → fresh matching ExecutionQuote →
freshness → single pay) succeeded; the official Agentic Wallet / TEE pay path
failed during HPKE decryption before producing a signature, merchant result,
or transaction identity. No second payment command is authorized in this
session.


---

## Integration audit checkpoint — 18 Sep 2026 (no payment attempt)

This checkpoint was added after the Attempt C HPKE failure. It records research
and hardening only; it does **not** alter Attempts A/B/C above.

### External findings

- Current upstream Onchain OS source/tag inspected: **4.6.2**; live session had
  used 4.6.1.
- Core payment signing files are unchanged between 4.6.1 and 4.6.2, so the
  version bump alone is not treated as an HPKE fix.
- Upstream `okx/onchainos-skills#50` documents the same Windows HPKE failure.
  The resolved cause was a stale Windows Credential Manager credential being
  preferred over a fresh encrypted-file fallback, pairing the wrong
  `session_key` with a new `encryptedSessionSk`.
- Current v4.6.2 keyring source still reads OS keyring first on Windows/macOS
  and `clear_all()` ignores an OS credential deletion error before clearing
  the file fallback. Therefore successful `wallet status` or logout/login
  cannot by themselves prove signing health.
- Current official Mock Merchant/payment docs describe X Layer Testnet USD₮0 at
  `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`, while the Sep-17 live
  challenge returned USDC_TEST at
  `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d`.
- Current CLI source maps any signed merchant replay HTTP 402 to
  `status=pending` / `facilitator non-terminal`; that generic label is not
  enough to distinguish true pending settlement from rejection/rechallenge.

### Application hardening added

See `docs/work/M3_PAYMENT_PREFLIGHT.md` for the full matrix.

- x402 amount compatibility: accepts current `amount` and historical
  `maxAmountRequired`; conflicting aliases fail closed.
- safe CLI diagnostics: top-level error + exit code retained; raw stderr and
  signing material are not persisted.
- source-proven `quote_expired_or_missing` and HPKE failures are classified
  as definitely pre-submission; unknown failures remain ambiguous.
- post-submission failure can no longer become a normal retryable failure.
- retry planning from failed purchase state requires reconciliation evidence.
- independent X Layer receipt verifier requires chain 1952, successful receipt,
  and exact approved ERC-20 Transfer token/payer/recipient/amount.

### Current gate

**NO-GO. No live payment is authorized.**

Before another quote/sign/pay sequence:

1. focused payment tests + typecheck must pass on the exact branch head;
2. current supported CLI must be verified on the founder machine;
3. official logout/login must complete;
4. personal-sign canary must pass;
5. safe non-payment EIP-712 canary must pass;
6. fresh Mock Merchant quote must be inspected read-only;
7. token/facilitator compatibility must be resolved;
8. direct exact-token balance/funding check must be sufficient.

If HPKE fails at either signing canary: stop before obtaining a payment quote and
diagnose the Windows credential-store/session mismatch. Manual credential repair
is not the first step and is permitted only after official tooling is shown to
have left stale OS credential state.

No `onchainos payment pay` command was executed in this audit.
No new authorization exists.

---

## Facilitator capability probe — 19 Sep 2026 (read-only; blocked on credentials)

Purpose: distinguish invalid Somebody/onchainos authorization from broken
Mock Merchant / facilitator / Testnet payment configuration **without moving
funds** and **without another Mock Merchant payment**.

### Credential presence (names only; values never logged)

Loaded from local `.env.local` into a process-local probe only:

| Variable | Present |
|----------|---------|
| `OKX_API_KEY` | yes |
| `OKX_API_SECRET` (alias for `OKX_SECRET_KEY`) | yes |
| `OKX_API_PASSPHRASE` / `OKX_PASSPHRASE` | **no** |
| `OKX_PROJECT_ID` | **no** |

Official x402 auth requires `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`,
`OK-ACCESS-TIMESTAMP`, and `OK-ACCESS-PASSPHRASE`
([api-http-onetime](https://web3.okx.com/onchainos/dev-docs/payments/api-http-onetime),
[api-access-and-usage](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage)).
Some Onchain OS examples also send `OK-ACCESS-PROJECT`.

**Phase 1 `GET /api/v6/pay/x402/supported` was not executed** because
`OKX_API_PASSPHRASE` is missing. No auth headers, secrets, or API responses
were captured.

Founder action (do **not** paste values into chat): add these names to local
process env or `.env.local`, then re-run the probe:

1. `OKX_API_PASSPHRASE` — **required** for `/supported` and `/verify`
2. `OKX_PROJECT_ID` — expected; probe will send `OK-ACCESS-PROJECT` when present

Probe helper (gitignored secrets only; script itself is safe):  
`node scripts/m3-facilitator-probe.mjs`

### Phase 2 architecture (ready; not executed)

Official CLI `onchainos 4.6.1` supports **sign-only** TEE path:

`onchainos payment pay --payload <base64({x402Version,resource,accepts})> --selected-index 0 --yes`

Help text: returns `{authorization_header, header_name, scheme, wallet}` and
does **not** replay to a merchant (mutually exclusive with `--payment-id`).
This is preferred over a capture merchant because settlement cannot occur.

Local loopback is also reachable for `payment quote` (CLI attempted
`http://127.0.0.1:…` and returned `endpoint_unreachable`, not a private-IP
policy block). Capture-merchant remains a fallback only.

**No TEE payment authorization was signed in this checkpoint.**
**No Mock Merchant call. No `/verify`. No `/settle`.**

### Docs cross-check (no live `/supported` yet)

- `/supported` is documented as dynamically generated from facilitator/Apollo
  gating; published examples show `eip155:196` only.
- Seller SDK validates routes against cached `/supported` kinds
  (`scheme@network`); unsupported pairs are rejected.
- Buyer quickstart and Mock Merchant still advertise Testnet `eip155:1952`.
- No documented alternate Testnet facilitator route outside `/supported` was
  found; live confirmation still requires the authenticated `/supported` call.

### Phase 1 live result — 19 Sep 2026 — **CASE B**

`GET /api/v6/pay/x402/supported` succeeded (HTTP 200, business `code` 0).
Credentials resolved from `.env.local` (`OKX_API_KEY`, `OKX_API_SECRET`,
`OKX_PASSPHRASE`, `OKX_PROJECT_ID`). Auth headers and secrets were not logged.

Safe summary:

- `kindCount`: 9
- networks: `eip155:1952`, `eip155:196`
- schemes: `exact`, `aggr_deferred`, `upto`, `period`
- **`exact + eip155:1952` PRESENT** (Case B)
  - EIP-3009 variant: `extra: null`
  - Permit2 variant: `extra.assetTransferMethod = "permit2"`
- also on 1952: `aggr_deferred`, `upto` (permit2 + facilitatorAddress)
- `exact + eip155:196` also present (mainnet; **not used** for payment)
- `signers` keys observed: `eip155:196` only (no `eip155:1952` signer key)
- `extensions`: `[]`

Verdict: facilitator **claims** to support the rail the Mock Merchant advertises.
Case A (upstream `/supported` contradiction) is **ruled out** for
`exact + eip155:1952`.

**Stopped before Phase 2.** No TEE authorization signed. No `/verify`. No
`/settle`. No Mock Merchant payment.

### Phase 2+3 — TEE capture → `/verify` — 19 Sep 2026

Method: `onchainos payment pay --payload` (Agentic Wallet TEE sign-only).
No Mock Merchant replay. No `/settle`. Raw `PAYMENT-SIGNATURE` never logged or
committed.

#### Primary — merchant wire shape (authoritative reproduction)

Challenge `accepts[0]` matched live Mock Merchant exact terms:

- `x402Version: 2`, `scheme: exact`, `network: eip155:1952`
- `maxAmountRequired: "10000"` (not `amount`)
- asset `0xcb8bf24c…`, payTo `0x3509655a…`, resource path as live
- `extra: { name: "USDC_TEST", version: "1" }`

TEE sign: **success** (EIP-3009 path; signature present; auth value `10000`).

`POST /api/v6/pay/x402/verify` with **unmutated** `paymentRequirements = accepted`:

| Field | Value |
|-------|-------|
| HTTP | 200 |
| business code | 0 |
| `isValid` | **false** |
| `invalidReason` | `param_mismatch` |
| `invalidMessage` | `accepted.amount is null` |
| `payer` | `""` |

**Primary authorization verification: `INVALID — param_mismatch`.**

#### Secondary A/B — same economics, v2 `amount` field

Identical terms except `amount: "10000"` instead of `maxAmountRequired`
(quote-normalized / official v2 PaymentRequirements shape). Still TEE
`--payload`; still no merchant; still no settle.

| Field | Value |
|-------|-------|
| TEE sign | success |
| `isValid` | **true** |
| `invalidReason` | null |
| `payer` | `0xd2dd2eb5…` (testnet wallet) |

**A/B authorization verification: `VALID`.**

#### Interpretation

1. Facilitator **does** support `exact + eip155:1952` and can validate a
   TEE-produced EIP-3009 authorization when `accepted.amount` is populated.
2. Live Mock Merchant (and our primary reproduction) advertise x402 **v2** with
   legacy **`maxAmountRequired`** and no `amount`. Official v2
   PaymentRequirements require `amount`.
3. CLI `--payload` assembly did not fill `accepted.amount` from
   `maxAmountRequired` → facilitator rejects with `param_mismatch`.
4. EIP-712 `extra.version: "1"` vs on-chain token version `"2"` did **not**
   block `/verify` once `amount` was present (A/B VALID).
5. Attempt D's opaque second HTTP 402 is **strongly explained** by the same
   wire mismatch: merchant/facilitator verify fails on null `amount`, merchant
   re-challenges with `accepts[]`, CLI maps that to `facilitator non-terminal`.

#### Phase 4 — direct `/settle` plan (NOT executed)

Preconditions now met for a **future** single settle test using an A/B-style
payload (`amount` present, `/verify` would be valid):

1. Fresh TEE `--payload` sign with `amount` (not merchant replay).
2. Confirm `/verify` `isValid: true` on that exact payload.
3. **Only after explicit founder approval:** `POST /api/v6/pay/x402/settle`
   with the same body (Testnet only; no mainnet).
4. Compare `errorReason` / tx identity vs Mock Merchant opaque 402.

**Not run in this session.** No funds moved by settle.

### Root-cause confidence (end of this investigation)

| Claim | Level |
|-------|-------|
| `/supported` includes `exact + eip155:1952` | **Proven** |
| TEE can sign Mock Merchant economic terms | **Proven** |
| Merchant-shaped `maxAmountRequired` payload fails `/verify` (`accepted.amount is null`) | **Proven** |
| Same terms with `amount` pass `/verify` | **Proven** |
| Attempt D second 402 caused by this amount-field mismatch | **Strongly supported** |
| Whether `pay --payment-id` normalizes amount before assemble | **Still unknown** (would need source or a non-settle inspect) |
| Whether merchant passes `maxAmountRequired`-shaped `paymentRequirements` into facilitator even when buyer sends `amount` | **Still unknown** |
| Domain version 1 vs 2 as settle blocker | **Weakened** for verify; settle untested |

### Next action

**File/escalate OKX defect** (Mock Merchant v2 challenge omits `amount`; CLI
does not normalize `maxAmountRequired` → `accepted.amount` on `--payload`
assemble). Optionally request founder approval for **one** direct Testnet
`/settle` after a fresh VALID `/verify` to isolate merchant vs facilitator
settlement.

Do **not** retry Mock Merchant payment until OKX confirms the wire fix or we
have an approved settle A/B.


---

## Compatibility workaround: x402 v2 `maxAmountRequired` → `amount`

**Why it exists**

```
Mock Merchant emits x402 v2 requirement with only `maxAmountRequired`
→ current Onchain OS (`payment pay`) embeds that original object as `accepted`
→ OKX facilitator /verify requires `accepted.amount`  →  INVALID / param_mismatch
```

Proven live (`/verify` A/B): identical economics with `amount` present → VALID.

**What we do** (`lib/payment/x402V2Compat.ts`, `buildQuoteFromChallenge` in
`lib/payment/onchainOsExecutor.ts`): for `x402Version 2 + exact + eip155:1952`,
when `amount` is absent and `maxAmountRequired` is a valid atomic-integer
string, set `amount = maxAmountRequired`. Conflicting fields, malformed values,
or unsupported version/scheme/network fail closed. Nothing else is edited and
the confirmation fingerprint binds economics only (not field naming).

**Signing path:** `onchainos payment pay --payload <b64 {x402Version,resource,accepts:[normalized]}>
--selected-index 0 --yes` (official Agentic Wallet TEE, sign-only). NOT
`--payment-id` (reconstructs the broken shape), NOT `pay-local`. The application
performs exactly one merchant replay (`redirect: manual`, 20s timeout, https +
`www.okx.com` origin + confirmed resource path only). The authorization header
lives only in process memory for that one call.

**Removal condition:** delete `x402V2Compat.ts`, the normalization call in
`buildQuoteFromChallenge`, and this section once upstream Mock Merchant /
Onchain OS emit a facilitator-valid v2 `accepted.amount` natively and that has
been verified live.

## Attempt E — application path with normalization + sign-only + app replay

Driver: `scripts/m3-live-purchase.ts` (`preview` → founder approval → `execute`).

- Pre-live: `wallet sign-message` personal-sign canary OK (payer
  `0xd2dd…1db4`, USDC_TEST balance 10.000000).
- Preview (live 402): X Layer Testnet `eip155:1952`, `exact`, USDC_TEST
  `0xcb8b…c79d`, 10000 atomic (0.010000), payTo `0x3509…08f7`, resource
  `/api/v1/pay/mock-merchant/resource`, purchase `purchase-m3-1789755066579`.
- Founder approved that spend in chat.
- Fresh execution challenge fetched; normalization applied
  (`x402_v2_max_amount_to_amount`, `valueChanged:false`); confirmed-terms
  fingerprint equal; freshness gate passed; state reached `payment_attempted`.
- `executeApprovedPayment` then threw an **`OfficialPaymentAmbiguousError`**
  (i.e. after TEE signing: merchant non-2xx, redirect, timeout/lost response,
  or missing txHash). **The exact sub-cause was NOT captured**: the driver
  called `require_reconciliation` from `payment_attempted`, which the lifecycle
  forbids (needs `uncertain` first), and crashed before saving the error's
  `safeResponse`. This was a driver defect (fixed: evidence is saved before any
  transition; `report_uncertainty` then `require_reconciliation`).
- Reconciliation readback: USDC_TEST balance unchanged at 10.000000; zero
  outgoing transfers in wallet history; no txHash obtained.
- Per the one-signed-attempt rule, no second authorization was issued.
- Post-expiry readback (~143s after execute start, > 60s `maxTimeoutSeconds`):
  balance still 10.000000, 0 outgoing transfers ⇒ **EXPIRED_UNSETTLED**;
  no funds moved.

**Attempt E verdict: M3 STILL BLOCKED — boundary is after TEE signing, at/after
merchant replay; exact sub-cause (merchant 402 vs redirect vs timeout vs
missing txHash) not captured due to the driver defect above.** A fresh
authorization is required to learn it and was not issued (one-attempt rule).
Next attempt should keep the fixed driver, which saves the safe evidence
first; if the merchant returns 402, decode the (transient) signed `accepted`
shape and `/verify` it before concluding.

## Attempt F — fixed driver, second application-path attempt (founder-authorized)

- Canary OK; identical terms to Attempt E (10000 atomic USDC_TEST, payTo
  `0x3509…08f7`); purchase `purchase-m3-1789755383869`.
- Normalization applied; fingerprint equal; TEE signing OK; the transient
  pre-replay check confirmed the signed header carried `accepted.amount == "10000"`
  and the confirmed network/scheme/payTo/asset.
- Single application replay (GET, `redirect: manual`) → **merchant HTTP 402**,
  body = a fresh challenge (`accepts[]` still `maxAmountRequired`-only,
  `Payment Required`). No PAYMENT-RESPONSE, no txHash.
- State: `payment_attempted → uncertain → reconciliation_required`. Readback at
  ~+90s (> 60s timeout): USDC_TEST balance 10.000000 unchanged, 0 outgoing
  transfers ⇒ **EXPIRED_UNSETTLED**, no funds moved.
- Safe evidence: `docs/work/M3_ATTEMPT_F_EVIDENCE.json` (no signature material).

**Conclusion:** the normalized wire (`accepted.amount` present) is NOT sufficient
for the Mock Merchant to accept payment. The rejection is merchant/facilitator-
side. Untested hypotheses: (a) the merchant forwards its own
`maxAmountRequired`-only requirement to the facilitator, so `amount` mismatches
on that side; (b) `accepted` carrying both fields, or the relative `resource`
in the payload, is rejected; (c) merchant-side settle problem independent of
verify. Distinguishing them needs a fresh authorization to `/verify` and vary
shapes (verify-only, no settle) — none issued this session.

## Attempt G — controlled OKX SDK seller, X Layer Testnet (2026-09-18)

Result: **SUCCESS — full chain verified.** Sanitized evidence only; no credentials,
authorization headers, or signatures recorded.

- Seller: `GET /m3/paid-ping`, official OKX seller SDK, loopback `127.0.0.1:4021`,
  `eip155:1952`. Native x402 v2 `amount` — the legacy amount shim was not needed.
- Terms (founder-approved in chat): USD₮0 `0x9e29…fb0c`, 10000 atomic (0.010000),
  payTo `0x8c5b…c3ee`, resource `/m3/paid-ping`, purchase `purchase-m3-1789769056615`.
- Preflight: wallet personal-sign and EIP-712 canaries OK; buyer `0xd2dd…1db4`
  held 10.000000 USD₮0 plus gas.
- First execute stopped **before signing**: pre-sign guard re-parsed the requirement
  without the v2 top-level `resource`. Fixed in `df11a65` with a regression test that
  fails without the fix. No authorization was created by that attempt.
- Second execute: fresh challenge, terms fingerprint equal, official TEE sign-only,
  exactly one replay. Seller HTTP 200; protected resource returned; facilitator receipt
  `status: success`.
- txHash `0x7d1d639910471bc573a45d7e1d1d4bea1afe081a3dc59862703251fdc3e8660d`,
  block 41310643 (`0x27659b3`), receipt status 1.
- Independent RPC readback: Transfer buyer→seller of 10000; buyer 10000000→9990000,
  seller 0→10000.
- Application states: … → submitted → settled → result_received → verified.
