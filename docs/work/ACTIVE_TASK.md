# ACTIVE TASK — M4 Generic Somebody Management Engine

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
