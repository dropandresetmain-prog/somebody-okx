# M3 Payment Preflight — Executed Results

**Date:** 18 September 2026
**Branch:** `feat/m3-live-payment`
**Preflight start SHA:** `530d2043502a7dddf38ee00738ccb0e3c9cad6d5`
**Repair SHA:** `f4381372e831b0c3a082e4f459f9cb450401760f`
**Status:** **GO — wallet repaired and signing proven healthy; one supervised attempt authorized pending founder economic confirmation**

This document records the preflight in `M3_PAYMENT_PREFLIGHT.md` actually being
*executed* on the founder machine. The prior audit could edit the branch but had
no checkout, no CLI and no runner, so every runtime item in its gate was
unverified. Those items are now settled with real output. Nothing in
`M3_LIVE_SESSION.md` or the prior audit is rewritten.

**No payment was attempted. No signature was produced. No funds moved.**

## 1. Headline

One hard blocker, and one unresolved risk that cannot be settled without
attempting.

| # | Item | Layer | Status |
|---|---|---|---|
| 1 | Agentic Wallet HPKE session split-brain | local, Windows credential store | **BLOCKER** — repairable, needs one founder login |
| 2 | Token's real EIP-712 domain is `version "2"`, challenge advertises `"1"` | upstream OKX | **RISK, not a proven blocker** — see section 3 |

**Correction recorded during this preflight.** Item 2 was initially classified as
a hard upstream blocker on the grounds that the CLI would sign over the
challenge's advertised domain. That is **false for the official TEE path**. See
section 3: `onchainos payment pay` never reads `extra.name` / `extra.version`.
The mismatch is real and worth reporting upstream, but it does not by itself
prove the next attempt fails.

## 2. Blocker 1 — wallet signing is broken locally, and we reproduced it for free

The Attempt C failure was reproduced with a **zero-cost, non-financial**
personal-sign canary — no quote, no token, no merchant, no facilitator:

```
onchainos wallet sign-message --chain xlayer_test \
  --from 0xd2dd2eb5028a1afaa09c9d350b3378f1ad4f1db4 \
  --message somebody-okx-m3-session-healthcheck

{"ok":false,"error":"HPKE decryption failed: Failed to open ciphertext"}
```

This settles the classification: Attempt C was **never a payment defect**.
`payment pay` and `wallet sign-message` unwrap the signing seed through the same
`hpke_decrypt_session_sk` path, and it fails locally before any network call.

### Root cause, from the local audit log

`~/.onchainos/audit.jsonl` shows signing worked and then stopped working, and
pins the change to a specific event:

| Time (+8) | Event | Result |
|---|---|---|
| 18:09:01 | `payment pay` | **ok=true** — signing healthy (Attempt A) |
| 18:49–18:50 | `wallet login` x4 | re-login; `session.json` + `keyring.enc` both rewritten 18:50 |
| 19:37:51 | `payment pay` | `quote_expired_or_missing` (Attempt B — never reached signing) |
| 20:42:51 | `payment pay` | **HPKE failure** (Attempt C) |
| 23:17:07 | `wallet sign-message` | **HPKE failure** (this preflight, 13 ms, no value at risk) |

Every signing attempt after the 18:49–18:50 re-login has failed. The only
successful signing was on the pre-login session.

### Mechanism (confirmed against current CLI source and machine state)

The credential blob has an asymmetry between writes and reads:

- **writes:** OS keyring first; fall back to `~/.onchainos/keyring.enc` *only if
  the OS write fails* — and the stale OS entry is not invalidated;
- **reads:** OS keyring first, unconditionally, whenever an entry exists.

Machine state matches that failure exactly:

- `keyring.enc` exists, mtime **18:50**, identical to `session.json` — so the
  last credential write went to the **file fallback**, meaning the OS keyring
  write failed at login;
- the Windows Credential Manager target `agentic-wallet.onchainos` **still
  exists** (`cmdkey /list`, verified in PowerShell) and shadows it on every read;
- `session.json` holds the fresh `encryptedSessionSk`;
- `sessionKeyExpireAt` = 1798358595 → **27 Dec 2026**, so expiry is ruled out;
- `os/arch` recorded as `windows / x86_64`, single CLI version `4.6.1`, so
  **architecture and version skew are ruled out**.

Fresh ciphertext + stale private key → AEAD tag mismatch → "Failed to open
ciphertext". This is the same shape as upstream `okx/onchainos-skills#50`, which
was closed by a **user workaround, not a vendor fix**; the hardening it suggested
is still absent from current `main`.

