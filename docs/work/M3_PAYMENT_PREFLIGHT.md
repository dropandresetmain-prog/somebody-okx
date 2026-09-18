# M3 Payment Integration Preflight

**Date:** 18 September 2026  
**Branch:** `feat/m3-live-payment`  
**Starting SHA:** `9f2f0eaaadcf9eb1d980ccb57e4bcca065fe0d86`  
**Status:** **NO-GO — WALLET SIGNING + LIVE MERCHANT TOKEN COMPATIBILITY MUST BE RE-PREFLIGHTED BEFORE ANY PAYMENT**

This document is a pre-payment integration audit. It does not authorize a
transaction, does not supersede `M3_LIVE_SESSION.md`, and does not rewrite the
historical attempts recorded there.

## 1. Causal model

`ResourceNeed → BUY → provider/resource → 402 → PreviewQuote → founder economic-term confirmation → fresh ExecutionQuote → wallet/session health → signing → PAYMENT-SIGNATURE → merchant replay → facilitator → X Layer transaction → receipt → protected result → application reconciliation/verification → Objective resumes`

A local `pay_...` id is a CLI state handle. It is not a remote transaction id,
not a settlement receipt, and not proof that the facilitator saw a payment.

## 2. Attempts reconstructed

### Attempt A — signed replay remained HTTP 402

- wallet signing progressed far enough for the CLI to replay the merchant request;
- CLI returned `status=pending`, no txHash/decodedReceipt, HTTP 402 remained;
- wallet history and direct balance showed no outgoing transfer;
- after EIP-3009 validity expired, reconciliation proved unchanged balance,
  no outgoing tx, and no observed settlement;
- terminal classification: **EXPIRED_UNSETTLED**.

Current CLI source explains an important limitation: any replay HTTP 402 is
flattened to `pending / facilitator non-terminal`. That label does **not** prove
the facilitator was merely still settling. The next attempt must preserve the
safe merchant body/challenge so rejection/rechallenge can be distinguished.

### Attempt B — local quote expired before signing

- fresh local handle existed;
- founder confirmation arrived long after quote creation;
- CLI returned `quote_expired_or_missing`;
- no signature, replay, tx, or balance change.

Official CLI source stores generic quote state for at most 300 seconds:
`min(challenge expiry, createdAt + 300s)`.

Application defect found and fixed by the existing JIT flow:
confirmation binds purchase + economic terms; payment uses a fresh matching
ExecutionQuote with a 30-second local freshness bound.

### Attempt C — JIT succeeded; Agentic Wallet HPKE failed

- preview terms confirmed;
- fresh execution quote acquired;
- term fingerprints identical;
- execution quote age 2812 ms;
- CLI failed with `HPKE decryption failed: Failed to open ciphertext`;
- no payment proof, merchant replay, txHash, receipt, outgoing tx, or balance change.

Official signing source places HPKE decryption before the final signing API and
before merchant replay. This is therefore a **known pre-submission wallet
session/signing failure**, not evidence of submission.

## 3. Current external reality

### Onchain OS version

- observed installed CLI during Attempt C: **4.6.1**;
- current upstream source/tag inspected: **4.6.2**;
- core `payment_flow.rs` and `agentic_wallet/sign.rs` are unchanged between
  v4.6.1 and v4.6.2;
- auth/payment-carrier code did change.

Upgrade removes version skew but is **not** assumed to fix HPKE by itself.

### Windows HPKE failure is a known real failure mode

Upstream issue `okx/onchainos-skills#50` records the same error on Windows.
Its resolved root cause was a stale Windows Credential Manager
`agentic-wallet.onchainos` credential paired with a fresh
`session.json.encryptedSessionSk`.

Current v4.6.2 source still:
- reads Windows/macOS OS keyring before encrypted-file fallback;
- falls back to file when OS-keyring write fails;
- `wallet logout` calls `clear_all()`;
- `clear_all()` attempts OS credential deletion but deliberately ignores that
  deletion error before clearing the file fallback.

Therefore a successful logout/login or `wallet status` is not sufficient proof
that the HPKE signing path is healthy. The signing canary is mandatory.

Do **not** manually delete credentials as the first move. Use official
logout/login first. Manual deletion of only the stale OS credential is justified
only if the official flow demonstrably leaves the signing path broken / logs an
OS-keyring write problem.

### Mock Merchant / token discrepancy

Current official buyer and seller documentation describe the X Layer Testnet
happy path as:

- network `eip155:1952`;
- USD₮0;
- contract `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`;
- amount `10000`;
- payTo `0x3509655ad99effc7f3f74205482b1cb337ca08f7`;
- timeout 60s.

The Sep-17 live Mock Merchant instead advertised:

- `USDC_TEST`;
- contract `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d`;
- same amount/payTo/network/timeout.

Current `okx/payments` public defaults list USD₮0 for the testnet flow; current
Onchain OS token aliases do know the Sep-17 USDC test contract. Wallet-token
recognition does **not** prove that the deployed payment facilitator settles it.

This remains a **NO-GO** item until a fresh read-only quote is obtained and the
returned asset is reconciled with current supported payment/facilitator reality.

### `balanceStatus: unavailable`

The live Sep-17 quote reported `balanceStatus=unavailable` while direct wallet
balance showed 10 USDC_TEST and `wallet funding-check` reported sufficient.

Upstream CLI treats `balanceStatus=unavailable` as an explicit balance-preflight
degradation state. It is not proof of insufficient funds and must not be
overridden locally. For the next attempt:

- identify the asset by exact `(chainIndex, tokenAddress)`, never symbol alone;
- direct `wallet balance --force` + `funding-check` are the balance facts;
- the token/facilitator compatibility question is separate and must still pass.

## 4. Failure-mode matrix

| Stage | Expected behavior | Known evidence | Plausible failure | Preflight? | Repair now? | Funds/signing? |
|---|---|---|---|---|---|---|
| CLI/runtime | current supported CLI | 4.6.1 observed; 4.6.2 upstream | version skew | Yes | Upgrade supported CLI | No funds |
| Login/session | matched session metadata + credential store | HPKE failed in C | stale OS credential, expired/mixed session | Yes | Official logout/login first | No funds |
| HPKE | decrypt encrypted session signing seed | exact failure in C | stale session_key / keyring precedence | Yes | Signing canary; conditional credential repair | Signing, no funds |
| Personal signing | harmless message signs | not yet proven | HPKE/sign API failure | Yes | Run `wallet sign-message` | Signing, no funds |
| EIP-712 signing | typed-data hash → HPKE → session signature → final sign API | official source supports it | EIP-712-specific failure | Yes | Safe non-payment EIP-712 canary | Signing, no funds |
| Account | active account/address is intended payer | historical wallet used | wrong selected account | Yes | status + addresses | No funds |
| 402 acquisition | current merchant returns parseable terms | Sep-17 live probe | merchant outage/wire change | Yes | read-only quote | No |
| Amount wire | normalize current `amount` + historical `maxAmountRequired` | docs/runtime differ | parser rejects current shape | Yes | **Repaired** | No |
| Scheme/index | sign exact accepted entry | exact + deferred observed | wrong index/order | Yes | existing selectedIndex binding | No |
| Quote lifetime | execution handle remains fresh | B proved 300s cap | human delay | Yes | existing JIT + 30s gate | No |
| Approval binding | purchase + economics unchanged | C JIT terms matched | asset/recipient/amount/resource mutation | Yes | existing fingerprint gate | No |
| Balance | exact token balance sufficient | direct balance + funding-check differed from quote preflight | metadata/preflight lookup failure | Yes | direct balance/funding check; do not fake quote status | No |
| Token compatibility | merchant asset is actually settleable | docs=USD₮0; Sep-17 runtime=USDC_TEST | deployed facilitator rejects asset | Partly | fresh quote + supported-rail evidence required | No |
| x402 signing | EIP-3009 proof built | A reached replay | domain/nonce/validBefore/signature mismatch | Partly | EIP-712 canary + official CLI only | Signing |
| Merchant replay | PAYMENT-SIGNATURE replayed to exact resource/method | A got HTTP 402 | rechallenge, signature rejection, method/resource mismatch | Partly | diagnostics now retained safely | Signing |
| CLI 402 interpretation | rejection vs pending distinguished | source flattens all 402 to pending | hidden rejection | Yes after response | app preserves safe merchant body | No extra spend |
| Facilitator | verifies + settles X Layer transfer | official docs show happy path | asset/KYT/backend outage/rejection | Partly | verify current merchant/token before spend | Signing/spend |
| X Layer chain | chain 1952 reachable | prior RPC probe 0x7a0 | wrong RPC/outage | Yes | read-only RPC preflight | No |
| Settlement | successful receipt + exact token transfer | previously absent | revert/pending/wrong transfer | Yes after tx | **Independent verifier added** | Read-only |
| Protected result | merchant returns paid resource | docs show success shape | 2xx without correct resource/payment linkage | Yes after pay | result remains separate state | No extra spend |
| Reconciliation | ambiguous result blocks retry | A closed safely | lost response/double pay | Yes | retry hole repaired | No |
| Objective resume | only verified resource unblocks objective | existing architecture | submission mistaken for completion | Yes | preserve submitted≠settled≠verified | No |

