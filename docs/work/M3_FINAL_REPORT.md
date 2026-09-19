# M3 Live Payment — Final Report

**Date:** 18 September 2026
**Branch:** `feat/m3-live-payment`
**Head SHA:** `d7b611b093db1eacb79ca92f820e2c7b74dbde89`
**Base (authoritative main):** `1fa7962d9ef0d359951d14993834d1d419a5c980`
**Verdict:** **M3 NOT ACCEPTED — blocked upstream at the OKX merchant/facilitator. Not an application defect.**

---

## 1. Executive summary

We ran one broad diagnosis, one deep preflight, repaired what was ours, and
executed exactly one supervised live payment attempt on X Layer Testnet.

**The payment did not settle. No funds moved. No transaction was ever created.**

The attempt was nonetheless worth making, because it isolated the blocker. Every
layer we own now has positive evidence of correctness, and the failure sits
downstream of a correctly produced payment authorization, inside OKX's
merchant/facilitator path — which returns no diagnostic reason and which we
cannot instrument from outside.

Two genuine defects were found and one was fixed:

| Defect | Layer | Status |
|---|---|---|
| Agentic Wallet HPKE session split-brain | local (Windows credential store) | **FIXED** — signing restored and proven |
| 402 challenge advertises an EIP-712 domain the token does not use | upstream OKX | **REPORTED, unfixable by us** |

The milestone's evidence bar — authoritative settlement receipt plus the
merchant's protected resource — is not met. We are not dressing that up as a
pass.

---

## 2. What was actually wrong

### 2.1 The wallet (ours to fix — fixed)

The single highest-value action of the session was reproducing the failure **for
free**. A personal-sign canary — no quote, no token, no merchant, no facilitator
— failed in 13 ms with the identical error that killed Attempt C:

```
{"ok":false,"error":"HPKE decryption failed: Failed to open ciphertext"}
```

That reclassified Attempt C immediately: **never a payment defect.**
`payment pay` and `wallet sign-message` unwrap the signing seed through the same
`hpke_decrypt_session_sk` path, locally, before any network call.

**Root cause, pinned to a timestamp.** The local audit log shows signing worked
at 18:09, a re-login occurred at 18:49–18:50, and every signing attempt since
failed. The mechanism is an asymmetry in the CLI's credential store:

- **writes** go to the OS keyring first, falling back to `keyring.enc` *only when
  the OS write fails* — without invalidating the stale OS entry;
- **reads** prefer the OS keyring unconditionally whenever an entry exists.

So a failed OS write leaves a fresh key in the file and a stale key in the OS
store, and every subsequent read picks the stale one. Fresh ciphertext + stale
private key = AEAD tag mismatch.

Ruled out with evidence, not assumption: session expiry (valid to 27 Dec 2026),
CPU architecture (`x86_64`, not ARM64), CLI version skew (single 4.6.1 throughout).

**The fix, and the proof it was the right one.** Deleting the stale Windows
credential *before* logout/login was decisive. The subsequent login emitted:

```
Warning: OS keyring write failed (failed to write keyring blob), using file fallback
```

**The OS keyring write still fails on this machine.** The repair works only
because the shadowing entry is gone. A plain logout/login — the "official"
remedy — would have hit the same failing write while `clear_all()` silently
swallowed its delete error, and would have cost a second round trip for nothing.

Both canaries then passed: personal-sign, and EIP-712 typed data exercising the
same `gen-msg-hash` → `sign-msg` path the payment uses.

> **Operational warning.** `wallet status` never touches HPKE, and the credential
> listing showed the target "present" even after its write reported failure. Both
> report healthy while signing is dead. **Only the canary is trustworthy.**

### 2.2 The merchant domain (upstream — not fixable by us)

The live challenge instructs buyers to sign EIP-712 typed data with domain
`{"name":"USDC_TEST","version":"1"}` for asset `0xcb8bf24c…`. **That token's real
domain version is `"2"`.** Proven two independent ways against X Layer Testnet:

1. `version()` returns `"2"`;
2. domain-separator reconstruction against the contract's own
   `DOMAIN_SEPARATOR()`:

