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

- [ ] semantic strategy proposal;
- [ ] grounded candidate options;
- [ ] internal/external/hybrid representation;
- [ ] hard eligibility;
- [ ] comparable economic facts + provenance/confidence;
- [ ] LLM managerial recommendation contract;
- [ ] deterministic authorization recheck;
- [ ] remove automatic internal-availability ⇒ MAKE final choice.

Evidence:
- economic counterexamples;
- redundant external wrapper does not automatically win;
- hybrid option supported.

### Checkpoint 3 — persistent workforce

- [ ] persist Worker identity / lifecycle / reservation;
- [ ] actual REUSE demonstrated;
- [ ] supported CREATE reason path;
- [ ] dynamic semantic CapabilitySpec/tool-contract definition;
- [ ] no dynamic real-world authority invention;
- [ ] capability/resource request returns through Somebody;
- [ ] objective-wide worker/assignment limits.

Evidence:
- reuse/create focused tests;
- unsupported capability blocks/escalates rather than throws.

### Checkpoint 4 — LangGraph management loop

- [ ] minimal graph state;
- [ ] observe / manage / ground / authorize / dispatch / wait / verify / resolve loop;
- [ ] consequential nodes reload Convex truth;
- [ ] event-driven wake/resume;
- [ ] quiescent waiting/approval/escalation states;
- [ ] no scenario/provider state branches;
- [ ] coarse plan + next bounded action.

Evidence:
- real Agent/Runner internal continuation across at least one wake/replan.

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

Verify branch/head and inspect current contracts/schema/runtime before implementation. Then start with the domain-truth checkpoint while preserving accepted M2 evidence.