## 5. Application repairs on this audit

1. `challenge.ts`
   - accepts both current x402 v2 `amount` and historical live
     `maxAmountRequired`;
   - rejects the entry if both are present and disagree.

2. `onchainOsExecutor.ts` / `types.ts`
   - safely retains top-level CLI error + exit code;
   - never persists raw stderr;
   - classifies source-proven `quote_expired_or_missing` as quote-state
     pre-submission failure;
   - classifies HPKE decrypt failure as wallet-session-crypto
     pre-submission failure;
   - every unknown non-clean CLI result remains ambiguous/reconciliation-only.

3. `lifecycle.ts` / `buyerRail.ts`
   - a failure reported after submission/uncertainty now routes to
     `reconciliation_required`, not retryable `failed`;
   - retry planning from `failed` now requires explicit reconciliation proof.

4. `xlayerSettlement.ts`
   - validates RPC chain id is `0x7a0`;
   - fetches `eth_getTransactionReceipt`;
   - distinguishes pending, reverted, mismatch, settled;
   - calls SETTLED only when receipt status succeeds **and** an ERC-20 Transfer
     emitted by the approved asset matches payer, recipient and atomic amount.

## 6. State-model interpretation

The implementation deliberately does not collapse every artifact into one
`PaymentState` union:

- **quoted:** represented by `PreviewQuote` / `ExecutionQuote`, because local
  quote handles expire and are not durable payment authority;
- **approved:** durable purchase/application approval state;
- **ready_to_sign:** `BoundPaymentIntent` / `PreparedPayment`;
- **payment_attempted/submitted/uncertain/reconciliation_required/settled/result_received/verified/failed:** payment lifecycle;
- **expired:** terminal reconciliation classification
  (`EXPIRED_UNSETTLED`) for an expired authorization, rather than a generic
  claim that every payment object has expired.

This split is intentional. No new broad state enum is justified by current
evidence. The material gap was retryability after ambiguous/post-submission
failure; that is repaired.

## 7. Independent evidence criteria

### SETTLED

All of the following:

1. real txHash returned or recovered;
2. RPC reports X Layer Testnet chain id `0x7a0`;
3. `eth_getTransactionReceipt(txHash)` is non-null;
4. receipt `status == 0x1`;
5. receipt contains ERC-20 `Transfer` emitted by the approved asset;
6. transfer `from == selected wallet`;
7. transfer `to == approved payTo`;
8. transfer value == approved atomic amount.

Wallet history/balance movement are useful reconciliation evidence but do not
replace the receipt.

### VERIFIED

SETTLED plus:

1. merchant returned the protected resource successfully;
2. returned payment metadata, when present, matches txHash/network;
3. resource/result is bound to the intended purchase/resource need;
4. application verification records the result independently;
5. only then may the Objective resume.

## 8. Remaining GO gate

- [x] current CLI source/runtime behavior understood enough to preflight
- [ ] local CLI upgraded/verified current on founder machine
- [ ] official clean logout/login completed
- [ ] correct active X Layer Testnet account/address verified
- [ ] personal-sign HPKE canary succeeds
- [ ] safe non-payment EIP-712 canary succeeds
- [ ] fresh Mock Merchant quote captured read-only
- [ ] current merchant token/facilitator compatibility resolved
- [ ] exact token direct balance + funding check sufficient
- [x] PreviewQuote/ExecutionQuote JIT gate implemented
- [x] approval binding/fingerprint gate implemented
- [x] safe post-sign/replay diagnostics preserved
- [x] X Layer settlement readback implemented
- [x] no unresolved historical authorization remains (Attempt A expired/unsettled; B/C pre-submission)
- [ ] focused changed-payment tests + typecheck pass on exact branch head

Until every material unchecked item is green: **NO PAYMENT**.

## 9. Bundled local preflight — no payment command

Run only after pulling the branch. Do **not** run
`onchainos payment pay` during this preflight.

1. Verify repo and focused code:

```powershell
git fetch origin
git switch feat/m3-live-payment
git pull --ff-only
git rev-parse HEAD
git status
npx tsx --test tests/payment-challenge.test.ts tests/payment-onchainos-executor.test.ts tests/payment-lifecycle.test.ts tests/payment-buyer-rail.test.ts tests/payment-xlayer-settlement.test.ts tests/payment-reconciliation.test.ts
npx tsc --noEmit
```

2. Verify/upgrade supported Onchain OS CLI using the current official installer,
then record:

```powershell
onchainos --version
onchainos wallet logout
onchainos wallet login
onchainos wallet status
onchainos wallet addresses --chain xlayer_test
```

Do not paste session files, keyring contents, tokens, certificates, or secrets.

