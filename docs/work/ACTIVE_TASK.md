# ACTIVE TASK — M4 Generic Somebody Management Engine

## LOCAL M4 × M3 PRODUCTION DRIVER — CP1 (in progress)

Updated: 20 September 2026. This local branch is a clean worktree at
`fix/m4-m3-production-driver`, based on integration tip
`75ac30b00799cd08cea562908af7aceccfc15f13` (last code candidate
`e0cdf42b765c642a429ae53822ce882d3c2ca292`). The reported missing Node driver
is **Act Now**.

- CP1 adds a Node-only orchestration core for an explicitly named `intentId`, a
  durable M3-owned `PurchaseRecord` companion ledger, and a narrow Convex bridge
  that replays named M3 facts through the existing M4 intent transition kernel.
  Convex does not import the Node buyer rail and does not become a second
  financial store.
- The driver modes are `inspect`, `prepare`, `execute`, `observe`, and
  `reconcile`. `prepare` persists only stable M3 purchase identity. `inspect`
  and `reconcile` are read-only. `execute` is disabled unless a separately
  reviewed supervised adapter explicitly enables it; this checkpoint did not
  invoke an executor, wallet, signing command, provider request, or payment.
- Focused deterministic proof: `tests/m3ProductionDriver.test.ts` passes 3/3,
  covering exact intent selection, restart reload of the durable purchase,
  fail-closed execution, one-fact observation order, settled-without-result,
  and stale execution refusal with reconciliation still readable. Root and
  Convex TypeScript checks are clean.
- **Act Now:** complete and review the supervised local dependency adapter that
  supplies M3's fresh execution quote and founder confirmation to the existing
  `OfficialSignOnlyReplayExecutor`. It must preserve preview-versus-execution
  quote semantics; CP1 deliberately does not synthesize that confirmation.

### CP1 continuation audit — 20 September 2026

- A read-only M3 API audit found that this is not an adapter-only omission:
  `handoffIntentToM3` currently reconstructs a `PurchaseRecord`, fetches/binds
  one challenge, and immediately invokes its executor. It cannot consume the
  already-approved durable purchase, durable confirmation, and a second fresh
  execution quote required by the local production contract.
- **Act Now / blocker to pre-live candidate:** refactor the Node seam to add a
  dedicated supervised-submit path that takes the existing approved purchase
  and prepared M3 input, writes `payment_attempted` before executor invocation,
  and reloads M3 execution authority on restart. Current CP1 can otherwise
  leave the purchase record `approved` after an executor-start crash even
  though the M3 execution ledger correctly blocks a second attempt.
- The required M3 authority functions are already present and must be reused:
  `prepareApprovedPurchase`, `confirmApprovedPurchaseTerms`,
  `authorizeFreshExecutionQuote`, `assertConfirmationForApproval`, and
  `OfficialSignOnlyReplayExecutor`. No product decision or credential is
  required for that code work; no real executor was invoked during the audit.

### CP2 supervised-seam repair — 20 September 2026

- Added `handoffApprovedPurchaseToM3`: a Node-only M4×M3 seam that consumes
  the durable *approved* purchase, confirms the fixed Intent↔Purchase identity,
  and writes `payment_attempted` through the driver ledger callback BEFORE an
  executor can run. Restart from that boundary cannot execute again; it must
  reconcile/observe the durable M3 execution authority.
- Added a safe confirmation ledger and supervised adapter building blocks. The
  adapter reloads immutable confirmation identity, requires it to match the
  durable purchase/approval, obtains a fresh quote only inside its executor
  wrapper, and delegates material-term/freshness checks to frozen M3 kernels
  before constructing `OfficialSignOnlyReplayExecutor`.
- Focused proof now passes 4/4: confirmation survives a fresh ledger instance,
  confirmation replacement is refused, and an injected ambiguous executor sees
  durable `payment_attempted` before the M4/M3 reconciliation transition.
  Root and Convex TypeScript remain clean. No real executor was called.

### CP3 response-recovery repair — 20 September 2026

- A successful official signed replay can return a safe protected result before
  independent settlement is observable. That safe result is now staged on the
  durable submitted M3 purchase (never an authorization/header), then consumed
  only by the separate settled→result_received observation. Restart therefore
  does not need a second signed replay merely to recover the provider result.
- Existing M4×M3 seam and driver suites pass 23/23 with root and Convex
  TypeScript clean. This remains simulated/injected evidence only; no live
  financial operation occurred.

### CP4 concrete local composition — 20 September 2026

- `observe`/`execute` now construct the concrete local composition by default:
  file-ledger authorities, durable confirmation reader, Convex bridge, fresh
  challenge machinery, `OfficialSignOnlyReplayExecutor` wrapper, exact X Layer
  settlement reader, protected-result verifier, and M4 writeback. A custom
  adapter remains an explicit reviewed override, not a missing production
  dependency.
- Standard successful signed replay results are recovered from the staged safe
  result; the fallback refuses to issue another signed provider replay. Real
  execution remains explicitly disabled unless a later supervised session sets
  `M4_M3_EXECUTION_ENABLED=true` after founder confirmation.
- Focused seam/driver suite: 24/24 pass; root and Convex TypeScript clean.
  Composition construction test performs no fetch, signing, executor call, or
  chain operation.

### CP5 local preview/confirmation completion — 20 September 2026

- The local production CLI now exposes the complete safe supervised setup path:
  `prepare` creates/reuses one M3 purchase identity; `preview` fetches only a
  402 challenge, binds exact permitted M3 terms, and stores a safe
  founder-visible preview; `confirm --confirmation-id` persists only the exact
  Purchase/Approval/terms confirmation. `execute` remains separately gated and
  was not enabled or invoked in this work.
- Preview data is M3-owned and durable in `.m3-preview-quotes.json`; it omits
  signing requirements and all wallet/credential material. Different local
  preview payment handles are permitted only when all material terms are equal.
  A changed amount, asset, network, recipient, resource, timeout, or EIP-712
  domain is refused before execution. Confirmation and purchase files take an
  exclusive local lock and use atomic replacement, so concurrent conflicting
  authority writes fail closed.
- Driver preparation/execution now requires M4 `awaiting_m3`, closing the path
  where an already handed-off, result-recorded, or verified intent might be
  sent toward the executor after a restart.
- Focused evidence: 161/161 pass across production driver, M4×M3 seam,
  lifecycle, confirmation/quote, authority, reconciliation, settlement,
  write/wake, completion, and actual Convex management seams. Root and Convex
  TypeScript are clean. The Windows Convex browser-bundle probe was corrected
  to execute esbuild through Node and a temporary writable output directory.
- **Next:** inspect exact diff, commit/push the local-driver completion
  checkpoint, freeze a code SHA, run the canonical broad gate once, then give
  that exact SHA to an independent read-only R3 reviewer. No live payment,
  signing, submission, provider replay, or paid request has occurred.

### CP6 R3 blocker repair — 20 September 2026

- Independent R3 against `fe56db1` correctly failed on three Act Now defects:
  bearer-token-only M3 facts could forge verified M4 state, a failed Convex
  write could strand a durable verified purchase before Somebody resumed, and
  an acquisition proof could bind an external-effect obligation.
- Repairs add a separate `M4_M3_FACT_ATTESTATION_KEY` HMAC envelope for each
  exact M3 fact (the bearer bridge token alone is no longer proof), a durable
  per-purchase M4 outbox that replays the exact governed transition before any
  later observation, and separate result/effect verified-intent fact sets.
  Attested pre-revision financial facts remain reportable, but stale facts still
  cannot satisfy a newer Requirement.
- New direct regressions invoke the actual Convex bridge handler with a forged
  bearer-token sequence, interrupt governed writeback then restart, report a
  pre-revision submission, and attempt to satisfy an effect with acquisition
  evidence. Focused repair evidence: 39/39 pass; root and Convex TypeScript
  clean. Next: commit/push, freeze a new SHA, rerun the exact broad gate, then
  commission a NEW independent R3 review of that new SHA.

### CP7 replacement-candidate R3 repair — 20 September 2026

- A new independent reviewer invalidated the first replacement candidate before
  verdict: configuration could reuse the bearer token as its M3 fact key, and
  an acknowledged Convex transition whose response was lost could disagree with
  the outbox timestamp. Neither defect performed a financial action.
- The bridge and CLI now reject equal attestation/bearer secrets before
  execute/observe. The outbox writes the M4 kernel's actual transition timestamp
  rather than a pre-observation clock, so restart recognizes a committed write
  even when its response was lost. Direct regressions pass 13/13 with root and
  Convex TypeScript clean. Next: commit/push, freeze another exact candidate,
  rerun the canonical gate, and commission a fresh independent R3.

### CP8 final R3 blocker repair candidate — 20 September 2026

- Starting candidate `fcf7a1ad42100d52a2a07ac900a50edcafde7e99` was rejected
  by R3 on exactly two Act Now defects: a revoked exact founder spend grant was
  not reloaded by the Node snapshot, and the production CLI allowed a runtime
  adapter-module override.
- Code candidate `88afa084f64d57a0b189811df846d0016ac87e3e` repairs both
  narrowly. `convex/m3Driver.ts` now derives `founderSpendApprovalCurrent` only
  from the exact grant named by the intent: it must exist, match Objective,
  remain unrevoked, and cover `priceUsd`. `prepare`, `preview`, `confirm`, and
  `execute` fail closed without it; `observe`/`reconcile` deliberately remain
  available after a possible financial effect. The CLI now has no runtime
  adapter override and uses the concrete local composition for execute/observe
  only; dependency injection stays at the library test seam.
- Focused affected evidence: 15/15 pass (`m3ProductionDriver` and
  `m3DriverBridge`); root and Convex TypeScript exit 0. Exact candidate broad
  gate, run once: `npm test` 611 pass / 0 fail, root TypeScript exit 0, Convex
  TypeScript exit 0. No production build was required by the established gate.
- Latest pushed code checkpoint: `88afa084f64d57a0b189811df846d0016ac87e3e` on
  `fix/m4-m3-production-driver`. The pending action is an independent final R3
  recheck of this exact code SHA. No live payment, signing, submission,
  provider replay, paid request, wallet command, or mainnet operation occurred.

No live payment occurred in this CP1 work.

> **M4 × M3 INTEGRATION (this branch `integration/m4-m3`).** This ledger now covers the
> integration of the closed M4 CP8 management engine with the frozen accepted M3 buyer
> rail. Both sides' historical evidence is preserved below unchanged: the M3
> disposition block (frozen, accepted) first, then the M4 CP8 ledger. The integration
> checkpoints, merge SHA, focused evidence, remaining live-local proof, and R3 status
> are recorded in the **M4 × M3 INTEGRATION LEDGER** section appended near the end.

---

## M3 FROZEN DISPOSITION (historical — preserved unchanged from main@37afaa5)

Status: **M3 ACCEPTED / PROMOTED / FROZEN — M4 (`feat/m4-management-engine`) is the active lane**
Updated: **19 September 2026**

## M3 FINAL DISPOSITION (authoritative; supersedes "review pending" / "do not promote" prose below)

M3 ACCEPTED / FROZEN FOR HACKATHON SCOPE.

R2: **PASS WITH PARKED / ACCEPTED RISKS**

Park for Later:
- stale ledger lock recovery
- global npm shim

Ignore / Accept Risk for M3:
- persist `authorization.from` for a more formally complete `(from, nonce)` authorization identity
  (R2.2 already binds settlement to the retained EIP-3009 authorization identity; judged sufficient for demo scope)

NO MORE M3 PAYMENT FIXERS unless materially new evidence appears.
NO MORE LIVE M3 PAYMENT required for promotion.

Historical evidence below is preserved unchanged. M3 remains the single payment
execution/settlement authority; M4 orchestrates and hands authorized acquisition
intents to the M3 rail without duplicating payment state.

## CURRENT M3 CONTROLLED SELLER CHECKPOINT

Branch: `feat/m3-live-payment` at the R2.2 final-fixer candidate SHA recorded below.
R2 fixer implementation candidate: `ebc4278` (`Harden M3 payment execution safety`).
R2.1 fixer implementation candidate: `16600bdac9e9925e6120bd4d6d92bb4464ff6fc5`
(`Close R2.1 payment replay gaps`).
R2.2 final payment-safety implementation candidate: `bfbd539597c1affeaea8b2af92465267ee956cf3`
(`Bind settlement to signed authorization`). The final review candidate is this
implementation checkpoint plus the docs reconciliation below.

