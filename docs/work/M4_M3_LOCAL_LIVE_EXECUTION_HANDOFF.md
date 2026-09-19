# LOCAL LIVE-EXECUTION HANDOFF — M4 × M3 INTEGRATION (Cutoff-1)

**CLOUD INTEGRATION PROOF / SIMULATED FINANCIAL EXECUTION — this handoff is for the
SUPERVISED LOCAL lane only.** Nothing below was executed in cloud. No live payment,
wallet login, signing, private-key handling, blockchain submission, or real provider
purchase occurred during integration. This document tells the founder exactly how to
run the ONE supervised X Layer Testnet live purchase that proves Cutoff-1 through the
application-owned seam.

**No secrets appear in this file.** Only environment-variable NAMES and their purpose.
All credential VALUES stay on the founder's machine, in the shell/env, never in the repo.

---

## 1. What this handoff is, and what was / was not proven in cloud

PROVEN IN CLOUD (simulated; injected deterministic fakes only at M3's own dependency
boundary; every artifact labelled; a fake result is never marked live): the full ordered
pipeline `authorized intent → hand-off → submitted → settled → result_received →
verified → Somebody re-evaluates → Requirement satisfied`, plus every negative
(no-grant, out-of-bounds amount, wrong-network, rejected verification, ambiguous
submission → reconciliation, stale contract revision, duplicate/replay dedupe).

NOT proven in cloud, REQUIRED locally (this handoff): a real 402 challenge fetch; real
wallet/TEE sign-only execution via M3's `OfficialSignOnlyReplayExecutor`; real blockchain
submission + independent X Layer settlement readback; a real provider paid-response +
protected-result verification; the resulting live causal Cutoff-1 trace. These are
deliberately OUT OF SCOPE for cloud and must NEVER be simulated and reported as live.

## 2. The exact candidate to check out locally

- Repository: `dropandresetmain-prog/somebody-okx`.
- Integration branch: `integration/m4-m3` (also published identically to
  `qoder/general-session-7yasu4`).
- Candidate tip: **`e0cdf42b765c642a429ae53822ce882d3c2ca292`** (this handoff doc is the
  final docs-only commit; see item 16 for gate provenance).
- Lineage: M4 CP8 `99df92d` × frozen M3 main `37afaa5`, merge base `1fa7962`; CP1 is a
  `--no-ff` merge (`79815d9`) preserving BOTH histories. `package-lock.json` was
  regenerated via `npm install`, not spliced.
- Verify locally before anything else:
  `git fetch origin && git checkout integration/m4-m3 && git rev-parse HEAD`
  (must equal the candidate tip) `&& git log --oneline -5`.

## 3. The single application-owned seam and its public API

ONE file joins M4 to M3: **`lib/management/m3BuyerRail.ts`**. It does NOT reimplement the
M3 payment state machine and does NOT collapse the two machines. Exported API:

- `purchaseIdentityFromIntent(intent)` / `purchaseRecordFromIntent(intent, at)` — derive the
  M3 `PurchaseRecord` from the stable intent identity (`.id=intentId`,
  `.objectiveKey`, `.resourceNeedId=requirementKey`, `.offeringId=target.offeringId`,
  `.idempotencyKey`). Identity is never regenerated on retry/replay.
- `handoffIntentToM3(intent, deps)` — authority gate → live 402 challenge → explicit M3
  approval → `prepareApprovedPurchase` (READY_TO_SIGN) → `executeApprovedPayment` →
  M3 `submitted` ⇒ M4 `handed_off`. STOPS at the hand-off boundary.
- `observePurchase(intent, purchase, deps)` — resumable, **ONE fact per call**:
  `submitted→settled`, `settled→result_received`, `result_received→verified|failed`.
  A not-yet-observable fact is a REST, not a failure, not a retry.
- `runPurchaseLifecycle(intent, deps, {maxObservations})` — hand off then observe to a
  terminal/resting state (the production-shaped driver used by the cloud CP4 trace).
- `m3BuyerRailAdapter(deps)` — implements M4's `BuyerRailPort` plus `handoff()`/`observe()`.

`M3BuyerRailDeps` (all injected): `executor`, `fetchLiveChallenge`, `settlementReader`,
`paidRequestSender`, `buildApproval`, `verifyResult`, `railConfig`, `mode`, `now?`.

## 4. Runtime boundary — Node-only, MUST NOT be imported from `convex/*.ts`