3. On the intended X Layer Testnet address, prove the session signing path with
a harmless personal-sign canary:

```powershell
onchainos wallet sign-message --chain xlayer_test --from <ADDRESS_FROM_PREVIOUS_COMMAND> --message somebody-okx-m3-session-healthcheck
```

If this returns HPKE failure: **stop**. Do not request a payment quote.

If login emitted `OS keyring write failed ... using file fallback` or the
signing canary still fails, the upstream Windows stale-keyring bug is
demonstrably in play. At that point inspect/repair only the
`agentic-wallet.onchainos` OS credential; do not edit session JSON, encrypted
keyring files, or signing material by hand.

4. If personal signing passes, exercise the supported EIP-712 path with a
non-payment typed-data message. It deliberately has no token contract and no
EIP-3009 `TransferWithAuthorization` fields, so the signature is a healthcheck,
not spend authorization.

```powershell
$typedData = @{
  domain = @{
    name = "Somebody OKX M3 Healthcheck"
    version = "1"
    chainId = 1952
  }
  types = @{
    EIP712Domain = @(
      @{ name = "name"; type = "string" },
      @{ name = "version"; type = "string" },
      @{ name = "chainId"; type = "uint256" }
    )
    Healthcheck = @(
      @{ name = "message"; type = "string" }
    )
  }
  primaryType = "Healthcheck"
  message = @{
    message = "somebody-okx-m3-session-healthcheck"
  }
} | ConvertTo-Json -Depth 10 -Compress

onchainos wallet sign-message --chain xlayer_test --from <ADDRESS_FROM_PREVIOUS_COMMAND> --type eip712 --message $typedData
```

If the CLI responds with its normal signing confirmation gate, confirm only
this exact healthcheck payload and rerun the same command with `--force`.
Never reuse `--force` as a general payment bypass.

5. Only after both canaries pass, acquire a **read-only** fresh quote:

```powershell
onchainos payment quote https://www.okx.com/api/v1/pay/mock-merchant/resource
```

Record only safe fields:
`paymentId`, candidate `acceptsIndex`, network, token symbol, asset contract,
amount, recipient, timeout, balanceStatus/available/required/shortfall, and
walletError if present.

Then verify the exact returned token by contract address:

```powershell
onchainos wallet balance --chain xlayer_test --token-address <RETURNED_ASSET> --force
onchainos wallet funding-check --chain xlayer_test --token-address <RETURNED_ASSET> --required 0.01 --asset <RETURNED_SYMBOL>
```

Do not run `payment pay`.

## 10. Finding triage

### Act Now

**A. Wallet signing health is unproven.**  
Evidence: Attempt C HPKE failure; upstream Windows issue #50; current OS-keyring
precedence behavior.  
Action: official logout/login + personal/EIP-712 signing canaries.  
**Blocks M3: YES.**

**B. Token/facilitator compatibility is unresolved.**  
Evidence: Sep-17 live USDC_TEST challenge conflicts with current official USD₮0
Mock Merchant/payment defaults.  
Action: fresh read-only quote + current supported-rail confirmation; no pay while
discrepancy remains unexplained.  
**Blocks M3: YES.**

**C. Focused repaired code is not yet executed in the founder checkout.**  
Evidence: this integration environment can edit the GitHub branch but has no
networked repository checkout/CI runner.  
Action: run the exact focused tests/typecheck above on the branch head.  
**Blocks M3: YES.**

### Investigate Now

**D. If wallet login writes to file fallback while stale Windows credential
remains readable, official logout/login is insufficient.**  
Evidence: upstream issue #50 and current keyring source.  
Action: only after reproduced evidence, remove only the stale OS credential and
re-login/re-run canary.  
**Blocks M3 if reproduced: YES.**

**E. A replay HTTP 402 cannot be interpreted as generic "pending".**  
Evidence: current CLI source flattens any replay 402 to
`facilitator non-terminal`.  
Action: retain safe merchant result/error/challenge and compare returned terms
on any failure.  
**Blocks M3: diagnostic readiness repaired; runtime outcome may still block.**

### Park for Later

**F. Add richer explorer-link presentation/UI for verified receipts.**  
Reason: RPC verification is sufficient for M3 correctness; explorer is a human
inspection convenience.  
Revisit: after M3 acceptance/demo polish.  
**Blocks M3: NO.**

### Ignore / Accept Risk

**G. ARM64/x64 emulation as an independent root cause.**  
Evidence: no current evidence ties Attempt C specifically to architecture; the
same HPKE failure has a concrete Windows credential-store reproduction.  
Action: do not add architecture-specific workarounds unless the signing canary
still fails after credential/session consistency is proven.  
**Blocks M3: NO, absent new evidence.**