Implemented the narrow controlled seller at `GET /m3/paid-ping` using the official
OKX TypeScript seller SDK (`@okxweb3/x402-core`, `@okxweb3/x402-evm`,
`@okxweb3/x402-express`). The seller is loopback-only on `http://127.0.0.1:4021`,
Testnet-only (`eip155:1952`), uses the current SDK USDT0 Testnet asset, and binds
the recipient only from `M3_SELLER_RECEIVER_ADDRESS`. Credentials remain env-only.

The buyer now accepts the official x402 v2 top-level `resource` plus
`PAYMENT-REQUIRED` header while preserving the existing legacy amount shim and
single sign/replay, no-redirect, no-retry, no-secret-persistence boundaries.

Focused seller and buyer seam tests pass, including unpaid 402 shape, Testnet and
recipient binding, wrong-network/host rejection, top-level resource parsing,
loopback origin/path freeze, secret redaction, and durable single-attempt behavior.

The controlled M3 live payment succeeded on 18–19 September 2026 and remains the
accepted live evidence:
- purchase `purchase-m3-1789769056615`;
- transaction `0x7d1d639910471bc573a45d7e1d1d4bea1afe081a3dc59862703251fdc3e8660d`;
- X Layer Testnet block `41310643`, receipt status `1`;
- exact 0.01 USD₮0 (`10000` atomic units), buyer → seller;
- controlled `GET /m3/paid-ping` returned HTTP 200 and the protected result;
- independent ERC-20 Transfer readback matched exactly; application reached verified.

R2 found payment-safety blockers in purchase identity, durable exactly-once
authority, endpoint freezing, protected-result verification, settlement binding,
string redaction, and timeout validation. This fixer pass addressed those blockers
with focused tests. M3 is **not promoted** until the next R2 review passes. Do not
run another live payment unless the reviewer specifically determines it is necessary.

R2.1 closed the two remaining payment-safety gaps without reopening the broader R2
scope:
- the M3 payment ledger is resolved from the application/module location, never
  from `process.cwd()` or a per-invocation override; separate launch directories
  therefore share one durable authority;
- installed `@okxweb3/x402-evm` inspection confirmed native EIP-3009/Permit2
  nonces, but this official Onchain OS adapter does not retain a verifiable
  nonce-to-transaction linkage, so settlement now requires an independently
  fetched receipt-block timestamp no more than 120 seconds older than the durable
  execution claim; the weak `SettlementReader` adapter fails closed.

R2.1 verification: local TypeScript check and 139 focused payment tests pass;
no additional live payment was run. The repository remains review-gated and must
not be promoted yet.

R2.2 replaced temporal settlement association with protocol-native EIP-3009
linkage. The installed OKX/x402 path and the accepted historical X Layer
transaction were independently inspected as direct `transferWithAuthorization`
calls. The durable attempt now stores only the safe authorization identity
(`authorizationKind`, nonce, `validAfter`, `validBefore`) before merchant replay;
the verifier fetches `eth_getTransactionByHash` and decodes the installed x402
EIP-3009 ABI, requiring the current nonce, payer, recipient, amount, validity
window, token target, and X Layer chain before exact receipt verification. The
120-second block freshness check remains defense-in-depth only. Missing or
malformed authorization identity, calldata, target, or nonce fails closed.

The historical live transaction can be decoded and contains an EIP-3009 nonce,
but the pre-R2.2 attempt did not durably retain that nonce, so the old evidence
does not retroactively prove current execution-attempt linkage. No new live
payment was performed. Final R2 review is still required; do not promote.

---

## M3 PAYMENT SAFETY FIXER CHECKPOINT

Audit date: **18 September 2026**. Full matrix and local preflight:
`docs/work/M3_PAYMENT_PREFLIGHT.md`.

Application hardening on `feat/m3-live-payment` now also:
- accepts current `amount` and historical `maxAmountRequired` x402 shapes
  without accepting disagreement;
- classifies source-proven quote/HPKE failures as pre-submission while keeping
  unknown CLI failures ambiguous;
- forces post-submission failures and failed-purchase retries through explicit
  reconciliation evidence;
- independently verifies X Layer chain/receipt + exact ERC-20 Transfer terms;
- persists a pre-sign execution claim in the application-owned payment ledger;
- binds final signing to purchase and approval identities plus one canonical
  merchant endpoint;
- requires the controlled M3 protected-result contract before `verified`.

No additional payment command was run during this fixer pass. The existing live
evidence remains relied upon because these changes harden application-owned
authority, validation, persistence, and readback seams without changing the TEE
signing protocol, network, asset, recipient, amount, or facilitator interaction.
Do not merge M3 to main.

---

## M2 ACCEPTED — live runtime proof (fix/m2-live-acceptance)

Deployment: `clean-tapir-151` (`dropandreset-main/somebody-okx`). Provider: `openrouter` / `openai/gpt-5.6-terra`.

**Live positive proof** — objective `obj_1789721537926_1a4a97`, run `run_1789721544165_y7d26u`:

- founder objective → server planner → `growth_launch_operations` MAKE;
- real Agent/Runner; company record `launch/context` + public web observation;
- artifact `launch/page-message` v1→**v2** (`provenanceRunId` = run id);
- `request_resource` → ResourceNeed `need_1789721567496_o2ez3v` (`proprietary_data`, provider-agnostic purpose);
- OKX discovery adapter attempted live CLI (unavailable in Convex cloud Node) → **explicit snapshot fallback** with `fallbackReason=live_cli_unavailable_or_failed`;
- candidates assessed; Newsliquid `newsliquid_twitter_search` selected BUY (`dec_1789721567496_9nypj6`);
- need `buy_pending`; objective **`waiting_for_resource`**; **no payment/spend state**;
- UI Mission section renders needs/candidates/waiting.

**M1 compatibility:** accepted M1 objective `obj_1789659986103_l9gomb` still loads (`completed`, plan present).

**Corrections in this pass:** official `onchainos` 4.6.1 discovery finding + adapter; M3 `PaymentExecutor` boundary (test scaffold ≠ production signing).

**Gate (once):** focused M2/M1 tests pass; root + Convex `tsc` clean; `next build` clean.

Accepted integration tip before promotion: see git SHA on `fix/m2-live-acceptance` / `main` after promotion.

---

## OVERNIGHT RUN LEDGER (superseded by M2 ACCEPTED above; kept for provenance)

Integration branch: `qoder/general-session-fk5qjv`
Base / CHECKPOINT A0 (M2 branch reconciled with origin/main): `72321ed8e78c8b366a46df5fe56ddb2e81ef5386`
Frozen contracts: `docs/work/M2_SHARED_CONTRACT.md` @ `d61bfcf1083f80c8737b4058930f352f82bc00dc`
CHECKPOINT 1 (lanes A+B+C+M3 integrated, 228/228 tests, root+convex tsc clean): `9ed74856b6fd52c6000e392a33cdc60b293b21f8`
CHECKPOINT 2 (orchestration seam + canonical M2 dry-engine proof + M4 adapters, 244/244): `16a3b159b58496029137548c085c69454bbde130`
CHECKPOINT 3 (BUY≠failure waiting_for_resource lifecycle, 247/247): `f2ddc7363a1d8f286116219fd95b3e0cd6b44666`
CHECKPOINT 4 (generic read-model/UI prep, 255/255): `281a8a9b6ea1a29a5bb6196ffdd08c603029b0f7`
CHECKPOINT 5 (scenario-coupling audit + invariant review + next build pass): `a0f93793a734a7e8f8d918fdce9f22ebe9129915`

FINAL OVERNIGHT STATUS:
- M2 IMPLEMENTATION COMPLETE — LIVE ACCEPTANCE PENDING (no Convex deployment/model creds in this environment; canonical chain proven deterministically offline in tests/canonicalM2.test.ts).
- M3 IMPLEMENTATION READY — LIVE TESTNET SIGN/PAY ACCEPTANCE PENDING (rail stops at READY_TO_SIGN; nothing signed/submitted/spent).
- M4 PROVIDER ADAPTERS READY — LIVE PROVIDER EXECUTION PENDING (fixture-driven; no paid calls).
- UI/read-model prep complete for multi-step mission states.
- Full evidence: BUILD_DELTA.md §3.8; audit: docs/work/INVARIANT_REVIEW.md.
- Full suite 255/255; root+convex typecheck clean; next build clean.

Morning founder actions (smallest path to acceptance):
1. `npx convex dev` on a fresh deployment + set LIVE_AI_ENABLED/AI_MODEL/provider key → run the canonical objective live → M2 live acceptance.
2. At READY_TO_SIGN: provide an explicit testnet wallet + approval bounds in a supervised session → sign Mock Merchant challenge on X Layer Testnet (eip155:1952) → M3 live acceptance → then R2 review.
3. Supervised Newsliquid testnet purchase + xbird publish with demo X creds → M4 live → R3 review.
4. Optional: confirm an official OKX discovery CLI/library exists and swap it behind MarketDiscovery.

Lane branches (all pushed, remote==local verified by PRIMARY):
- Lane A resource-need: `lane/a-resource-need` @ `c8cc432` (13/13) — ResourceNeed + SourcingDecisionRecord primitives.
- Lane B market-discovery: `lane/b-market-discovery` @ `44a9c73` (14/14) — discovery iface, verified registry DATA, candidate assessment. FINDING: no official OKX programmatic discovery primitive confirmed → snapshot is primary behind replaceable MarketDiscovery interface.
- Lane C artifact/growth-worker: `lane/c-artifact-growth-worker` @ `b672e97` (artifact 8/8, worker/workforce regression 24/24) — CompanyArtifact + growth capability + request_resource/update_company_artifact tools. GAP: tests/growthWorker.test.ts not produced (behavior verified by PRIMARY throwaway probe).
- Lane M3 buyer-rail: `lane/m3-buyer-rail` @ `b05e117` (72/72) — 402 dynamic binding, purchase records, retry/reconcile, READY_TO_SIGN, secret boundary. PRIMARY reconstructed lost lib/payment/types.ts (concurrent-checkout casualty) and fixed test fixtures.

INCIDENT: all child agents shared ONE working tree → concurrent `git checkout` contaminated branches (Lane A commit landed on lane/m3, Lane B dup on lane/c, remote lane/m3 held mixed commit 8bd777d). PRIMARY stood children down, salvaged files to /tmp/salvage, reconstructed each lane in isolated worktrees, force-with-lease corrected lane/m3. No remote corruption on integration branch. LESSON: do not spawn multiple writer children into the shared tree; PRIMARY owns all git from now.

Discovery finding (Lane B): no supported official OKX programmatic discovery API confirmed this pass; `agent asp-match/search/service-list` CLI surface not verifiable as a runtime dependency. Snapshot fallback is PRIMARY path; live CLI integration is founder-gated. Registry DATA holds FlyBeacon/Newsliquid/xbird service→ResourceClass mappings.

Next PRIMARY actions (safe order §33): wire ResourceNeed/CompanyArtifact/purchase persistence into Convex schema + objectives.ts + objectiveRunner.ts; add `waiting_for_resource` lifecycle (BUY is not failure); seed canonical launch artifact DATA; wire discovery+assessment seam per need; then read-model/UI (Lane D), provider adapters (Lane M4), invariant review (Lane E). STOP at READY_TO_SIGN / any founder-auth boundary.

Boundaries NOT crossed and will not be: no wallet/signing/tx-submit/spend, no founder X creds, no publish, no paid provider call, no mainnet.

---

## M4 CP8 LEDGER (historical — preserved unchanged from qoder/general-session-1dclny@99df92d)

Status: **ACTIVE — one long-horizon M4 task**  
Updated: **19 September 2026**  
Repository: `dropandresetmain-prog/somebody-okx`

## Goal

Implement the approved generic Somebody management engine on one M4 branch.

Do **not** split this into M4A/M4B/etc. The checkpoints below are working-memory checkpoints only.

Accepted base before this docs checkpoint:

`main@1fa7962d9ef0d359951d14993834d1d419a5c980`

## Architecture locked

- LangGraph = Somebody orchestration/control loop.
- Convex = authoritative company/business state.
- `@openai/agents` = That Guy execution.
- LangChain = not adopted.
- M3 buyer rail remains separate financial authority and integrates later.
- Somebody is a persistent managerial identity.
- That Guy identities persist; runs are ephemeral.
- Somebody alone staffs, authorizes acquisition and proposes Objective completion.

## Management protocol locked