The seam transitively imports `node:child_process` via
`supervisedPurchase.ts → onchainOsExecutor.ts` (which spawns `onchainos payment pay`).
It is therefore **Node-runtime application code for the supervised LOCAL lane**, NOT a
Convex function, and NOT bundleable at esbuild `platform:browser`. This matches the
existing production shape: `convex/management.ts` imports only the PURE M4 kernels, and
`dispatchExternal` (`convex/management.ts:1801`) deliberately persists a BUY intent that
rests in `awaiting_m3` WITHOUT calling `attemptHandoff` (the hand-off is I/O and cannot
run inside a mutation). The live hand-off is driven from a Node process — exactly as
`scripts/m3-live-purchase.ts` already drives `executeApprovedPayment`.

## 5. Founder-machine prerequisites (Windows)

- Node 22+ (the lane uses global `fetch` and `AbortSignal.timeout`).
- The `onchainos` CLI on PATH (`onchainos.exe` on Windows). `createLocalOnchainosPaymentRunner`
  (`lib/payment/onchainOsExecutor.ts:387`) spawns the literal binary name `"onchainos"`;
  there is NO env override for the binary name/path — it must resolve on PATH.
- Check out the exact candidate (item 2), then `npm install` (regenerates the union
  lockfile tree: M4 `@langchain/langgraph` + M3 `@okxweb3/x402-*` / `express`).
- Confirm the gate is green locally before any live run: `npm test`, `npm run typecheck`,
  `npm run typecheck:convex`.
- The app NEVER sees a private key. Signing is delegated to the Agentic Wallet TEE via
  `onchainos payment pay --payload` sign-only mode. Do not introduce key handling.

## 6. Seller side (the controlled Mock Merchant)

Start the loopback-only controlled seller in a SEPARATE terminal:

- Command: `npm run m3:seller` (runs `scripts/m3-controlled-seller.ts`).
- Required env (NAMES only — set VALUES in your shell, never commit them):
  `M3_SELLER_RECEIVER_ADDRESS` (recipient EVM address),
  `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_API_PASSPHRASE` (facilitator credentials).
- Frozen constants (`lib/payment/m3Seller.ts`): host `127.0.0.1`, port `4021`,
  network `eip155:1952` (`M3_SELLER_NETWORK` must remain this), seller asset
  `M3_SELLER_ASSET = 0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`.
- Endpoint served: `GET /m3/paid-ping` (returns the 402 challenge, then the protected
  result on a valid paid replay).
- The seller is Testnet-only and loopback-only; it refuses non-loopback host and
  non-`eip155:1952` network. Keep it that way.

## 7. Buyer side configuration (NAMES only)

For the buyer lane (`scripts/m3-live-purchase.ts` and any seam driver):

- `M3_MERCHANT_URL` — merchant endpoint (default `http://127.0.0.1:4021/m3/paid-ping`).
- `M3_BUYER_ADDRESS` — payer address used for settlement matching (default
  `0xd2dd2eb5028a1afaa09c9d350b3378f1ad4f1db4`). NOTE: the actual SIGNING address is
  controlled by the `onchainos` CLI wallet, not this var; this var is only used to match
  the readback.
- Rail config (`CONFIG`, hardcoded in the script): `allowedNetworks: ["eip155:1952"]`,
  `maxSpend: "10000"` (0.01 USDT0 atomic units). The LIVE challenge is authoritative —
  these are bounds the live terms must fit inside, never values that override the challenge.
- X Layer Testnet RPC: `XLAYER_TESTNET_PRIMARY_RPC = "https://testrpc.xlayer.tech/terigon"`
  (`lib/payment/xlayerSettlement.ts:16`); `createXLayerJsonRpcTransport(rpcUrl?)` accepts an
  optional override.
- Durable ledger: `.m3-payment-execution-ledger.json` resolved from the APPLICATION ROOT
  (`resolvePaymentExecutionLedgerPath`, `lib/payment/executionAuthority.ts:113`) — NOT the
  CWD, and NOT selectable per invocation. Changing the path must never restore spend authority.

## 8. The proven local driver pattern (already in the repo)

`scripts/m3-live-purchase.ts` is the canonical, already-accepted local pattern. It runs the
SAME real M3 functions the seam wraps. Two phases:

- `npx tsx scripts/m3-live-purchase.ts preview  <state.json>` — fetches the live 402,
  prints the economic terms (amount, asset, recipient, network, payer), writes the
  NON-SECRET preview to `<state.json>`. No signing. Review the terms with the founder.
- `npx tsx scripts/m3-live-purchase.ts execute  <state.json> <evidence.json>` — run ONLY
  after the founder approves the previewed terms. Performs AT MOST ONE signed payment,
  then independently reads back settlement and verifies the protected result, writing an
  evidence trail to `<evidence.json>`. No signature/authorization header is ever printed
  or written.