| Domain | Computed separator | Matches chain? |
|---|---|---|
| `USDC_TEST` v**1** @ `0xcb8b…` | `0x9d05c77b…` | no — **what the challenge advertises** |
| `USDC_TEST` v**2** @ `0xcb8b…` | `0x7513e76c…` | **yes** |
| `USD₮0` v**1** @ `0x9e29b3…` | `0xd2406dc8…` | **yes** |

The third row is the tell: the docs-era USD₮0 token genuinely *is* version "1".
The merchant was migrated to USDC_TEST — `asset` and `extra.name` were updated,
**`extra.version` was left behind**.

---

## 3. A correction we made mid-flight

We initially classified the domain mismatch as a **hard blocker** on the grounds
that the CLI would sign over the advertised domain, and shipped a guard that
refused to sign on it.

**That was wrong.** Reading the CLI's TEE path properly showed `payment pay`
never dereferences `extra`: it posts eight fields — `chainIndex`, `from`, `to`,
`value`, `validAfter`, `validBefore`, `nonce`, `verifyingContract` — to
`gen-msg-hash` and signs the `domainHash` the backend returns. `name` and
`version` are not among them.

The guard as first written **would have blocked a payment that can actually
settle.** It was corrected in `70a95d5` before any attempt, and enforcement now
tracks the signing path.

This matters beyond the bug: the challenge's `extra` is *not* binding on the TEE
path, so the mismatch is a strong smell and a real upstream defect, but it is not
by itself proof that the payment must fail.

---

## 4. Attempt chronology

Four attempts, four distinct boundaries. They are not "payment kept failing".

| # | Time | Boundary reached | Outcome |
|---|---|---|---|
| **A** | 18:09 | signed, replayed to merchant | HTTP 402, no txHash, no settlement → `EXPIRED_UNSETTLED` |
| **B** | 19:37 | never reached signing | local quote TTL expired (`min(challenge expiry, created + 300s)`) |
| **C** | 20:42 | never reached signing | HPKE failure — **wallet, not payment** |
| **D** | 23:40 | signed, replayed to merchant | HTTP 402, no txHash, no settlement → `EXPIRED_UNSETTLED` |

**B** exposed a real application defect — quoting before a long human
confirmation — which the JIT preview/execution split had already repaired.

**C** was a local wallet fault introduced at 18:50, *after* A. The two are
unrelated; repairing it returned us to A's boundary rather than past it.

**D is the informative one.** It reproduces A exactly, but with signing health
independently proven beforehand.

---

## 5. Attempt D — the decisive experiment

Founder confirmed the economic terms. Executed as a single scripted pass so no
human latency could sit between quoting and signing.

| Gate | Result |
|---|---|
| execution quote | `pay_a1557a9e578f33dbcacd1c47` |
| term fingerprint vs confirmed | **identical** |
| `exact` entry index | 0, pinned via `--selected-index 0` |
| freshness | **2 ms** (bound: 30 s) |
| signed attempts | **exactly one**, no retry |

```
status  : pending
error   : facilitator non-terminal: HTTP 402
txHash  : null
receipt : null
```

**The merchant 402 body was captured** — the diagnostic Attempt A never
preserved. It contains **no `invalidReason`, no `errorReason`, no facilitator
detail whatsoever**: only `"error":"Payment Required"` and a verbatim re-issue of
the same two `accepts` entries, still carrying `extra.version: "1"`.

### Terminal reconciliation

Verified after the 60-second EIP-3009 authorization lapsed, read directly from
X Layer RPC rather than from the CLI:

- payer `0xd2dd2eb…` — **10 USDC_TEST, unchanged**;
- payee `0x3509655a…` — unchanged;
- **zero** outgoing transfers in wallet history;
- no txHash ever produced, so there is no receipt to verify.

`EXPIRED_UNSETTLED`. No funds moved, no double-spend exposure, and the attempt
reconciled to terminal safety rather than becoming a retryable `failed`.

### What it proves

The failure is **downstream of a correctly produced authorization**. It is:

- not the wallet — canaries green, and the CLI reached merchant replay;
- not quote freshness — 2 ms;
- not approval binding — fingerprint identical;
- not scheme selection — `exact` pinned at index 0;
- not balance — verified on-chain, three ways;
- not our parsing, state machine, or reconciliation.

---

## 6. Remaining hypotheses — both upstream

1. **Backend `domainHash` derived from a stale registry.** The TEE resolves the
   EIP-712 domain internally from the token. If OKX's registry carries the same
   stale `version "1"` the challenge does, every signature it produces is
   unverifiable by a `version "2"` token and the facilitator must reject.
   Consistent with both A and D.
2. **The facilitator does not settle X Layer Testnet.** The documented
   `/api/v6/pay/x402/supported` enumerates only `eip155:196` (mainnet); chain
   1952 appears in no supported-networks table. The mock merchant may be
   advertising a rail the facilitator does not service.

`/api/v6/pay/x402/supported` requires an `OK-ACCESS-KEY`, so the supported-rail
list cannot be read anonymously, and the merchant returns no failure reason.
**From our side this is exhausted.**

---

## 7. Upstream bug report (ready to send)

> **X Layer Testnet mock merchant advertises an EIP-712 domain version the token
> does not use, and `exact` payments never settle**
>
> Endpoint: `https://www.okx.com/api/v1/pay/mock-merchant/resource`
> Chain: `eip155:1952` (X Layer Testnet)
> Asset: `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d` (`USDC_TEST`, 6 dp)
> CLI: `onchainos 4.6.1`, Windows x86_64
>
> **1. The challenge advertises the wrong EIP-712 domain version.**
> The 402 response returns `extra: {"name":"USDC_TEST","version":"1"}`. The
> deployed token reports `version()` = `"2"`, and only
> `name="USDC_TEST", version="2", chainId=1952, verifyingContract=0xcb8bf24c…`
> reproduces the contract's `DOMAIN_SEPARATOR()`
> `0x7513e76c6d38c7986bcfe857d0e0772d5050d9db65ef5a941d1e15859baef959`.
> The previously documented token `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`
> (`USD₮0`) *does* have domain version `"1"`, which suggests the merchant was
> migrated to USDC_TEST with `asset` and `extra.name` updated but `extra.version`
> left stale.
>
> This is directly fatal to any integrator using `onchainos payment pay-local`,
> which reads `extra.name` / `extra.version` verbatim to build the domain.
>
> **2. `exact` payments on chain 1952 never settle.**
> Two attempts, hours apart, with a verified-healthy wallet, sufficient balance
> and a 2 ms-fresh quote: both returned HTTP 402 with `txHash: null` and no
> settlement. Payer and payee on-chain balances were unchanged in both cases.
>
> **3. The 402 body carries no failure reason.** It returns only
> `{"x402Version":2,"accepts":[…],"error":"Payment Required"}` — no
> `invalidReason` or `errorReason` — so integrators cannot distinguish signature
> rejection from an unsupported rail from a genuine pending state. The CLI
> flattens any replay 402 to `pending / facilitator non-terminal`, compounding
> this.
>
> **Questions:** (a) should `extra.version` be `"2"`? (b) does the facilitator
> support `exact` + EIP-3009 settlement on `eip155:1952` — it is absent from
> `/api/v6/pay/x402/supported` and from the supported-networks tables? (c) can
> the merchant surface the facilitator's `invalidReason` in the 402 body?
>
> **Separately — Windows credential store (ref issue #50).** `wallet login`
> reports `OS keyring write failed … using file fallback`, but reads still prefer
> the OS keyring unconditionally, so a stale entry shadows the fresh
> file-persisted `session_key` and all signing fails with
> `HPKE decryption failed: Failed to open ciphertext`. `wallet logout` does not
> reliably clear it, because `clear_all()` discards the OS delete error. The only
> reliable remedy was deleting the `agentic-wallet.onchainos` credential manually.
> `wallet status` reports healthy throughout.

---

## 8. Repairs delivered

| SHA | Change |
|---|---|
| `f438137` | `lib/payment/assetDomain.ts` — read-only on-chain asset/domain preflight |
| `70a95d5` | enforcement scoped to the signing path (advisory for TEE, strict for `pay-local`) |
| `44b905a`, `d7b611b`, `9df1a9b` | executed-preflight and attempt evidence |

The guard reads the asset's real `name`, `symbol`, `decimals`, `version` and
`DOMAIN_SEPARATOR` over read-only `eth_call` and compares them to what the
challenge advertises. A token exposing no `version()` is reported `unverifiable`
— explicitly *not* treated as compatible. Tests use the **actual recorded
on-chain responses** as fixtures.

**Tests: 110/110 pass. `tsc --noEmit` clean.**

Deliberately **not** done: no hand-rolled wallet cryptography, no Agentic Wallet
bypass, no weakened approval, no silent scheme substitution, no mainnet, no
hidden upstream failure.

---

## 9. Two traps worth keeping

- **The CLI recommends the wrong rail.** The merchant offers `exact` (index 0)
  and `aggr_deferred` (index 1); the CLI ranks `aggr_deferred` **first** and its
  summary reads *"Will pay 0.01 USDC_TEST (aggr_deferred…)"*. `aggr_deferred`
  sets `validBefore = U256::MAX` — **an authorization that never expires**. Our
  code selects by `scheme === "exact"` rather than by rank, and hard-fails
  anything that is not `exact` on 1952.
- **Mainnet is one path segment away.** `rpc.xlayer.tech` is chain `0xc4` (196,
  mainnet); the testnet is `testrpc.xlayer.tech` (`0x7a0`). The settlement reader
  asserts the chain id before trusting any receipt.

---

## 10. Triage

### Act Now

**A. Send the upstream report (§7).** This is the only thing that unblocks M3.
Blocks M3: **YES.**

**B. Do not spend another attempt against unchanged conditions.** A fifth attempt
re-purchases the Attempt D result. Blocks M3: **NO**, but it protects the budget
and the evidence.

### Investigate Now

**C. Obtain an `OK-ACCESS-KEY`** to read `/api/v6/pay/x402/supported` and settle
hypothesis 2 without spending. Blocks M3: **NO**, but it could resolve the
ambiguity for free.

### Park for Later

**D. Upgrade to CLI 4.6.2.** Removes version skew; its entire delta is one
squashed "optimization" commit with nothing credential-related. Not a fix.

**E. Explorer-link presentation for verified receipts.** RPC readback is
sufficient for correctness.

### Ignore / Accept Risk

**F. ARM64 / architecture as a root cause.** Ruled out — `windows / x86_64`.

**G. `balanceStatus: unavailable`.** Preflight display degradation only; direct
balance and `funding-check` are authoritative and were confirmed on-chain.

---

## 11. Git state

```
branch feat/m3-live-payment   pushed, clean
HEAD   d7b611b  docs(m3): record Attempt D — EXPIRED_UNSETTLED, upstream blocker isolated
       44b905a  docs(m3): wallet repaired, both signing canaries green, gate now GO
       9df1a9b  docs(m3): align preflight status header with corrected verdict
       70a95d5  fix(payment): scope asset-domain enforcement to the signing path that uses it
       f438137  feat(payment): refuse to sign against a mismatched EIP-712 asset domain
       530d204  (prior session) docs(m3): record payment preflight build delta
```

**Not merged to main.** No acceptance candidate exists, so **R2 is not yet
applicable** — there is nothing to attack. R2 should run against the first SHA
that actually produces a verified settlement.

Note: origin had already advanced to `530d204` before this session began; the
SHA in the original brief (`9f2f0ea`) was stale. The prior session's preflight
audit was preserved and built upon, not rewritten.

---

## 12. Closing assessment

The goal was to make the next live attempt boring. It was: it failed in a
predicted way, at a boundary we had already instrumented, with no funds at risk
and full diagnostics retained.

What we cannot claim is a working payment. The honest position is that **every
layer we control is now evidenced as correct, and the remaining fault is in a
system we can observe only through a 402 that carries no reason.** That is a
sound place to stop and escalate, and a poor place to keep spending signed
attempts.