```text
Objective
→ Outcome Contract
→ Outcome Levels / minimum completion bar
→ required/supporting Requirements
→ MAKE / BUY / HYBRID / WAIT / ASK / BLOCK strategies
→ grounded options
→ LLM recommendation
→ deterministic authorization
→ execution
→ verification
→ Convex state update
→ wake Somebody
→ replan
↺
```

## Approved product decisions

1. Risk-based Outcome Contract autonomy; material ambiguity can require founder approval.
2. Multiple Outcome Levels with a minimum completion bar.
3. LLM proposes semantic Requirements; application maps/validates governed forms.
4. Required + supporting Requirements; incomplete supporting work must be disclosed.
5. MAKE / BUY / HYBRID / WAIT / ASK / BLOCK; investigation is bounded work.
6. Consider both internal and external paths when feasible; discovery may be bounded.
7. Prefer REUSE, allow supported CREATE reasons.
8. That Guy breadth = smallest coherent bounded responsibility.
9. Workers request capability/resource; Somebody resolves.
10. Wake on meaningful state change; no idle polling loop.
11. Maintain coarse plan; authorize next bounded action and replan.
12. Risk/materiality governs autonomous investigation vs founder escalation.
13. Somebody is a persistent managerial identity.
14. Somebody proposes completion; deterministic evidence/contract gate accepts.
15. Dynamically define semantic capabilities/tool contracts; real authority still requires governed executable primitives/integrations/credentials/authorization.
16. Main UI shows high-level decisions; optional deeper trace/graph.

## M3 dependency

M3/R2 continues in its separate lane and currently has an external blocker.

Do not restart payment research or invent a second payment implementation.

Tonight M4 should implement the generic external acquisition/effect seam and may truthfully stop/wait at that boundary.

When M3 is accepted, integrate its buyer-rail contract on this M4 branch and complete Cutoff 1. This remains M4, not a new milestone.

## Working checkpoints

### Checkpoint 0 — docs / branch truth

- [x] lock architecture decision;
- [x] lock management-protocol decisions;
- [x] reconcile stale M2-era planning assumptions;
- [x] verify exact M4 branch/head before implementation. (2026-09-19: `feat/m4-management-engine` @ `b475287a4775ed57b4614b2554445cec5a20728e`, ancestry to accepted main `1fa7962d…` proven by fetch + merge-base; worktree clean at start.)

### Checkpoint 1 — domain truth

- [x] Outcome Contract / Outcome Level contracts;
- [x] minimum completion bar;
- [x] Requirement identity/revision/priority/lifecycle;
- [x] separate provider rejection from requirement resolution;
- [x] explicit Objective completion gate;
- [x] preserve M1/M2 historical row/evidence truth where required. (no schema or M2 kernel rewritten in CP1; M2 tables/tests untouched.)

Evidence:
- focused changed-behavior tests only. (`tests/managementContract.test.ts` 12 pass, `tests/managementRequirements.test.ts` 18 pass via `npx tsx --test`; `npx tsc --noEmit` clean. Kernels: `lib/management/{types,contract,proposals,requirements,completion,authorization,capability,staffing,budget,options}.ts` + `lib/sourcing/eligibility.ts` — shared contract frozen at CP1.)
- checkpoint commit: `27128d639829bdf83a03a6f633f2d1f47b6dc07b` (pushed to feat/m4-management-engine).

### Checkpoint 2 — managerial decision protocol

- [x] semantic strategy proposal;
- [x] grounded candidate options;
- [x] internal/external/hybrid representation;
- [x] hard eligibility;
- [x] comparable economic facts + provenance/confidence;
- [x] LLM managerial recommendation contract;
- [x] deterministic authorization recheck;
- [x] remove automatic internal-availability ⇒ MAKE final choice. (kernel level: `runManagerialDecisionPass` grounds internal availability as an ELIGIBLE fact only; `evaluateOptionEligibility` no longer couples control⇒mandate; the M2 kernel remains untouched for historical rows. Runtime call-site replacement lands with CP3/CP4 wiring.)

Evidence:
- economic counterexamples; (`tests/managementDecision.test.ts` 13 pass: BUY authorized despite eligible internal; over-budget wrapper visible-but-ineligible with `budget_exceeded` recorded; within-budget wrapper beatable on comparable facts; unverified source never offered; null price ineligible; >authority ⇒ approval_required; external_disabled refusal; outage ⇒ typed refusal zero effects; stale revision refused; material ambiguity ⇒ approval_required.)
- redundant external wrapper does not automatically win; (same suite — two explicit wrapper tests.)
- hybrid option supported. (deterministic hybrid grounding, facts never undercut parts, HYBRID proofs = external result + artifact + observation.)

### Checkpoint 3 — persistent workforce

- [x] persist Worker identity / lifecycle / reservation; (`convex/schema.ts` +8 M4 tables: workers, outcomeContracts, requirements, managerialDecisions, assignments, executionIntents, wakeEvents, objectiveBudgets. `convex/managementValidators.ts` mirrors the frozen contract; `convex/internal/workforce.ts` mutations; `objectiveRecord.management` added as an OPTIONAL field so every M1/M2 row keeps loading.)
- [x] actual REUSE demonstrated; (`tests/managementStaffing.test.ts`: capable+available worker is reused, active lease blocks reuse, lapsed lease restores it; `listWorkers` is the real inventory read replacing `resolveWorker({inventory: []})` at convex/objectives.ts:332 — call-site swap lands with CP7 integration.)
- [x] supported CREATE reason path; (availability + parallelism reasons proven; unsupported paths return typed `no_staffing_possible` with blockers.)
- [x] dynamic semantic CapabilitySpec/tool-contract definition; (`addDynamicCapability` runs `validateCapabilitySpec` and writes NOTHING on failure — persistence test proves the negative.)
- [x] no dynamic real-world authority invention; (`authorize_external_spend` / any externalAuthority primitive rejected by the validator; worker→worker creation asserted structurally impossible in the staffing test.)
- [x] capability/resource request returns through Somebody; (CP7: `request_resource` persists the sourced need, then `planWakeForResourceRequest` (lib/management/wakes.ts — sha256-24 eventId, dedupeKey `resource_request:<obj>:<run>:<class>:<purpose>`) emits a `worker_resource_request` wake through the SHIPPED `appendWakeEvent` and schedules `internal.management.runManagementPass` — Somebody resolves; the worker cannot pay or fulfill. Round-trip proven on the real handler in `tests/managementWakesPersistence.test.ts`.)
- [x] objective-wide worker/assignment limits. (`applyBudgetSpend` delegates every counter to lib/management/budget.ts — no arithmetic in storage; `countObjectiveWorkers` + maxWorkersCreated/maxActiveAssignments enforced; `model_call` given its own pure helper `trySpendModelCall` so the 40-decision and 60-model-call ceilings stay independent.)

Evidence:
- reuse/create focused tests; (`tests/managementStaffing.test.ts` 9 pass.)
- unsupported capability blocks/escalates rather than throws. (pure staffing + capability tests, plus `tests/managementWorkforce.test.ts` / `tests/managementWorkforcePersistence.test.ts` — 31 pass under convex-test covering reservation fencing, wake dedupe by `dedupeKey`, budget spend refusals that do not mutate stored figures, and stale downsert protection on satisfied requirements.)

### Checkpoint 4 — LangGraph management loop

- [x] minimal graph state; (`lib/management/graph.ts` `GraphAnnotation` is field-for-field the frozen `GraphState` — objectiveKey, contractRevision, focusRequirementKey, managerDecisionId, pendingIntentId, wakeReason, wakeEventIds, continuation (string map, correlation only), lastNode, pass — plus one internal `outcome` channel for the settle hand-off, mapped back out of the returned GraphState in `invoke()`. No business row type appears anywhere in the annotation; a compile-pin test holds `ReducerFacts`/graph wiring honest.)
- [x] observe / manage / ground / authorize / dispatch / wait / verify / resolve loop; (observeNode consumes wakes → reduceNode applies the pure `reduceManagementState` and persists the control state via `writeObjectiveState` → conditional edge on `continuation.reducerAction` routes to decideNode (CP2 `runManagerialDecisionPass`: ground→recommend→deterministically reauthorize→bind→persist) / proposeNode (resolve: gate only) / verifyNode (routes wake-borne evidence into satisfaction ATTEMPTS only) / settleNode (computes the pass outcome + expected next wake) → END.)
- [x] consequential nodes reload Convex truth; (decideNode, proposeNode and settleNode each call `ports.loadContract`/`loadRequirements`/`loadGrounded` fresh — nothing downstream trusts business rows carried through the graph channel; the fake ports serve whatever the in-memory world holds at call time and `loadRequirements` returns a `structuredClone`, so a node cannot mask a stale read from the next node.)
- [x] event-driven wake/resume; (wake1 → decide+dispatch, wake2 → verified rows → propose → gate → completed; duplicate wake (same event id) consumes to a no-op turn — nothing re-fires. Production resumes via `scheduleWake` + `consumeWakeEvents`, not timers polling business state.)
- [x] quiescent waiting/approval/escalation states; (waiting_for_resource / waiting_for_wake / approval_required / escalated / recovery_required only ever yield await_wake/hold actions; the reduce node asserts `isCoherentHold` on EVERY pass and throws a typed incoherence error otherwise, and the budget-exhaustion and pending-approval graph tests land in exactly those states with zero decision passes run.)
- [x] no scenario/provider state branches; (`lib/management/graph.ts` + `lib/management/reducer.ts` contain no scenario, provider, or role-name string comparisons in control flow — routing derives purely from contract/requirement/grounded-option/verdict/budget shapes; grep-verified at this commit. Graph tests use the fixture key "obj_launch" but no branch reads it.)
- [x] coarse plan + next bounded action; (`ManagerialDecision.coarsePlanSummary` is composed from typed decision notes; the reducer's `continuation` carries the single next action + reason, and reduceNode persists state+detail onto the objective via `writeObjectiveState` — the objective's `management.controlNotes` field is the CP7 call-site that stores it.)

