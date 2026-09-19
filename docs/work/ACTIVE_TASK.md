# ACTIVE TASK — M4 Generic Somebody Management Engine

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