There is no `package.json` shortcut for this script — invoke it via `npx tsx` exactly as above.

## 9. The one missing local piece (honest gap) + recipe

A thin Node driver that binds the SEAM (`m3BuyerRail.ts`) to the PERSISTED Convex
`ExecutionIntent` is NOT yet committed. The seam is fully exercised in cloud tests, and
`scripts/m3-live-purchase.ts` proves the underlying M3 path live, but no committed script
yet reads an `awaiting_m3`/`authorized` intent from Convex → drives the seam → writes the
resulting M4 intent state + wake events back to Convex. To complete Cutoff-1 locally, write
that driver (use `scripts/m3-live-purchase.ts` as the template) so that:

1. Read the persisted `ExecutionIntent` (Convex `executionIntents` table, by objective /
   `intentId`) that M4's `dispatchExternal` left in `awaiting_m3`.
2. Build the real `M3BuyerRailDeps` (item 10).
3. Call `handoffIntentToM3` (or `runPurchaseLifecycle`), one observation per fact.
4. Persist the returned `intent` via `putIntent` and append each returned event as a
   deduped `WakeEvent` (`provider_result` / `verification_result` / `recovery_event`),
   then let Somebody re-evaluate Requirement satisfaction.

This is a LOCAL action item (item 15/16), deliberately not built in cloud because it
cannot be executed or safely validated without the live wallet/TEE and merchant.

## 10. Exact injection recipe for the local live lane

Construct the real deps (all already exist in `lib/payment/`):

- `executor` = `new OfficialSignOnlyReplayExecutor(quoted, confirmation, merchantUrl,
  executionAuthority)` — `kind: "official_onchainos"`. Requires a fresh
  `OfficialQuotedPayment` (`buildQuoteFromChallenge` on a JIT fresh challenge, freshness-
  gated) and a `FounderPaymentConfirmation` (`confirmApprovedPurchaseTerms`). It only
  permits `scheme: "exact"` on `eip155:1952`.
- `fetchLiveChallenge` = the `fetchChallenge` pattern (`scripts/m3-live-purchase.ts:54`):
  GET the merchant endpoint, require HTTP 402, decode the `PAYMENT-REQUIRED` header
  (`decodePaymentRequiredHeader`) or parse the JSON body.
- `settlementReader` = wrap `readAndVerifyXLayerSettlement(rpc, expected)`
  (`lib/payment/xlayerSettlement.ts:365`) over `createXLayerJsonRpcTransport()`. It returns
  `pending | reverted | mismatch | settled`; only `settled` may advance M3 to `settled`.
- `paidRequestSender` = the merchant replay (`sendWithPayment(resource, paymentProof)`);
  in production this is the executor's replay (`replayFetch`, default global `fetch`). The
  `PaidRequestSender` interface has NO standalone production class — reuse the replay path.
- `buildApproval` = derive M3's `PaymentApproval` from the bound founder `spendApprovalId`
  + the LIVE terms. M4 authorization is NOT M3 approval; this factory is where the founder's
  explicit approved authority becomes an M3 approval bound to the live economics.
- `verifyResult` = require BOTH `verifyM3ProtectedResult(result)`
  (`lib/payment/m3Seller.ts:39`) AND an exact ERC-20 Transfer readback match from
  `readAndVerifyXLayerSettlement` (chain id, payer, recipient, asset, amount, success).
  Return `{verified, verificationProof}`; never mark a fake/simulated result live.

## 11. The live Cutoff-1 trace to capture (ordered, with evidence)

Capture each as a DISTINCT observation with its own timestamp + evidence ref (never collapsed):

1. M4 `authorized` (intent bound to a real founder `spendApprovalId`; monetary BUY).
2. Hand-off → M3 `submitted` (real tx hash) ⇒ M4 `handed_off`. submitted ≠ settled.
3. Independent readback → M3 `settled` (X Layer receipt status 1, exact Transfer log).
4. Provider paid-response retrieved → M3 `result_received` ⇒ M4 `result_recorded` +
   `provider_result` wake. result_received ≠ verified.
5. Protected-result + Transfer verification → M3 `verified` ⇒ M4 `verified` +
   `verification_result` wake, with result + verification evidence refs.
6. Somebody re-evaluates → the Requirement is satisfied by the verified external result at
   the CURRENT contract revision.
Also capture the negative/reconciliation behaviour if it occurs: an ambiguous submission
must land in `reconciliation_required` with a `recovery_event` wake and must NEVER be
blind-retried.

## 12. Spend-authority and approval discipline (HIGH RISK)

