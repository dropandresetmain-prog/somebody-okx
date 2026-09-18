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
- [ ] capability/resource request returns through Somebody; (kernels + wake plumbing exist; the `request_resource` tool call-site rewiring from the M2 sourcing seam to a `worker_resource_request` wake is CP7 integration work.)
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

- [ ] stable decision/assignment/effect identities;
- [ ] duplicate wake-up harmless;
- [ ] stale objective/run fenced;
- [ ] finite decision/retry/time/cost/no-progress limits;
- [ ] invalid model output bounded repair/failure;
- [ ] weird unrelated prompts terminate/wait coherently;
- [ ] no infinite worker spawning;
- [ ] no false completion.

Evidence:
- targeted adversarial tests only.

### Checkpoint 6 — external seam

- [ ] AuthorizedExecutionIntent for external acquisition/effect;
- [ ] provider/result/verification events feed back into Convex + wake Somebody;
- [ ] no duplicate payment state machine;
- [ ] boundary compatible with M3 concepts without claiming M3 success.

Evidence:
- mock/fixture seam only if M3 unavailable, labelled truthfully.

### Checkpoint 7 — tonight completion

- [ ] reconcile ledger against implementation;
- [ ] targeted regression only where seams changed;
- [ ] no production payment/provider claims;
- [ ] checkpoint commit/push;
- [ ] prepare exact SHA for R3 premium review.

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

CP1+CP2 kernels committed and pushed (CP1 `27128d6` ledger follow-up `34a65cb`, CP2 `51b1e133b5fff49751d28780536eee88ba282e59`). Next: Checkpoint 3 — persistent workforce: Convex schema tables (workers/contracts/requirements/decisions/assignments/intents/wakeEvents/budgets), real worker inventory replacing the empty-inventory `resolveWorker({inventory: []})` call in `convex/objectives.ts:332`, reuse/create focused tests, capability/resource-request wiring through Somebody, objective-wide limits enforced.