Note the diagnostic trap: `wallet status` never touches HPKE, so login looks
perfectly healthy while every signing operation fails. `wallet status` is not
evidence of signing health — only the canary is.

### Why `logout` alone may not be enough

`clear_all()` does target both stores, but discards the OS-keyring delete error
(`let _ = os_clear_all()`). Since the OS *write* demonstrably failed at 18:50,
the delete may fail the same way — and logout would still report success. The
stale target must therefore be **verified gone**, not assumed gone.

## 3. Risk 2 — the challenge advertises a domain the token does not use

The live challenge asks us to sign EIP-712 typed data with domain
`{"name":"USDC_TEST","version":"1"}` for asset
`0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d`.

That asset's real domain version is **"2"**. Proven two independent ways against
X Layer Testnet (`https://testrpc.xlayer.tech`, `eth_chainId` = `0x7a0`):

1. `version()` returns `"2"`.
2. Domain-separator reconstruction against the contract's own
   `DOMAIN_SEPARATOR()` = `0x7513e76c6d38c7986bcfe857d0e0772d5050d9db65ef5a941d1e15859baef959`:

| Domain | Computed separator | Matches chain? |
|---|---|---|
| `USDC_TEST` v**1** @ `0xcb8b...` | `0x9d05c77b...` | no — **what the merchant tells us to sign** |
| `USDC_TEST` v**2** @ `0xcb8b...` | `0x7513e76c...` | **yes** |
| `USDT0` v**1** @ `0x9e29b3...` | `0xd2406dc8...` | **yes** |

The third row is the tell. The docs-era USDT0 token genuinely *is* domain
version "1". The Mock Merchant was migrated to USDC_TEST — `asset` and
`extra.name` were updated, **`extra.version` was left at "1"**.

### Who actually builds the domain — the decisive question

An x402 `exact` payment is an EIP-3009 `transferWithAuthorization`, verified by
the **token contract** against its **own** domain separator. A signature made
over version "1" would be rejected. So: does the CLI sign over the challenge's
advertised domain?

**For the official TEE path, no.** `payment pay` posts eight fields to
`/priapi/v5/wallet/agentic/pre-transaction/gen-msg-hash` —
`chainIndex`, `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`,
`verifyingContract`. **`name` and `version` are not among them.** The backend
returns a precomputed `domainHash`, which the CLI echoes back to `sign-msg`. The
challenge's `extra` is never dereferenced on this path. A source comment states
the intent directly: the TEE resolves `domainHash` internally so the client does
not need an RPC to fetch `DOMAIN_SEPARATOR()`.

**For `payment pay-local`, yes — and there it is fatal.** That path reads
`extra.name` and `extra.version` verbatim and builds the domain client-side. It
would sign over version "1" against a version "2" token and could never settle.
Note its fallback when `version` is absent is `"2"`, so *omitting* the field
would accidentally be correct while *supplying* `"1"` is fatal.

**`pay-local` is therefore prohibited for this merchant.** It is independently
prohibited anyway: it requires a raw `EVM_PRIVATE_KEY` and bypasses the Agentic
Wallet.

### What this leaves unresolved

The risk **relocates** rather than disappearing. The backend "looks up
`domainHash` by token name/version internally" — that describes a registry
lookup keyed on the token, not necessarily a live `version()` call. If OKX's
registry carries the same stale `"1"` for this asset that the merchant challenge
does, the TEE would compute the identical wrong `domainHash` and the payment
would fail exactly as before. **We cannot verify this from outside**;
`gen-msg-hash` is a server endpoint.

So Attempt A's 402 is **not** explained by this mismatch at the CLI layer, and
its true cause remains unproven. Attempt A's response body is unrecoverable:
`audit.jsonl` stores no response bodies, and the payment state file keeps only
the challenge. Capturing it requires another attempt — which our adapter now
retains safely.

One incidental but load-bearing finding: the credential split-brain was
introduced at **18:50, after Attempt A succeeded at signing (18:09)**. The two
failures are unrelated. **Repairing HPKE returns us to Attempt A's state, not
past it.**

## 4. Everything else is green