- M4 authorization ≠ M3 payment approval. A monetary BUY/HYBRID with NO bound founder
  `spendApprovalId` creates NO purchase and reaches NO executor (fail closed). Do not
  hand-off an unapproved intent.
- The LIVE x402 challenge is authoritative for network / asset / atomic amount / recipient
  / resource / scheme / timeout / signing domain. An M4 quote (`intent.terms.priceUsd`)
  NEVER overrides it; `preparePayment` refuses live terms outside the approval bounds or
  the rail config (wrong network/asset/recipient, amount above bound or `maxSpend`, mainnet)
  BEFORE signing.
- Founder confirmation (`confirmApprovedPurchaseTerms`) binds to the previewed economics; a
  fresh execution quote (`authorizeFreshExecutionQuote`) must match the confirmed
  fingerprint and be <30s old at signing. Any mismatch is a typed refusal.

## 13. Financial exactly-once (durable ledger)

- `.m3-payment-execution-ledger.json` (`FilePaymentExecutionAuthority`,
  `lib/payment/executionAuthority.ts`) enforces ONE attempt per `purchaseId` /
  `idempotencyKey`. A second call or a reconstructed executor throws
  `PaymentExecutionAlreadyClaimedError` BEFORE touching the wallet.
- NEVER delete or edit the ledger to "restore" spend authority. NEVER run two lanes against
  one ledger root.
- Ambiguity (possible submission + missing/ambiguous response, incl.
  `OfficialPaymentAmbiguousError`) → `reconciliation_required`; resolve by reading
  blockchain/provider/payment truth, then and only then may M3's `planRetry` open a NEW
  attempt with explicit reconciliation proof. The seam never auto-retries.

## 14. Safety rails — what must NOT happen

- No mainnet. Network must remain `eip155:1952`.
- No private-key handling by the application; signing stays in the wallet/TEE via the CLI.
- No force-push, no rebase/squash of the candidate, no commits to `main` or
  `feat/m4-management-engine`.
- Never mark a fake/simulated result as live; never report a simulated run as a live payment.
- Do NOT touch M5 (frozen frontend). Do NOT modify the frozen M3 payment authority.
- Do NOT introduce a second payment state machine or a parallel Convex purchase store; M3's
  ledger is the single financial authority and M4 records only business consequence.

## 15. R3 recheck (after a successful local Cutoff-1)

- R3 was NOT rechecked during integration and the prior R3 verdict stands (M4 not accepted;
  seam not ready; Cutoff 1 not proven).
- Submit for R3 recheck: the candidate SHA (item 2), the live `<evidence.json>` trail, the
  X Layer transaction hash + block + receipt status, the independent ERC-20 Transfer readback,
  the verified protected result, and the resulting M4 intent/wake/Requirement-satisfaction
  rows showing the ordered trace (item 11).
- R3 must re-verify: LangGraph↔Convex state ownership; the two-machine seam (no collapse);
  identity stability; fail-closed spend authority; live-challenge authoritativeness;
  submitted≠settled≠result_received≠verified; reconciliation-not-retry; stale-revision guard;
  duplicate/wake dedupe; no false completion. Classify every finding Act Now / Investigate
  Now / Park for Later / Ignore-Accept Risk.

## 16. Definition of done for Cutoff-1, and gate provenance

Cutoff-1 is DONE only when ONE causal live trace on X Layer Testnet traverses: internal
MAKE; a genuine external need; an economic recommendation; a deterministic authorization;
an integrated live Testnet payment through this seam; a persisted + independently verified
acquired result; an internal reaction; the external effect; independent verification; and a
truthful Objective resolution — with NO scenario-specific payment branch.

Gate provenance for the candidate: the full gate was run ONCE on `e0cdf42` —
`npm test` **595 pass / 0 fail** (exit 0), `tsc --noEmit` (root) **exit 0**,
`tsc -p convex/tsconfig.json` **exit 0**. `next build` is NOT part of the established M4/M3
gate (the accepted CP8 baseline gate was `npm test` + both tsc programs) and the seam is
unreachable from the Next app (nothing in `convex/`, `app/`, or `components/` imports it;
root tsc compiles all app `.tsx`). This handoff file is a docs-only addition committed after
that gate; it changes no source, test, or config, so the verified gate result is unchanged
for the candidate's code.

When — and only when — the live local trace above is captured and verified, the terminal
status may be stated as:

> M4 × M3 APPLICATION INTEGRATION COMPLETE — CLOUD SEAM PROVEN; LIVE X LAYER TESTNET
> CUTOFF-1 EXECUTED AND VERIFIED; READY FOR R3 RECHECK.

Until then, do NOT claim live Cutoff-1 proven, real payment executed, M4 accepted, or M5
integrated.