Evidence:
- real Agent/Runner internal continuation across at least one wake/replan. (`tests/managementWorkerContinuation.test.ts`: a genuine `@openai/agents` Runner executes run A (public observation survives, company-record lookup fails, run ends WITHOUT claiming completion — `assignment_run_finished` is then refused by the requirements kernel); the wake injects the record; run B under the same idempotency scope continues from persisted evidence and finishes — the run finalizes because the application's `evaluateCompletion` verdict came back clean after `submit_result` (scripted `request_completion` turn never consumed: completion is application-owned, the same semantic M2 pinned in tests/worker.test.ts), and only then does `attemptRequirementSatisfaction` accept satisfaction through the kernel with current-revision bound `application_observation` proofs. M4 suites now 106 pass (contract 12, requirements 18, decision 13, reducer 15, graph 7, staffing 9, continuation 1 = 75 pure; workforce+persistence 31); M2 regressions objective/workforce/sourcing/runLifecycle/resourceNeed 76 + worker 13 all pass; tsc clean.)

### Checkpoint 5 — recovery / Cutoff 2

- [x] stable decision/assignment/effect identities; (`tests/managementCutoff2.test.ts` — optionId replay determinism: equal semantics collide onto ONE id, revision/kind can never alias a live option; plus CP3's replay-stable `deriveWorkerKey` and by_idempotency `putIntent` upsert. ExecutionIntent id derivation lands with CP6.)
- [x] duplicate wake-up harmless; (graph test: re-invoking after `consumedAt` folds zero fresh events; persistence: `appendWakeEvent` by_dedupe pre-check returns duplicate:true and `markWakeConsumed` only touches null cursors.)
- [x] stale objective/run fenced; (requirements kernel refuses stale-revision proof; `putRequirement` rejects stale downserts on satisfied rows; `releaseWorker` is owner-fenced — a different assignmentId cannot release; decision pass refuses a stale contract revision; reducer rule 2 lands revision mismatch on recovery_required.)
- [x] finite decision/retry/time/cost/no-progress limits; (CP5 budget sweep: every ceiling exhausted ⇒ typed verdict (recovery_required/escalated/waiting/approval_required), never an exception; the 40-decision and 60-model-call ceilings pinned independent both ways; commit-refusal leaves stored figures untouched.)
- [x] invalid model output bounded repair/failure; (CP5 parser sweep: 17 hostile shapes — null/string/number/array/missing/wrong-target/hallucinated-option/oversized/junk-list — every one a typed ok/refusal, zero throws; accepted values only ever carry application-known eligible ids; plus decision-pass outage marker surfacing.)
- [x] weird unrelated prompts terminate/wait coherently; (CP5 graph passes: garbage wake summary on over-budget objective ⇒ recovery_required consumed-once with zero decision calls; nonsense objective ⇒ typed executing decision work — never a crash, never completed; `isCoherentHold` asserted every reduce.)
- [x] no infinite worker spawning; (CP5 replay test: identical envelope ×10 ⇒ ONE reused worker key and ONE option id; `maxWorkersCreated` spend refusal typed; worker→worker creation structurally 0 (CP3 staffing test); graph totals verified over 30 consecutive invokes.)
- [x] no false completion. (CP5: a hostile row reading "satisfied" still fails the gate when the application verified no proofs — unmet names the exact proof; `assignment_run_finished` refusal pinned in CP4 continuation test; only accepted gate verdict reaches completed (CP1 gate + CP4 graph tests).)

Evidence:
- targeted adversarial tests only. (`tests/managementCutoff2.test.ts` 12 pass against the real kernels and the real compiled graph; full M4 set 118 pass (75 pure + 31 persistence + 12 adversarial); tsc clean.)

### Checkpoint 6 — external seam

- [x] AuthorizedExecutionIntent for external acquisition/effect; (`lib/management/intents.ts` `createIntentFromAuthorization` — the ONLY way an intent is born: refusal/approval_required/MAKE-wrong-option/ineligible-option all produce typed `{ok:false}` refusals; intentId + idempotencyKey derived from the authorized-decision identity, so replays build byte-identical intents and `putIntent` upserts (by intentId, indexed by_idempotency) leave exactly one row per logical effect. M4 intents ACQUISITION effects; external_effect stays a governed-vocabulary question for later.)
- [x] provider/result/verification events feed back into Convex + wake Somebody; (`planWakeForRailEvent` routes provider_result/verification_result/rail_failure to typed WakeReasons with event-scoped dedupeKeys; `applyRailEvent` advances the intent through a SMALL monotone lifecycle (authorized→awaiting_m3/handed_off→result_recorded→verified|failed→reconciliation_required) with an event-cursor that refuses already-applied event ids; `tests/managementIntentsPersistence.test.ts` drives the SHIPPED `putIntent`/`appendWakeEvent`/`markWakeConsumed` handlers: duplicate webhook dedupes to one wake, consumption closes the consumedAt cursor, re-consume marks 0.)
- [x] no duplicate payment state machine; (this file never references M3 purchase states (submitted/uncertain/settled/…) — the intent lifecycle is Somebody-side bookkeeping only; payment states remain M3's single authority; convex-program typecheck now also clean after fixing four lane defects the root tsc never compiled: `canAcceptReservation` arity bug (real fencing hole), two union-literal returns, and a wake-patch spread typed as partial data.)
- [x] boundary compatible with M3 concepts without claiming M3 success. (`mayHandOffExternally` stays the ONE predicate; under `m3_unavailable` the intent is BORN in awaiting_m3 with boundaryNote "no payment was attempted or made" — recorded, visible, honest; the reducer already reads awaiting_m3 ⇒ waiting_for_resource.)

Evidence:
- mock/fixture seam only if M3 unavailable, labelled truthfully. (`mockBuyerRailFixture` self-describes "MOCK/FIXTURE … NOT M3", prefixes every railRef with `mock:`, and a no-fixture offer refuses with "the real M3 rail is the only production path"; replayed hand-off calls the rail exactly once; a rail refusal never fakes handed_off. `tests/managementIntents.test.ts` 11 + persistence 2 pass; full M4 set 131 pass; M2 regressions 89 pass; `tsc --noEmit` and `tsc -p convex/tsconfig.json` both clean.)

### Checkpoint 7 — tonight completion

- [x] reconcile ledger against implementation;
- [x] targeted regression only where seams changed;
- [x] checkpoint commit/push;
- [x] prepare exact SHA for R3 premium review.

R3 REVIEW SHA (exact): `59f75f7` — branch `feat/m4-management-engine`, pushed to origin (572031c..59f75f7). R3 premium review target = the M4 management-engine candidate at this commit.

CP7 evidence (this milestone, all verified before this ledger edit — both `tsc --noEmit` and `tsc -p convex/tsconfig.json` clean; full suite 404 pass / 0 fail; targeted seams below):

- scenario coupling REMOVED from the runtime: `selectRoleKeyForRequest` deleted; role is now DERIVED from the validated capability envelope's granted permissions via `roleKeyForGrantedPermissions` (lib/objective/planner.ts, single authority; convex/objectives.ts imports it — no duplication). The generic execution-order prompt (lib/worker/runtime.ts) is contract-derived: tool lines from granted permissions, order lines from the assignment, proof lines from `contract.sourceProofs` — no "launch"/"growth"/"convert" vocabulary, no permission-keyword branches.
- persistent workforce REUSE fix (the M2 empty-inventory defect): planObjective reads the real `workers` Convex table as the `resolveWorker` inventory and persists newly created workers (`upsert` semantics via the workers table), so an existing capable+available worker is genuinely reused across objectives.
- growth completion extras removed: readWorkerObservation's artifact-bump/resource-need pushes and finishRun's isGrowthContract artifact-bump extra deleted from the spine; the obligation is expressed as governed proof kinds checked by the independent completion gate.
- `request_resource` → `worker_resource_request` wake + wake-scheduler wiring: planWakeForResourceRequest → shipped `appendWakeEvent` (dedupe by dedupeKey) → `ctx.scheduler.runAfter(0, internal.management.runManagementPass)`.
- run completion → wake + gate proposal path: `finishWithWake` (convex/objectiveRunner.ts) wraps finishRun and emits `planWakeForWorkerResult` (`worker_result`/`worker_failure`, dedupeKey per run+reason) then schedules the management pass; finishRun no longer asserts completion — it records a `completion_proposed` controlNote (M4-managed rows keep state "executing"; M2-legacy rows keep the historical spine transition so canonical M2 evidence is untouched); the independent gate decides.
- production Convex-backed ManagementPorts adapter: convex/management.ts `buildConvexManagementPorts` implements all 17 ports over the SHIPPED workforce mutations/queries (fresh read per call — reload rule; no caching), `runManagementPass` internalMutation is the wake entry point that invokes `buildManagementGraph` once per wake, and `setManagementRecommender` is the injected recommendation seam defaulting to a deterministic non-model recommender (recommend returns null ⇒ typed refusal). External authority is `m3_unavailable` — the truthful resting state; NO production payment/provider claims.
- generated API stub completed: convex/_generated/api.d.ts gained the `management` and `internal/workforce` module entries (codegen is offline-gated; the stub matches the folder→path mapping and typechecks).
- stale-draft housekeeping: /data/workspace/worktrees/cp3-workforce and branch wp/cp3-workforce removed after verifying every flagged file was byte-identical to the branch or a superseded older draft (branch was merged; deleted at 81825cc).

Regression evidence (only seams that changed): tests/managementWakesPersistence.test.ts 4 pass (wake determinism, pointer-not-payload refs, shipped appendWakeEvent dedupe round-trips); tests/managementFinishGate.test.ts 5 pass (completion proposed, never asserted; M4-managed vs M2-legacy branches); tests/managementAdapterPersistence.test.ts 6 pass (ports over real handlers, run-finished refusal, no-contract gate rejection, typed planning outcome); targeted set 160 pass incl. canonical M2 (75), runLifecycle/objective, graph/cutoff2/intents-persistence/workforce persistence; full suite 404/404.

## R3 verdict (SUPERSEDING the CP7/M4 terminal claim above)

The M4 completion report at `7723c09` and the terminal status line above recorded
CP1–CP7 as implemented and self-verified. **R3 premium review of `59f75f7` did not
accept it.** That earlier claim remains in this ledger for provenance but its
TERMINAL status is superseded by:

> M4 ENGINE KERNELS IMPLEMENTED AND UNIT-PROVEN; PRODUCTION WIRING INCOMPLETE;
> M3 SEAM NOT READY; R3 NOT ACCEPTED; CUTOFF 1 NOT PROVEN.

Code reviewed by R3: `59f75f7` (commits `e6af324` and `7723c09` are docs/ledger and
the completion report only; verified by `git diff --stat 59f75f7..7723c09`).

## CP8 — Close the Production Loop (INTERNAL checkpoint, still milestone M4)

Goal: repair the concrete R3 blockers. Not a new milestone. Not M4 acceptance.

Findings to close: **A1–A7** (act now) and **I1–I4** (investigate now; resolve I1–I3,
treat I4 as part of dispatch idempotency).

Baseline verified before editing (2026-09-19):

- `git fetch origin`; `origin/feat/m4-management-engine` = `7723c096f58067c79a59782792ec4346184df1f4` (unchanged since R3).
- `59f75f7f72e40ecaa11f27d1437cef0dfbd2d5fa` is an ancestor of that tip (ancestry proven).
- frozen M3 main still `37afaa5a7cd0aa82a30c63ce6795c48d34f04d07`; NOT merged (CP8 must not merge it).
- worktree clean; no untracked files.
- pre-change gate: `npm test` 404 pass / 0 fail; `tsc --noEmit` and `tsc -p convex/tsconfig.json` both clean.

Working branch: `qoder/general-session-1dclny`, created from `7723c09` (the session's
authorized outcome branch; push destination for CP8 evidence).

### CP8 triage ledger

| # | Finding | Class | Status |
|---|---------|-------|--------|
| A1 | Founder Objective never enters M4 engine | Act Now | **SHIPPED** (CP-2 `696e259`; accepted at CP-5) |
| A2 | Graph decides but never dispatches/verifies | Act Now | **SHIPPED** (CP-2 `696e259`; accepted at CP-5) |
| A3 | waiting/blocked zero-delay self-reschedule | Act Now | **SHIPPED** (CP-2 `696e259`; accepted at CP-5) |
| A4 | null spend authority authorizes BUY/HYBRID | Act Now (critical) | **RESOLVED** (`40ed332`, 13 acceptance tests) |
| A5 | completion-gate proof mismatch + forged satisfaction | Act Now (critical) | **SHIPPED** (CP-3; recomputing gate + binding + scoping + reconciliation, 9 probes; accepted at CP-5) |
| A6 | M2 growth-spine artifact obligation regression | Act Now | **SHIPPED** (CP-2 `696e259` + CP-2b sibling restore; accepted at CP-5) |
| A7 | scenario coupling in generic M4 control flow | Act Now | **SHIPPED** (CP-4; capabilities are model-proposed via parseStrategyProposal + validateCapabilityKeys; the `["growth_launch_operations"]`/`["update_company_artifact"]` literals and hardcoded resource-class arrays are gone from runDecisionPass; accepted at CP-5) |
| I1 | Convex runtime compatibility / node:crypto | Investigate Now | **RESOLVED** (below, `f066c5f`) |
| I2 | model call cannot run inside a mutation | Investigate Now | **RESOLVED** (CP-4; `setManagementRecommender`/`_recommender` deleted; the decision pass is now the durable begin(port)→proposeDecision(action)→applyDecision(mutation) chain, mirroring interpretation; authority only in applyDecision) |
| I3 | no economic facts / discovery + $1 default | Investigate Now | **RESOLVED** (CP-4; grounding wired via buildDecisionPassInput → createSnapshotDiscovery + VERIFIED_SERVICE_REGISTRY through the CP-3 grounding kernels; `discovered: []` is gone, so BUY is reachable; prices carry "provider_quote" provenance or stay null — no invented values; the "$1" was DEFAULT_BUDGET_LIMITS.maxExternalSpendUsd, a budget ceiling, and remains one) |
| I4 | concurrent passes after dispatch | Investigate Now | **SHIPPED** as dispatch idempotency (stable identity + replay guards + reservation fencing, CP-2) |

### CP8 evidence

**I1 — RESOLVED.** `node:crypto` is genuinely incompatible with the Convex default
runtime: modules without `"use node"` are bundled at esbuild `platform: "browser"`,
which cannot resolve it. Proven directly — bundling the pre-fix
`lib/management/options.ts` (still importing `node:crypto`) fails with
`Could not resolve "node:crypto"`, while `--platform=node` succeeds.
`convex/management.ts` and `convex/internal/workforce.ts` declare no `"use node"`
and import those kernels, so this was a deployment blocker, not a style issue.

Fix: `lib/management/sha256.ts` — pure, synchronous, dependency-free SHA-256,
byte-identical to `createHash("sha256").digest("hex")`. Chosen over
`crypto.subtle.digest` (available in the default runtime) because it is async-only
and would turn synchronous business-identity derivation into an await chain across
every kernel — a wider change than the finding warrants. It is not used for any
security purpose; only for deterministic identity material.
Identity SEMANTICS unchanged at every call site (same material, same NUL join, same
24 hex chars); only the implementation moved. Swapped in
`lib/management/{wakes,options,intents}.ts`. `lib/objective/resourceNeed.ts` and
`lib/google/gmail.ts` keep `node:crypto`: both are reachable only from
`"use node"` modules (`convex/objectiveRunner.ts`, `convex/objectives.ts`) or from
app code, which is legitimate — deliberately not churned.

A transcription error (`K[63]`) was caught during this work by deriving the round
constants from the FIPS 180-4 definition — `floor(frac(cbrt(prime)) * 2^32)` —
instead of trusting the hand-typed table. Pinned by test so it cannot recur.

`tests/managementRuntime.test.ts` (4 pass) pins: (a) byte-identity vs node:crypto
over 21 inputs incl. multi-byte UTF-8, astral code points, NUL and 50 000-byte
lengths; (b) NUL-join anti-aliasing; (c) that option/intent/wake identities are
UNMOVED by the swap — recomputed independently with node:crypto; (d) a real
browser-platform esbuild bundle of every default-platform module in `convex/`,
which fails loudly if `node:crypto` is ever reintroduced.

Codegen status: `npx convex codegen` CANNOT run in this sandbox (needs
`CONVEX_DEPLOYMENT` credentials). The manually-edited
`convex/_generated/api.d.ts` is therefore still unverified against real codegen;
`npm run typecheck:convex` is clean and the file matches the codegen template and
the on-disk module set. Deployment-time codegen remains the authoritative check.

Pre-change baseline: 404/404. Post-I1: **408 pass / 0 fail**, both tsc programs clean.

**A4 — RESOLVED (`40ed332`; supersedes the CP7 checkpoint claim).** Founder spend
grants fail closed: authorization of a monetary BUY/HYBRID requires a named,
persisted grant record (`spendApprovalId` threaded decision → authorization →
intent → hand-off predicate); `mayHandOffExternally` refuses a monetary intent
without one. 13 acceptance tests in `tests/managementSpendAuthority.test.ts`.

**CP-2 — A1 + A2 + A3 + A6 + I4 (`696e259`).** The production loop is connected;
no new architecture was added — the existing kernels got their missing seams.

- A1: `submitObjective → beginInterpretation (mutation, reserves the attempt) →
  proposeInterpretation (action — the ONLY model call in the chain) →
  applyInterpretation (mutation; re-parses raw output through the bounded parsers,
  persists Outcome Contract + semantic Requirements + `management.contractId`,
  appends the dedupe-keyed `objective_submitted` wake, schedules the first pass)`.
  A rejected interpretation leaves the objective untouched with a typed cursor;
  the durable `interpretationStatus` makes replay idempotent. Model never
  authoritative.
- A2: `lib/management/dispatch.ts` (new kernel, ~330 lines) owns stable effect
  identities (`deriveAssignmentId`/`deriveRunId`/idempotency scope — pure
  functions of the AUTHORIZED decision row), the legal assignment lifecycle,
  permission-derived proof obligations (`proofSourceClassesFor` /
  `observationProofObligations` — the WorkContract's proof surface follows the
  authorized option's governed envelope, never a scenario template),
  `dispatchTargets` (MAKE→internal, BUY→external, HYBRID→both) and
  `strategyDelivery` (failed/superseded ≠ delivered). The reducer's dead
  `dispatch` action now has rule 9 ("authorized but not delivered", ahead of
  activeWork), rule 8b routes unverified results to the previously-dead verify
  node, and the graph routes on `continuation.reducerAction` instead of the
  never-true `lastNode === "decide"` test. The adapter port
  `dispatchRequirement` reads the persisted authorized decision (never
  re-decides), decodes the authorized option from the decision row itself, and
  runs MAKE through `startManagedRun` → the EXISTING bounded runtime
  (`executeWorker`/`finishRun`/`expireRun`); BUY writes one intent resting in
  `awaiting_m3` — `attemptHandoff` deliberately NOT called, no production buyer
  rail exists. Undeliverable dispatches write a typed `dispatch_deferred` control
  note and stop; a failed/superseded effect row never replays as success (retry
  requires a fresh authorization, bounded by the attempt ceiling).
- A3: `scheduleWake(runAfter(0))` is gone from the settle node. `scheduleTimer`
  throws on a zero delay, holds at most ONE outstanding wake per logical
  condition (`timerState` reads the dedupe ledger), numbers re-arms by sequence,
  and its `timeout` wake is a SELF wake. Quiescent `waiting`/`blocked`/
  `approval_required` resume on meaningful wakes; the only timers are a 5-min
  lease watchdog while internal work is genuinely in flight, a 15-min
  no-eligible-path re-check, and a 60-min founder reminder. `settleNode` records
  PERSISTED progress via `applyPassProgress` → `recordProgress`: progress is read
  from facts the nodes produced (materialWake / authorization / effectId /
  verified / gate-accepted), so an idle objective walks into the finite
  no-progress ceiling in three timer-free cycles. Control notes are bounded
  (identity-replace + 40-row ceiling). One wake may act through
  decide→dispatch→verify→propose (`MAX_CONTINUE_CYCLES = 3`, and only while the
  last cycle actually produced something) — every cycle still consumes the
  persisted decision/model-call ceilings.
- A6: the M2 legacy artifact-change obligation is restored behind
  `isM4Managed` (contractId-boundary predicate) in both finish paths;
  `tests/m2LegacyObligations.test.ts` proves growth runs still must change
  an artifact and M4 rows are judged by the gate instead. The sibling
  `resource_need: growth run must propose a resource need` obligation from
  `572031c` is now RESTORED as well — settled by git archaeology: baseline
  `1fa7962:convex/objectives.ts:706` carried BOTH checks in
  `readWorkerObservation`, while `finishRun` carried only the artifact rule.
  The sibling is therefore reinstated inside the existing `if (!isM4Managed)`
  growth block in `readWorkerObservation` only (not `finishRun`), and three
  new tests pin sibling-reported, sibling-discharged (`proposedByRunId`
  matches the run), and M4-exempt.
- I4: no new pass machinery was invented — one active pass per objective holds
  via the run lease (startManagedRun defers while a different run holds it), the
  reservation fence (`canAcceptReservation` replays only the same assignmentId),
  and find-before-write guards on both effect rows.

Evidence: `tests/managementDispatchPersistence.test.ts` (6) drives the SHIPPED
adapter ports and internal mutations on real storage: MAKE ⇒ exactly one
assignment + reserved worker + run row + budget charges, and two replayed wakes
add ZERO rows; BUY ⇒ one `awaiting_m3` intent with the grant identity and the
truthful boundary note, no run/worker side-effects; HYBRID ⇒ both halves; the
no-decision case ⇒ loud deferral, zero writes, zero budget spend; timer
one-outstanding-per-condition + sequence re-arm after consumption; persisted
no-progress reaches `escalated` from storage alone. Fake ports in
`tests/managementGraph.test.ts` / `tests/managementCutoff2.test.ts` updated to
the new ManagementPorts shape. Post-CP-2: **447 pass / 0 fail** (was 441 +
these 6), `tsc --noEmit` and `typecheck:convex` clean. Post-CP-2b (sibling
restore + 3 tests): **450 pass / 0 fail**, both typecheck programs clean.

**CP-3 — A5 (critical false-completion closure).** The completion gate can no
longer be fooled by anything it is *told*; it only accepts what it can *re-derive*.

- Gate recompute (`lib/management/completion.ts`): `CompletionGateInput` takes
  `factsByRequirementKey: ReadonlyMap<string, ProofFacts>` instead of
  `satisfiedProofKeys`. For every required requirement the gate reloads the
  revision and runs `missingProofs(requirement.proofs, facts, …)` itself — a
  persisted `state:"satisfied"`/resolution is CHECKED against the recompute,
  never substituted for it. A requirement declaring zero governed proofs fails
  closed with a message that names the satisfied-claim forgery signature; a
  `waived` row without `waiver.reason` is refused; `satisfied` with no
  resolution, or with a resolution against a stale revision, is refused; a
  missing facts entry falls back to `NO_PROOF_FACTS` (`lib/management/requirements.ts`)
  so absence fails closed rather than throwing.
- Fact scoping (`convex/management.ts: readScopedProofFacts`): facts are loaded
  per requirement AT the current contract revision, through the real delivery
  rows — assignments matching `requirementKey`+`contractRevision` in
  dispatched/running/result_submitted/verified state give the scoped run ids;
  evidence counts only when `origin === "application_observation"` AND its
  `runId` is in that scope (both `evidenceId` and `sourceId` are collected,
  because a proof param may name either public identity); intents must carry
  the requirement key + revision AND be `verified`; artifacts must have a
  `provenanceRunId` inside scope; `founderConfirmationRefs` is always empty —
  no production founder-answer seam exists, so ASK_FOUNDER fails closed rather
  than accepting an unverifiable class.
- Execution-time binding (`lib/management/contract.ts: bindExecutedProofParams`):
  proofs attached by `attachGovernedProofs` are created unbound; only
  application-verified facts bind them (deterministic sorted-first pick), and an
  already-bound proof is never re-pointed. `recordSatisfactionAttempt` binds
  from scoped facts, records the attempt against `bound` proofs, and on genuine
  satisfaction moves the scoped `result_submitted` assignment to `verified` with
  the full same-transaction bookkeeping (worker history, release, budget spend) —
  replay lands on the verified row and no-ops legally.
- Run-fact reconciliation (`convex/management.ts: reconcileAssignmentRunFacts`):
  production never wrote `result_submitted` when a managed run completed, so the
  verify path was unreachable from real wakes. At `runManagementPass` entry,
  each assignment's OWN `runId` is attributed through the aggregate work items:
  failed run ⇒ failed (+release+spend), stopped+completed ⇒ result_submitted,
  dispatched+running ⇒ running; every transition consumes its own trigger, so
  re-passes are idempotent.
- Rejection durability: a rejected proposal persists as the gate decision row;
  reducer rule 7a ("gate rejected, no open required rows") walks the objective
  into recovery_required. No new write authority was invented for this — the
  existing mechanism already covers it.

Evidence: `tests/managementCompletionGate.test.ts` (9, all on real storage —
the forgeries are direct row writes, which is exactly what A5 must survive):
A5-1 ghost proofRefs naming the right proof keys; A5-2 another requirement's
genuine observation; A5-3 a `model_note` id; A5-4 satisfied against a stale
revision with live facts; A5-5 empty proof list; A5-6 self-granted waiver;
A5-7 another requirement's verified intent on a BUY; then the positive pair —
A5-8 genuine delivery: kernel-bound observation, verify-path bookkeeping
(assignment verified, worker released, budget `activeAssignments` 0) and the
gate's recompute ACCEPTS; A5-9 a completed managed run reconciles to
`result_submitted` at pass entry and still satisfies NOTHING without proof.
Existing suites migrated to the new gate input (`managementRequirements`,
`managementGraph`, `managementCutoff2` — the last one now doubles as the
R3 A5 probe that a fake-satisfied row is refused by BOTH the proof gap and
the missing resolution). Post-CP-3: **459 pass / 0 fail** (was 450 + these 9),
both typecheck programs clean.

**A7 + I2 + I3 — SHIPPED together (CP-4; approved as "runtime wiring of the
already-accepted architecture").** The root cause behind all three was one fact:
`runDecisionPass` ran inside `runManagementPass`, an internalMutation, and a
mutation cannot make a model call. That is why capabilities were hardcoded
(`["growth_launch_operations"]`, A7), grounding was empty (`discovered: []`,
I3), and the recommendation seam was a module-global `_recommender` that was
null in production — so `parseManagerialRecommendation(null)` typed-refused
every pass and production could never authorize a dispatch (I2).

The fix is the decision analogue of the proven interpretation chain, reusing the
existing architecture end to end (no new subsystems):

- **begin** — the `runDecisionPass` port (convex/management.ts) now RESERVES the
  pass: writes the `management.pendingDecision` cursor + cumulative
  `decisionAttempts[req]` ceiling (`BEGIN_DECISION_CEILING = 3`, persisted per
  requirement across revisions), schedules `proposeDecision`, and returns null.
  Deterministic requestId/decisionId
  (`decide_<obj>_<req>_r<rev>_a<n>` / `dec_<obj>_<req>_r<rev>_a<n>`) make a
  replayed wake a no-op. New cursor fields added to the objectiveRecord
  validator.
- **propose** — `proposeDecision` (convex/objectiveRunner.ts, "use node") is the
  ONLY model step and may discover/propose/recommend ONLY: two bounded
  schema-constrained calls (`proposeStrategyWithModel`, `recommendWithModel`),
  plus a NON-authoritative kernel preview whose sole purpose is to surface the
  eligible option ids to the recommender and capture its RAW output. Outage or
  stale context forwards null payloads — fail-closed through the same parsers.
  It returns raw data; it grants nothing.
- **apply** — `applyDecision` (internalMutation) is the SOLE authorizer. It
  rejects stale/foreign output (requestId must match the reservation; contract
  revision must not have moved), RELOADS fresh truth via one bundled query
  (`internal.internal.workforce.readDecisionContext` — the same query the action
  previews against, so the two cannot drift), re-runs the pure kernel
  `runManagerialDecisionPass` with `recommend: async () => rawRecommendation`
  (so `parseManagerialRecommendation` revalidates the stored selection against
  FRESHLY-recomputed eligible ids and stage-4 reauthorization decides from
  current truth), persists through the shared `persistDecisionRow` writer,
  clears the reservation, appends the deduped `decision_applied` wake
  (`planWakeForDecision`, new WakeReason mirrored in vWakeReason) and schedules
  the next pass, where the reducer routes to idempotent dispatch. Attempts reset
  only on a successful authorization.

Shared determinism lives in `lib/management/decisionPass.ts`
(`buildDecisionPassInput`): capabilities come from the model-proposed
`desiredCapabilities` via `parseStrategyProposal` → `validateCapabilityKeys`
(A7: the launch literal and hardcoded permission/resource-class arrays are gone
from convex/management.ts); resource classes derive from
`requiredResourceClassesFor` + `controlledResourceClassesFor(CURRENT_RESOURCE_INVENTORY)`;
external grounding flows through the CP-3 kernels over
`createSnapshotDiscovery()` + `VERIFIED_SERVICE_REGISTRY` (zero-network — never
the onchainos binary), so I3's `discovered: []` is gone and a genuine BUY is
reachable with `provider_quote`-provenanced prices or honest nulls.
`setManagementRecommender`/`_recommender` deleted (zero external callers; I2).
One bug found and fixed by the new tests: validating the model-proposed external
class against the capability-derived `RESOURCE_CLASS_VALUES` would have kept
every external class unreachable (no controlled capability requires one) —
`buildDecisionPassInput` now validates against the full catalog union
(`RESOURCE_CLASSES`). The "$1" in the I3 finding is confirmed as
`DEFAULT_BUDGET_LIMITS.maxExternalSpendUsd`, a budget ceiling, not a price
literal; unchanged.

Proofs: `tests/managementDecisionPass.test.ts` (13 — builder determinism, A7
capability governance incl. "no launch literal leaks into a non-launch
decision", I3 MAKE/BUY grounding + provenance + no invented prices, spend
authority fail-closed, decisionId passthrough, wake determinism/dedupe) and
`tests/managementDecisionChain.test.ts` (10 — begin reserves/idempotent/ceiling;
apply happy path persists decision row + bound requirement + wake + event;
stale requestId refused without effect; stale revision refused and reservation
cleared; garbage proposal fail-closed; hallucinated option typed-refused with
attempts retained; replay after apply is a no-op with exactly one wake row;
non-launch objective authorizes with zero "growth_launch_operations" anywhere in
persisted rows). Post-CP-4: **482 pass / 0 fail** (was 459 + these 23), both
typecheck programs clean.

**CP-5 — ACCEPTANCE (production loop closed).**
`tests/managementProductionLoop.test.ts` (11 tests) runs the whole engine
through REAL Convex seams on the convex-test harness — no faked ports, no
injected recommenders, no network: model steps are represented by calling
applyInterpretation/applyDecision with raw payloads, which is exactly what the
production actions forward (all authority lives in the mutations).

The positive whole-loop test: submit → applyInterpretation (contract +
semantic requirements + objective_submitted wake) → runManagementPass
(decide-begin reserves) → applyDecision (MAKE authorized via deterministic
option id, decision row + bound requirement + decision_applied wake) →
runManagementPass (dispatch: worker reserved, assignment created) → run facts
reconcile (workItems run "running" → "stopped"/"completed") + one scoped
application_observation → verify (requirement satisfied through the
recomputing kernel) → propose → gate ACCEPTS → objective state "completed"
with the accepted completion_proposal row and control note.

The 10 negative proofs: N1 forged satisfaction (invented proofRefs) refused by
the recomputing gate; N2 monetary BUY with NO founder grant cannot authorize
and writes no intent; N3 stale contract revision → apply rejected, reservation
cleared; N4 hallucinated option id → typed refusal persisted; N5 garbage
interpretation → typed refusal, no contract row; N6 completed run with no
evidence satisfies NOTHING; N7 replayed apply after terminal → refused, exactly
one decision wake row (dedupe); N8 ungoverned capability proposal → refusal,
zero effect rows; N9 decision ceiling (attempts ≥ 3) → begin reserves nothing;
N10 post-refusal retry is bounded — reducer re-routes to decide_requirement,
attempt counter increments, no timer storm, and a retry with the correct
eligible option id then AUTHORIZES (the ceiling, not a self-wake loop, is the
outer guard).

Full gates at the final candidate: **493 pass / 0 fail** (was 482 + these 11);
`tsc --noEmit` and `tsc -p convex/tsconfig.json` both clean.

## R3 tomorrow morning

Premium review target: the whole M4 management-engine candidate.

Review:

- LangGraph ↔ Convex state ownership;
- economic decisions;
- requirement/completion semantics;
- staffing;
- dynamic capability safety;
- scenario coupling;
- resume/recovery;
- duplicate events;
- false completion;
- Cutoff 2 robustness.

Classify every material finding:
- Act Now
- Investigate Now
- Park for Later
- Ignore / Accept Risk

## M4 acceptance later when M3 ready

Cutoff 1 requires one causal live trace including:

- internal MAKE;
- genuine external need;
- economic recommendation;
- deterministic authorization;
- integrated sandbox/X Layer Testnet payment;
- persisted/verified acquired result;
- internal reaction;
- external effect;
- independent verification;
- truthful objective resolution.

No scenario-specific orchestration.

## Critical constraints

- Do not rewrite M1/M2 historical evidence.
- Do not duplicate sourcing/authorization authorities.
- Do not let LangGraph become business truth.
- Do not let model output grant permission/spend/tool authority.
- Do not equate submitted/settled/result/verified.
- Do not rerun broad suites after every checkpoint.
- Do not run mainnet or unsupervised live spend.
- Do not widen scope into universal marketplace/org infrastructure.
- Delegate bounded independent low-risk work aggressively; PRIMARY owns architecture, shared contracts, integration, financial boundaries and final verification.

## Current next action

CP1–CP6 committed and pushed (CP1 `27128d6` + ledger `34a65cb`; CP2 `51b1e13` + ledger `81825cc`; CP3 workforce `df4fdd5`, reducer `dc3a9b7`; CP4 graph + continuation evidence `76fedd5` + ledger `94da7ac`; CP5 adversarial suite `3e8479e`; CP6 external seam + convex-lane defect fixes `c120911`). CP7 committed and pushed: `59f75f7` (R3 REVIEW SHA; full suite 404/404, both tsc programs clean). REMAINING: 19-section completion report. Terminal status: M4 MANAGEMENT ENGINE IMPLEMENTED — R3 REVIEW PENDING; PAYMENT-BACKED CUTOFF 1 PENDING M3/R2.

---

# M4 × M3 INTEGRATION LEDGER (branch `integration/m4-m3`)

Status: **CLOUD APPLICATION SEAM PROVEN — READY FOR LOCAL SUPERVISED X LAYER TESTNET CUTOFF-1 EXECUTION AND R3 RECHECK.**
Updated: **19 September 2026**
Repository: `dropandresetmain-prog/somebody-okx`
Scope: connect the closed M4 CP8 management engine to the frozen accepted M3 buyer rail through ONE application-owned seam, prove the seam rigorously in cloud with injected deterministic fakes, and leave ONE exact pushed candidate for a later supervised LOCAL X Layer Testnet execution. NO live payment, wallet, signing, private-key handling, blockchain submission, or real provider purchase was performed in cloud.

## Exact lineage (verified against origin before any edit)

- M4 CP8 source base: `99df92d3eb7900bf951bf02800d58a1c67c8684c` (`99df92d`, branch `qoder/general-session-1dclny`).
- M3 frozen main: `37afaa5a7cd0aa82a30c63ce6795c48d34f04d07` (`37afaa5`).
- Merge base: `1fa7962d9ef0d359951d14993834d1d419a5c980`.
- Integration branch `integration/m4-m3` created from `99df92d`, then merged frozen `37afaa5`.

## Integration checkpoints (each committed + pushed to `integration/m4-m3`)

| CP | Commit | Content | Gate |
|----|--------|---------|------|
| CP1 | `79815d95cd4f08d5846788b9b0eb3b3acc8ff5b4` | `--no-ff` merge frozen M3 (`37afaa5`) into M4 CP8 (`99df92d`); parents both preserved. `package.json` union (M4 `@langchain/langgraph` + M3 `@okxweb3/x402-*`/express; devDeps `convex-test` + `@types/express`; script `m3:seller`). `package-lock.json` REGENERATED via `npm install` (not spliced). 3 overlapping files (`package.json`, `package-lock.json`, `docs/work/ACTIVE_TASK.md`). | Level 1: merge clean, no conflict markers, root + convex tsc 0, `npm test` green |
| CP2+CP3 | `8abf902…` | `lib/management/m3BuyerRail.ts` (the seam) + `tests/m4m3IntegrationSeam.test.ts` (P1–P10 + SEAM). Intent↔Purchase identity, approval binding, fail-closed hand-off (CP2); one-step payment/settlement/result/verification observation, deduped wakes, reconciliation-not-retry (CP3). | Level 2/3: 17/17 pass; root tsc 0; convex tsc 0 |
| CP4 | `848db1e…` | Production-style whole-loop SIMULATED cut-off trace (positive: intent→verified→Requirement satisfied in 3 distinct observations; negative: rejected verification → failed, no satisfaction), driven through `runPurchaseLifecycle`. Labelled **CLOUD INTEGRATION PROOF / SIMULATED FINANCIAL EXECUTION**. | Level 4 (this file): 19/19 pass; root tsc 0; convex tsc 0 |
| CP5 | (this ledger) | Integration ledger appended; historical M3 + M4 evidence preserved unchanged above. | docs only |

## The seam (one file, `lib/management/m3BuyerRail.ts`)

- **Two machines, never collapsed.** M4 owns business truth (`ExecutionIntentState`: authorized/awaiting_m3/handed_off/result_recorded/verified/failed/reconciliation_required). M3 owns payment truth (`PaymentState`: prepared→…→submitted→settled→result_received→verified|failed|uncertain|reconciliation_required). The seam drives the REAL M3 functions (`parse402Challenge`, `createPurchase`, `prepareApprovedPurchase`→`preparePayment`/`bindTermsToApproval`, `executeApprovedPayment`, `lifecycle.transition`) and maps each M3 change onto M4 events through M4's OWN kernels (`advanceIntent`/`applyRailEvent`/`planWakeForRailEvent`). M4 observes M3 and records business consequence; it never re-decides payment and never adopts M3's enum. No invented signed/confirmed/finalized states.
- **Identity derived, never regenerated.** `PurchaseRecord.id=intentId`, `.objectiveKey`, `.resourceNeedId=requirementKey`, `.offeringId=target.offeringId`, `.idempotencyKey`. Replay rebuilds byte-identical identity (P2); M3's durable execution-authority ledger (`.m3-payment-execution-ledger.json`) remains the single financial exactly-once authority — M4 creates NO parallel Convex purchase store.
- **Fail-closed spend authority (A4 preserved).** `mayHandOffExternally` gates the hand-off: a monetary BUY/HYBRID with no bound founder `spendApprovalId` creates NO purchase and reaches NO executor (P1); `external_disabled` never hands off (P1b). M4 authorization ≠ M3 payment approval — the injected `PaymentApprovalFactory` binds the founder authority to the LIVE 402 terms.
- **Live challenge authoritative.** `preparePayment` validates the live terms against the approval bounds + rail config; an M4 quote never overrides them. Out-of-bound amount and wrong-network (mainnet) challenges are refused BEFORE signing (SEAM tests).
- **submitted ≠ settled ≠ result_received ≠ verified.** `observePurchase` is a resumable ONE-STEP-PER-CALL observer: each fact is a distinct observation produced at a distinct time by a distinct wake (P3/P4/P5/P6). A settled-but-unretrievable provider result is a REST (do NOT repay), not a failure.
- **Reconciliation, never blind retry.** An ambiguous PAYMENT execution (possible submission + missing/ambiguous response, incl. `OfficialPaymentAmbiguousError`) → `reconciliation_required` + `recovery_event` wake (P7/P7b); a source-proven pre-submission failure is `failed` and the M3 record is stamped `failed` (P7c). `planRetry` stays M3's sole retry gate (P8). Stale contract revision cannot satisfy a newer Requirement (P9). Duplicate events/wakes dedupe to one logical result with no duplicate satisfaction (P10).
- **Wake vocabulary reused, deduped.** `provider_result`, `verification_result`, `recovery_event` (+ existing `approval_resolved`, `resource_acquired`) all carry stable event-identity dedupe keys.

## Runtime boundary (material finding, corrected this pass)

The seam transitively imports `node:child_process` via `supervisedPurchase.ts` → `onchainOsExecutor.ts` (which spawns `onchainos payment pay`). Therefore the seam is **Node-runtime application code for the supervised LOCAL lane**, NOT a Convex function and NOT bundleable at esbuild `platform:browser`. It MUST NOT be imported from `convex/*.ts`. This matches the existing production shape: `convex/management.ts` imports only the pure M4 kernels, and `dispatchExternal` deliberately leaves a BUY intent resting in `awaiting_m3` (the hand-off is I/O and cannot run inside a mutation). The production hand-off is driven from a Node lane — exactly as `scripts/m3-live-purchase.ts` already drives `executeApprovedPayment` — reading the durable ExecutionIntent + M3 PurchaseRecord, calling this seam, and writing the resulting M4 events back. The seam header was corrected to state this boundary truthfully (an earlier draft wrongly claimed browser/Convex safety).

## Cloud proof vs. remaining live-local proof

PROVEN IN CLOUD (simulated, injected fakes only at M3's own DI boundary; every artifact labelled; a fake result is never marked live): the full ordered pipeline authorized intent → hand-off → submitted → settled → result_received → verified → Somebody re-evaluates → Requirement satisfied, plus every negative (no-grant, out-of-bounds, wrong-network, rejected verification, ambiguous→reconciliation, stale revision, duplicate/replay).

NOT PROVEN IN CLOUD and REQUIRED LOCALLY (supervised X Layer Testnet, founder machine): a real 402 challenge fetch; real wallet/TEE sign-only execution via M3's `OfficialSignOnlyReplayExecutor`; real blockchain submission + settlement readback; a real provider paid-response + independent ERC-20 Transfer readback verification; the resulting live Causal Cutoff-1 trace. These are deliberately OUT OF SCOPE for cloud and must NOT be simulated as live.

## R3 status

R3 recheck was NOT performed this pass (explicitly out of scope). The prior R3 verdict (M4 not accepted; seam not ready; Cutoff 1 not proven) stands and is superseded only by a future supervised R3 recheck of this integration candidate. This pass does NOT claim: live Cutoff 1 proven, real payment executed, M4 accepted, or M5 integrated. M5 (frozen frontend) was not touched.

## R3 ACCEPTANCE + PROMOTION TO MAIN (supersedes the section above)

**M4 + M3 application integration accepted by R3.** Verdict: *"M4 × M3 PRE-LIVE CANDIDATE ACCEPTED — application path frozen for integration."*

- Exact accepted code candidate: `88afa084f64d57a0b189811df846d0016ac87e3e`.
- Docs/freeze head: `b10b7de7df71a040936c4ec64435fc5498dc3a78` (branch `fix/m4-m3-production-driver`).
- Promotion: `main` fast-forwarded from `37afaa5a7cd0aa82a30c63ce6795c48d34f04d07` to `b10b7de7df71a040936c4ec64435fc5498dc3a78` (pure ancestry, 42 commits, no merge/squash/rewrite; gate not rerun because the reviewed code candidate itself did not change).
- **Live X Layer Testnet Cutoff-1 remains pending.** No real payment success is claimed; no provider round-trip is proven live; M5 is not integrated by this record; the demo is not complete.
- Do NOT reopen M3 or M4 architecture. Future work proceeds from promoted `main` only.

---

# ARCHIVED FRONTEND LEDGER (frozen accepted M5 implementation fb0055fd)
# Preserved verbatim as integration-lane history. Current authoritative ledger is above.

# ACTIVE TASK — M5 Web Executive Mission Control

Updated: 19 September 2026. Status: CP7 complete; M5 web frontend acceptance candidate delivered.

## Goal and recovery
Build a desktop-first, fixture-only executive management surface. The Objective
creates demand; Somebody assembles the company required to satisfy it.
Resume from this ledger and the latest pushed checkpoint, not historical chat.

## Git truth
- Repository: dropandresetmain-prog/somebody-okx
- Implementation/publication branch: `qoder/general-session-yeqje6`
- Platform-authorized source: `main`
- Base / HEAD before CP0: `37afaa5a7cd0aa82a30c63ce6795c48d34f04d07`
- Main's live remote SHA confirmed equal to the base on 19 September.
- Outcome branch created cleanly from main; suggested feat branch not used
  because this session's authorized destination is the outcome branch above.
- CP0 pushed: `ad36d9b68da2152b06abc91827d58cb168a3da35`.
- CP1 pushed / HEAD before CP2: `615f10c973a4d893a9e55c394539627c93a31694`.
- CP2 pushed / HEAD before CP3: `ee6c2dbd3bf9b0fc9c59c71b7e741e7edbd878c2`.
- CP3 pushed / HEAD before CP4: `610b15ca421525cfae51721df106cc1afef13b37`.
- CP4 pushed / HEAD before CP5: `63280ff284650789702519da30e7d36db54560f5`.
- CP5 pushed / HEAD before CP6: `972ecb4c835da206f8d77402a7855ea9382962e7`.
- CP6 pushed / HEAD before CP7: `4ea4080c7722f84695ff561e9b70185ca76db13d`.
- CP7 pushed SHA goes in the next checkpoint note (final ledger entry).
- Each commit updates this ledger; each checkpoint MUST be pushed before work
  continues. Record the just-pushed SHA in the next note (no self-referential SHA).
- M3 historical ledger remains in git at the base above; M3 stays frozen.

## Authoritative references and precedence
- `docs/design/M5_WEB_DESIGN_DIRECTION.md`
- `docs/design/M5_WEB_SURFACE_BRIEF.md`
- `docs/design/assets/m5-web/{mission-control,system-xray}.png`
- Those web-only assets are copied verbatim from the current accepted reference:
  `design/m5-web-mobile-direction@d194be85e8f1ca2cc42c558adc05e28f9ac5a0fb`.
- M4 inspected at live remote `feat/m4-management-engine`:
  `7723c096f58067c79a59782792ec4346184df1f4` (review target `59f75f7`).
- Inspected M4 `lib/management/types.ts`, `intents.ts`, completion report.
- No separate M5 frontend/backend contract is committed in those references.
- Main has M3 but not the M4 engine. Do NOT merge unpromoted backend code.
- M4 domain reference: Requirement priorities required/supporting; states
  active/satisfied/blocked/superseded/waived; strategies MAKE/BUY/HYBRID/WAIT/
  ASK_FOUNDER/BLOCK. Worker identity, assignment, result and satisfaction differ.
- M4 acquisition intents are authorization-only; real M3 integration is unwired.
- `lib/payment/types.ts` is the existing M3 payment vocabulary authority.
- User's current truth restrictions override older dependency/ASK wording in
  the design docs. No dependency graph or backend ASK enum will be invented.

## Non-negotiables
- One provisional ObjectiveWorkspaceView boundary; no Convex in new components.
- SomebodyNow, AttentionItem, MissionStoryEvent, SystemXrayFixture are normalized
  frontend abstractions, not claims about backend tables/enums.
- Stable fixture IDs and numeric epoch-ms timestamps; label all data as fixtures.
- No inferred causality, requirement dependency edges, fabricated concurrency,
  model recommendations represented as live, or unsupported REUSE.
- Worker done != assignment verified != Requirement satisfied != Objective done.
- Payment: prepared → awaiting_approval → approved → payment_attempted →
  submitted → settled → result_received → verified. No signed/finalized states.
- Warm paper, dark ink, orange Somebody; reuse fonts/mascot, semantic motion only.
- Desktop Web only; no separate mobile product; no real spend/provider calls.
- Exact staging, checkpoint commits + pushes; never merge; never force-push.

## Checkpoints
- [x] CP0 truth + recovery ledger + preserved web references
- [x] CP1 frontend contract + deterministic fixtures + invariant tests
- [x] CP2 mission-control shell and Outcome/Somebody Now hierarchy
- [x] CP3 workers, grounded decisions, providers, Needs You
- [x] CP4 evidence, story, payments, independent completion
- [x] CP5 optional supported-relationship System X-ray
- [x] CP6 responsive/accessibility/visual polish
- [x] CP7 frontend acceptance candidate and final gate

## Completed evidence
- Clean source worktree; HEAD, branches, recent M3/M4/design commits inspected.
- Remote main/design/M4 heads queried and reference commits fetched.
- Existing app, UI tests, package scripts, fonts/mascot, payment types inspected.
- No AGENTS.md tracked. No frontend lint/browser script is configured.
- Canonical scripts: typecheck, test (tsx/node:test), build (Next).
- Dependencies are not installed in this fresh sandbox.
- Delegation unavailable: no permitted blocking child-agent tool is exposed.

## CP1 evidence / current checkpoint
- `npm ci --silent --no-audit --no-fund`: passed, lockfile unchanged.
- `npx --no-install tsx --test tests/m5Fixtures.test.ts`: 8/8 passed.
- Focused tsc of workspace.ts + fixtures.ts: passed with --ignoreConfig --noEmit
  --strict --skipLibCheck --target ES2022 --module esnext --moduleResolution bundler.
- First tsc invocation needed TS7's --ignoreConfig; corrected, no code failure.
- 24 independent snapshots: 16 BUY/relaunch, 7 MAKE/partner, 1 blocked supplier.
- Outcome is a relaunch-ready pack, NOT public publication or claimed lift.
- Three paths have explicit IDs, times, references, proof and authority boundaries.
- CP1 files: app/m5/workspace.ts, app/m5/fixtures.ts, tests/m5Fixtures.test.ts.
- No component, backend, payment behavior or mobile changes.

## CP2 evidence
- /m5 shell: Objective rail, contract levels, Somebody Now, current Requirement,
  internal boundary, proof rows and deterministic fixture navigation.
- Component rendering tests: 4/4 passed (all 24 snapshots); focused component
  tsc passed; git diff --check passed. No production build/full suite run.
- Browser: 1440x900 Objective switching passed, zero page errors, no overflow.
- Browser uses globally available Playwright + /usr/bin/chromium; packaged
  Playwright browser is absent. localhost works; 127.0.0.1 HMR origin is blocked.
- /m5 HTTP 200 with expected content; server listening 0.0.0.0:3000; preview called.
  Gateway/phone reachability not established. Temporary screenshot /tmp/m5-cp2.png.
- Root provider wrapping moved to existing root page. Its behavior is preserved;
  new /m5 neither initializes nor calls Convex. Backend source unchanged.

## CP3 evidence
- CompanyField: persistent That Guys, CREATE/REUSE rationale, reservations,
  distinct assignment/result state; providers remain outside internal boundary.
- Decisions: explicit selected strategy, authority, grounded fact provenance;
  rejected MAKE/BUY/HYBRID alternatives and historical decisions in disclosures.
- Needs You: bounded amount + resource + authority; only explicit simulation
  approves. Blocked fixture offers guidance, no fake retry or automatic action.
- Component tests 6/6 passed; focused component tsc and diff check passed.
- Browser: alternatives disclose; single approval button advances to approved.

## CP4 evidence
- Evidence inspection, explicit source refs, artifact v1/v2 history, verified
  vs received proof, separate completion verdict and pending supporting work.
- Mission Story shows supplied related records only; chronology is not causality.
- All eight payment stages displayed; unreached stages cannot look recorded.
- M5 component + fixture tests 16/16; focused tsc and diff checks passed.
- No provider APIs, payment reducers, backend writes or automatic playback added.

## CP5 evidence
- X-ray is built by a pure `buildXray(view)` function (app/m5/xray.ts) from
  explicit reference fields only: defines, requires, assigned_to, addresses,
  selects, authorizes, provided_by, proof_for, accepts. No dependency edges,
  no inferred causality, no LangGraph-style nodes.
- Secondary inspection lives behind a `<details>` disclosure in the right rail;
  collapsed by default so it never competes with the primary mission view.
- Rendered tables: nodes (kind badge, label, stable ID, detail), relationships
  (from → label → to, both ends must resolve to known node IDs), runtime facts.
- Runtime facts state "No live backend — fixture data only"; note states
  "explicit references only · no inferred causality".
- Two delegated subagents produced xray.ts, SystemXray.tsx, xray.css; primary
  integrated into FixtureWorkspace, page.tsx CSS import, and tests.
- M5 tests 18/18 passed (8 fixture invariants + 10 component/X-ray). Full tsc
  --noEmit passed.
- Browser (1440x900, /usr/bin/chromium): toggle opens, 23 relationship/node
  rows + 3 runtime facts rendered, zero page errors. Initial horizontal
  overflow (scrollWidth 1499) traced to X-ray fact grid and fixed with
  minmax(0,·) columns + word wrapping; re-verified scrollWidth 1440, no
  element extends past viewport. Screenshot /tmp/m5-cp5-xray.png (temporary).

## CP6 evidence
- Delegated to one subagent (CSS-first polish, no copy/component text changes).
  Result: 2 files, +9/-2 lines, all CSS. No global theme tokens redefined.
- mission-control.css: `:focus-visible` outline (orange, 55% mix) on summary/
  button/a/select; `overflow-wrap: break-word` on `.mc-layout`; `prefers-reduced-motion`
  kill-switch scoped to `.mc-root` (matches xray.css pattern).
- xray.css: `.mc-xray-count` color ink-3 → ink-2 for small-text AA contrast.
- Viewport audit 1920/1440/1280/1100 (Playwright + /usr/bin/chromium): zero
  horizontal overflow at every width, zero page errors, X-ray toggle closed by
  default at all widths. Keyboard-Tab test confirmed the focus-visible outline
  actually renders (3px solid orange) — not just a declared rule.
- Independent verification by primary: M5 tests 18/18, tsc --noEmit clean,
  git diff --check clean, browser re-audit at all 4 widths.
- Deliberately unchanged: existing `@media (max-width:680px)` rules (no mobile
  scope creep), app/globals.css, all visible copy, no new animations.
- Known pre-existing issue: one 404 on a mascot image asset at runtime (not
  introduced here; does not affect layout or tests).

## Next action / active files
CP7 final gate: typecheck, full test suite, production build, fixture scenario
review, confirm no backend wiring, no mobile scope creep. Then final report.

## CP7 evidence (final acceptance gate)
- Production build (`npm run build`): compiled successfully, TypeScript clean,
  all 5 routes generated. /m5 builds as a dynamic server-rendered route.
- Full test suite (`npm test`): 359/359 pass (includes the 18 M5 tests).
- `npx tsc --noEmit`: clean. `git diff --check`: clean.
- Delegated read-only audit (Grep/Read, no writes) over app/m5 + tests:
  all 8 acceptance criteria PASS —
  (1) no backend wiring: only `import type { PaymentState }` from
  lib/payment/types; zero convex/fetch/env reads in app/m5.
  (2) fixture honesty: no Math.random/Date.now; numeric epoch-ms via Date.UTC;
  stable string IDs; fixture labels rendered.
  (3) payment vocabulary: exactly the 8 allowed states; zero signed/finalized.
  (4) no invented causality: no requirement→requirement edges; explicit
  "Order does not imply causality" disclaimer; structural X-ray labels only.
  (5) worker done / assignment verified / requirement satisfied / objective
  completed kept distinct across snapshots.
  (6) launch 16 moments, partner 7, supplier 1 blocked; blocked supplier has
  action=null — no fake retry/approval.
  (7) mobile scope: only CSS media queries, no separate mobile components/routes.
  (8) no dead code: zero TODO/FIXME/console.log; all exports consumed.
- Live /m5 re-verified over dev server (0.0.0.0:3000): renders "Fixture
  workspace · not live", "Somebody now", "System X-ray · secondary inspection",
  "MAKE / BUY / HYBRID", "Mission Story". Preview surfaced earlier at CP2.
- CP7 introduced no code changes; this checkpoint records the gate results only.
- One pre-existing mascot image 404 observed at runtime (cosmetic, present since
  before CP6, does not affect layout, build, or tests). Left unchanged to avoid
  unrelated scope.

## Final state
All checkpoints CP0–CP7 complete and pushed to `qoder/general-session-yeqje6`.
Desktop-first, fixture-only Executive Mission Control with System X-ray delivered.
No Convex wiring, no live spend/provider calls, no mobile scope creep.

## Risks
- Design reference is provisional, not runtime end-to-end evidence.
- Live selection/economics and BUY→M3 remain explicitly unwired.
- Brand fonts may need network access at build; report actual evidence.
- No permitted blocking agent tool is available; primary performs focused work.

---

# ACTIVE TASK — M5 REAL-DATA INTEGRATION (lane `integration/m5-real-data`)

Updated: 20 September 2026. Base: promoted `main` (R3-accepted backend, docs
commit `a37f015`). Frontend source integrated: frozen accepted implementation
`fb0055fdcb18fc45ef5d56aac14f88baa8e52e7c` (merged `855147b`, only conflict was
this ledger; both histories preserved).

## Integration architecture (locked)

```text
Convex authoritative domain truth
  → lib/m5/workspaceModel.ts (pure composer, ONE normalized read model)
  → convex/m5Workspace.ts :: getObjectiveWorkspaceV2(objectiveKey) (single reactive query)
  → app/m5/LiveWorkspace.tsx (selects Objective, renders)
  → accepted M5 Executive Mission Control (visuals unchanged)
```

React is NOT the join layer. Fixtures are preserved at `/m5/fixtures`
(provider-free route group) and in tests; production `/m5` reads only Convex.

## ConvexClientProvider scope decision

Narrowest correct structure: `app/m5/(live)/layout.tsx` wraps ONLY the live
mission-control route group. Not the old root-layout provider (would wrap every
surface); not the fixture-era page-level placement (production is real now).
The fixture route group `app/m5/(fixture)` has no provider by design.

## Derivations (all from persisted truth; nothing invented)

- **SomebodyNow**: derived per query from objective row state + latest
  `control_state` note (M4 quiescent states live there), pending_approval
  notes, intent states, assignment states. Never persisted; no LangGraph node
  names exposed.
- **AttentionItem**: only from `pending_approval` control notes,
  `reconciliation_required` intents, blocked requirements, escalated /
  recovery_required states. Spend ceilings shown only when a live
  `founderSpendGrants` row bounds them; otherwise null (no invented amount).
- **Mission Story**: one event per persisted row/transition with stable ids
  (objective, contract_interpreted, requirement, resolution, decision,
  assignment dispatch/result, intent prepare/submit/result/verify, evidence,
  artifact versions). relatedIds are explicit references; no timestamp-derived
  causality. Row-derived ids make duplicate wakes idempotent.
- **System X-ray**: real ids/edges only (objective, contract, requirement,
  worker, assignment, decision, provider, intent, evidence). No Requirement
  dependency edges exist or are invented. Secondary surface; unchanged design.
- **Payment**: Convex holds M4 intent truth only; the M3 ledger stays with the
  Node driver. Payment view is DERIVED: authorized/awaiting_m3 → no payment
  fact; handed_off → submitted; result_recorded → result_received; verified →
  verified. `settled` is never rendered from Convex truth; signed/confirmed/
  finalized never appear. Quote vs grant limit labelled by provenance.
- **Workers**: REUSE/CREATE from persisted `createdByObjective`; verified
  history only from `outcome: "accepted"` records. result_submitted ≠ verified
  ≠ satisfied ≠ completed preserved at every seam.
- **Stale revisions**: satisfaction/assignment rows below the current contract
  revision render as active/superseded — history, never current state.

## Commands audit (accepted M5 interactions)

1. Objective list/selection/navigation — read-only — WIRED
   (`objectives.listObjectives` + `?objective=` deep link).
2. Needs You "approve" — NO public backend command exists (approval resolution
   and spend-grant binding live in the supervised lane) — rendered truthfully
   WITHOUT a working button; no faked success.
3. Fixture demo controls ("Simulate…", moment picker) — fixture lane only;
   not rendered in production.
No frontend execution API was invented; no payment can execute from this
surface. Fail-closed.

## Checkpoints

| CP | Commit | Content |
|----|--------|---------|
| CP1 | `a6a5d2f` | Normalized read model (`lib/m5/workspaceModel.ts`, `convex/m5Workspace.ts`) + 15 focused tests incl. the 12 required negative/truth proofs |
| CP2+CP3 | `d80dea4` | Frozen frontend merged onto promoted main; provider scope resolved; `/m5` live-wired; fixtures moved out of production runtime |
| CP4 | `c21c187` | 8 Convex→M5 seam tests + 5 live-surface integration tests |
| CP5 | (this ledger + final gate) | Candidate gate + handoff |

## Findings / triage (this lane)

- **Act Now (resolved in-lane)**: none outstanding.
- **Investigate Now**: none.
- **Park for Later**: (a) a real public founder-approval command so Needs You
  can resolve `pending_approval` from the product surface — requires backend
  authority design, deliberately not invented here; (b) M3 payment ledger
  rows surfacing `settled` truth into Convex — today the UI truthfully never
  claims settled from Convex data; (c) artifact→evidence refs are not
  persisted, so ProofLinks on artifacts show none (truthful empty).
- **Ignore / Accept Risk**: none material. (Story timestamps use each row's
  own createdAt when persisted; objective createdAt only as a documented
  fallback for legacy rows.)

## Boundaries restated

No live payment occurred in this lane. Live X Layer Testnet Cutoff-1 remains
pending supervised proof. M3/M4/M5 accepted designs were not reopened. No
mobile work. M6 not started.

## CP5 — exact candidate gate (branch `integration/m5-real-data`)

Candidate: `41359ce` (this ledger commit + gate record follow).

| Check | Command | Result |
|-------|---------|--------|
| Root TypeScript | `npm run typecheck` (tsc --noEmit) | PASS (0 errors) |
| Convex TypeScript | `npm run typecheck:convex` | PASS (0 errors) |
| Focused read-model tests | `tsx --test tests/m5ReadModel.test.ts` | PASS 15/15 |
| Convex→M5 seam tests | `tsx --test tests/m5ConvexSeam.test.ts` | PASS 8/8 |
| Live-surface tests | `tsx --test tests/m5LiveSurface.test.ts` | PASS 5/5 |
| Production web build | `npm run build` | PASS — routes `/` , `/m5` (dynamic live), `/m5/fixtures` generated |
| Full suite (once) | `npm test` | 656/657 PASS |

**The single full-suite failure is pre-existing and environmental, NOT a
regression.** `tests/managementRuntime.test.ts` "every default-platform Convex
module bundles without node:crypto" invokes the esbuild binary via
`node <bin>`; this esbuild (0.27.0) ships a native ELF executable, so node
cannot parse it (`SyntaxError: Invalid or unexpected token` / `ELF`).
Verified identical failure on the promoted base `b10b7de7` (R3-accepted, before
any M5 work). Manually re-ran the same esbuild bundling directly against the
binary for every default-platform module — including the new
`convex/m5Workspace.ts` — and ALL bundle cleanly on `--platform=browser`. The
probe's intent (no `node:crypto` in browser bundles) holds; only its invocation
method is broken in this sandbox. Triage: **Park for Later** (fix the probe to
call the binary directly, not via `node`); out of M5 scope, do not silently
repair unrelated legacy test harness here.

## Handoff

M5 real-data integration is code-complete and gate-verified on this branch.
Pushed work: promotion of `main` (fast-forward) + this integration lane.
Remaining for the founder/supervised lane: (1) live X Layer Testnet Cutoff-1
proof; (2) a real public founder-approval command so Needs You can act from
the product surface; (3) optional: surface M3 `settled` truth into Convex so
the payment track can render settlement without collapsing the machines.
No live payment occurred. M6 not started.