| Check | Result |
|---|---|
| CLI present and version | `onchainos 4.6.1` at `C:\Users\sethl\.local\bin\onchainos.exe` (4.6.2 exists upstream; its whole delta is one squashed "optimization" commit, nothing credential-related) |
| Login/account status | `loggedIn: true`, 1 account, Google |
| X Layer chain identifier | `xlayer_test`, chainIndex **1952** — confirmed against `wallet chains` |
| Payer address | `0xd2dd2eb5028a1afaa09c9d350b3378f1ad4f1db4` |
| Balance (CLI) | 10 USDC_TEST; `funding-check` returns `decision: ready`, `sufficient: true` |
| Balance (independent, on-chain) | `balanceOf` returns `10000000` atomic = **10.0** — confirmed without trusting the CLI |
| `balanceStatus: unavailable` | **Preflight display degradation only.** Direct balance and funding-check both authoritative and sufficient. Not a blocker. |
| Mock Merchant liveness | **UP.** Fresh read-only quote taken this session; terms byte-identical to the historical challenge |
| Token identity on-chain | `name`/`symbol` = `USDC_TEST`, `decimals` = 6, not paused |
| X Layer RPC readback | `https://testrpc.xlayer.tech` returns `0x7a0`. **`https://rpc.xlayer.tech` is MAINNET (`0xc4`) — never use it** |
| Focused tests | **109/109 pass** |
| Typecheck | `tsc --noEmit` clean |
| Unresolved prior authorization | None. Attempt A expired unsettled; B and C never reached submission |

### Two traps worth recording

- **Scheme ranking.** The merchant offers `exact` (index 0) and `aggr_deferred`
  (index 1). The CLI ranks `aggr_deferred` **first** and its own summary says
  "Will pay 0.01 USDC_TEST (aggr_deferred, X Layer Testnet)". `aggr_deferred`
  sets `validBefore = U256::MAX` — an authorization that never expires. Our code
  is safe: `buyerRail.ts` selects by `scheme === "exact"` rather than by rank,
  and `onchainOsExecutor.ts` hard-fails anything that is not `exact` on
  `eip155:1952`.
- **Wrong-endpoint mainnet risk.** The mainnet RPC differs from the testnet RPC
  by one path segment. `xlayerSettlement.ts` already asserts `0x7a0` before
  trusting a receipt.

## 5. Repair made this session

`f438137` — **refuse to sign against a mismatched EIP-712 asset domain.**

New `lib/payment/assetDomain.ts` reads the asset's real `name`, `symbol`,
`decimals`, `version` and `DOMAIN_SEPARATOR` over read-only `eth_call` and
compares them to what the 402 challenge advertises. A token exposing no
`version()` is reported `unverifiable` — explicitly *not* treated as compatible.

Wired in at the supervised boundary as
`preflightApprovedPurchaseAssetDomain(rpc, prepared, options)`, called after
`prepareApprovedPurchase` and **before** the executor is constructed.

**Enforcement tracks the signing path, and this distinction is the point:**

- `"advisory"` (default) — the official TEE path. Records the divergence without
  blocking, because the TEE does not sign over the challenge's `extra`.
- `"strict"` — any path where we supply the domain ourselves (`pay-local`).
  Throws `AssetDomainMismatchError`; the payment is never signed.

The first version of this repair enforced strictly on the TEE path. That was
wrong and would have **refused a payment that can actually settle**. It was
corrected once the CLI's TEE signing path was read properly. A test now pins
both halves: advisory reports `incompatible` without throwing, strict throws.

Tests use the **actual recorded on-chain responses** as fixtures.

## 6. GO / NO-GO

```
[x] current CLI understood                     4.6.1 verified; commands source-checked
[x] wallet clean login                         stale credential deleted; both stores cleared; fresh login
[x] HPKE signing canary works                  GREEN - personal-sign returns a signature
[x] exact signing path healthy                 GREEN - EIP-712 canary exercises gen-msg-hash + sign-msg
[x] correct X Layer Testnet account            0xd2dd2eb..., chainIndex 1952
[x] sufficient required asset                  10 USDC_TEST, verified on-chain independently
[x] Mock Merchant current behavior verified    live; fresh quote captured this session
[x] token discrepancy understood               understood; NOT binding on the TEE path
[~] facilitator path plausible                 plausible; backend domainHash correctness unverifiable pre-spend
[x] preview/execution JIT gate works           covered by tests
[x] approval binding works                     fingerprint gate covered by tests
[x] diagnostics capture post-sign errors       safe merchant body/challenge retained
[x] settlement readback ready                  RPC verified; mainnet endpoint fails closed
[x] no stale authorization exists              Attempt A expired unsettled
[x] no unresolved prior payment                confirmed via history + on-chain balance
```

**Verdict: NO-GO today, on exactly one blocker — the wallet cannot sign.**

That blocker is repairable and needs one bundled founder interaction. Everything
downstream of signing is prepared, tested and independently verifiable.

Once the signing canaries are green, **ONE supervised attempt is justified.** The
residual unknown — whether OKX's backend computes the correct `domainHash` for
this asset — is not resolvable by any further read-only work, and the attempt is
bounded at 0.01 USDC_TEST on testnet with diagnostics that now capture the
merchant body. Attempting is the cheapest way to resolve it, and it is the only
remaining unknown of consequence.

## 7. Triage

### Act Now

**A. Clear the stale Windows credential, then re-login and re-run the canary.**
Evidence: section 2. Blocks M3: **YES** (but not sufficient on its own).

**B. Report the merchant domain mismatch upstream.**
Evidence: section 3. `extra.version` should be `"2"`, or the challenge should
point at a token whose domain version is `"1"`. It is fatal to any buyer using
`pay-local` and is a latent trap for every other integrator. Blocks M3: **NO**
(TEE path ignores it), but report it.

### Investigate Now

**C. Capture the merchant's 402 body on the next attempt.** Attempt A's body is
unrecoverable — `audit.jsonl` stores no response bodies and the payment state
file keeps only the challenge. If the next attempt also returns 402, the
retained body is what distinguishes a facilitator `invalidReason` (e.g.
`signature_invalid`) from a genuine non-terminal pending state. Our adapter
already preserves it. Blocks M3: **NO**, but it is the difference between a
fourth diagnosis and a fourth guess.

**D. Never use `payment pay-local` against this merchant.** It reads
`extra.version` verbatim and would sign an unverifiable authorization. It is
already excluded (raw private key, bypasses Agentic Wallet); this is a second,
independent reason. Blocks M3: **NO**.

### Park for Later

**E. Upgrade to CLI 4.6.2.** Removes version skew, but the delta contains
nothing credential-related. Do it during the repair window, not as a fix.

**F. Explorer-link presentation for verified receipts.** RPC readback is
sufficient for M3 correctness.

### Ignore / Accept Risk

**G. ARM64 / architecture as a root cause.** Ruled out: audit log records
`windows / x86_64`, and the credential split-brain fully explains the failure.

**H. `balanceStatus: unavailable`.** Preflight degradation only; direct balance
and funding-check are authoritative and sufficient.

## 8. Repair executed — wallet signing restored

Sequence run on the founder machine, in one pass:

1. **Deleted** the stale Windows Credential Manager target
   `agentic-wallet.onchainos`, and verified removal.
2. `onchainos wallet logout` — confirmed it cleared `session.json`,
   `keyring.enc` and `wallets.json` (only `machine-identity` persists).
3. `onchainos wallet login --phase init` → founder completed Google auth in the
   browser → `--phase poll`.

### The warning that proves the diagnosis

The login emitted, verbatim:

```
Warning: OS keyring write failed (failed to write keyring blob), using file fallback
```

**The OS keyring write fails on this machine.** That is the upstream defect, and
it is still present — the repair did not fix it and cannot. What the repair
changed is that the *stale* OS entry was removed first, so the fresh file-stored
`session_key` is no longer shadowed by an old one.

This also retires the "just log out and back in" theory: a plain logout/login
would have hit the same failing OS write while the stale entry survived
`clear_all()`'s swallowed delete error, and the canary would have failed again.

Note an oddity worth carrying forward: after login, `cmdkey /list` shows the
`agentic-wallet.onchainos` target **present again** despite the write having
reported failure. Signing nevertheless works, so the pairing is consistent — but
the OS store on this machine is demonstrably unreliable, and the canary, not
`wallet status` and not the credential listing, is the only trustworthy signal.

### Canary results — both GREEN

| Canary | Command | Result |
|---|---|---|
| personal-sign | `wallet sign-message --chain xlayer_test --from 0xd2dd2eb...` | `ok:true`, signature returned |
| EIP-712 | same, `--type eip712`, non-payment typed data | `ok:true`, signature returned |

The EIP-712 canary used `primaryType: "Healthcheck"` with **no
`verifyingContract`** and no EIP-3009 fields, so it is structurally incapable of
authorizing a transfer. It exercises the identical path the payment uses: HPKE
unwrap, session certificate, `gen-msg-hash`, Ed25519 session signature, final
signing API.

### Post-repair state re-verified

- account `251ac167-...`, address `0xd2dd2eb5028a1afaa09c9d350b3378f1ad4f1db4`
  — unchanged;
- balance 10 USDC_TEST per CLI, per `funding-check` (`ready`, `sufficient`), and
  per independent `balanceOf` on X Layer Testnet;
- fresh preview quote returns terms byte-identical to the historical challenge.

**This clears the only blocker.** The residual unknown in section 3 — whether
OKX's backend derives the correct `domainHash` for this asset — is unchanged and
remains unresolvable without attempting.
