# Somebody × OKX Dev Day 2026 — Master Plan

Status: **APPROVED — M4 management architecture locked 19 September 2026**  
Build period: **17–25 September 2026**  
Authoritative repo: `dropandresetmain-prog/somebody-okx`  
Accepted baseline before M3/M4: `main@1fa7962d9ef0d359951d14993834d1d419a5c980`

## 1. Goal

Build the smallest reliable product that proves:

> **One person can operate with the functional reach of a much larger company because Somebody can assemble internal capability, economically acquire external capability/resources, observe reality, and keep managing until a verified outcome is reached.**

Canonical founder objective:

> **“Our launch isn’t working. Fix it and relaunch today.”**

The canonical scenario is demo data for a generic engine. It must not become orchestration logic.

## 2. Approved operating model

Somebody is a persistent accountable managerial identity.

```text
Objective
→ Outcome Contract
→ Outcome Levels + minimum completion bar
→ Requirements
→ satisfaction strategies
→ grounded options
→ LLM recommendation
→ deterministic authorization
→ execution
→ verification
→ authoritative state update
→ wake/replan
↺
```

The supported strategy vocabulary includes:

- MAKE;
- BUY;
- HYBRID;
- WAIT;
- ASK FOUNDER;
- BLOCK / ESCALATE.

Investigation is ordinary bounded work, not a special economic primitive.

Internal work resolves through **REUSE / CREATE**. REUSE is preferred when an eligible existing worker fits, unless supported factors such as availability, specialization, context, parallelism or cost favor CREATE.

## 3. Framework decision

Approved architecture:

- **LangGraph** = Somebody management/control loop.
- **Convex** = authoritative business/company state.
- **@openai/agents** = bounded That Guy execution.
- **LangChain** = not adopted.
- **M3 buyer rail** = payment/signing/submission/reconciliation authority.

LangGraph checkpoints are continuation state only. They do not establish business truth, payment truth, worker availability, approval validity, verified effects or objective completion.

Every consequential resumed action reloads/revalidates current Convex truth.

## 4. Management authority

The model may:

- interpret founder intent;
- propose outcome contracts and requirements;
- propose semantic capabilities;
- propose satisfaction strategies;
- compare grounded eligible options;
- recommend REUSE / CREATE / MAKE / BUY / HYBRID / WAIT / ASK / BLOCK;
- propose objective completion with evidence.

Deterministic application logic owns:

- capability/tool authority;
- factual inventory;
- provider compatibility;
- approval/spend authority;
- stable purchase/effect identity;
- retry/reconciliation limits;
- requirement satisfaction rules;
- objective completion acceptance.

Workers may request capabilities/resources but cannot create workers, expand their own permissions, authorize spend, or declare objective completion.

## 5. Economic decision model

Internal feasibility no longer forces MAKE.

If internal and external options are feasible, both classes should be considered. Discovery may remain bounded; this does not require exhaustive marketplace search.

Use three stages:

1. **Hard eligibility** — capability, scope, legal/security/privacy, deadline/proof, provider identity, authority and financial bounds.
2. **Comparable facts** — scope/quality, time, cost, reliability, availability, reuse value, external advantage, uncertainty/provenance.
3. **Managerial recommendation** — LLM recommends among eligible options; deterministic authority rechecks before execution.

No arbitrary weighted score is required.

## 6. Outcome and requirement semantics

An Objective may have multiple Outcome Levels.

One level is the **minimum completion bar**. Higher levels may remain pending after operational completion and must be communicated truthfully.

Requirements are at minimum:

- **required** — gates completion;
- **supporting** — may remain incomplete, but unresolved supporting work must be disclosed clearly.

A rejected provider candidate is not a satisfied requirement.

Required requirement lifecycle must distinguish at least active, satisfied, blocked and superseded/waived-with-authority semantics.

Completion hierarchy:

`run stopped ≠ assignment complete ≠ requirement satisfied ≠ objective complete`

Only Somebody proposes Objective completion; deterministic policy accepts it only against the current Outcome Contract and required verification evidence.

## 7. Dynamic capability and workforce model

Somebody may dynamically define new semantic capabilities/tool contracts at runtime.

This does not create real-world authority. A new executable tool requires governed primitives/integrations/credentials/authorization.

Worker model:

- persistent Worker identity;
- persistent validated WorkerSpec;
- assignment-specific WorkContract;
- ephemeral WorkerRun;
- verified assignment history;
- availability/reservation state.

Worker breadth: smallest coherent capability bundle for a recognizable bounded responsibility.

No worker-to-worker autonomous creation. Workers request; Somebody staffs.

Persist finite objective-wide limits for worker creation, active assignments, model decisions, retries, time/cost and no-progress detection.

## 8. Hackathon cutoffs

### Cutoff 1 — canonical live demo

The canonical objective must causally demonstrate the generic engine:

```text
founder objective
→ outcome/requirements
→ internal staffing
→ real bounded MAKE
→ genuine external requirement
→ grounded internal/external options
→ LLM economic recommendation
→ deterministic authorization
→ integrated sandbox/X Layer Testnet transaction
→ acquired result persisted/verified
→ internal reaction
→ later external action
→ effect verification
→ truthful objective resolution
```

No `if launch`, `if Newsliquid`, `if xbird`, `if second_purchase` or named-worker orchestration.

### Cutoff 2 — safe arbitrary prompts

Unrelated prompts need structural safety, not universal competence.

Unsupported/infeasible objectives should reach typed waiting, approval_required, blocked, escalated, failed or unsupported states rather than exceptions, infinite loops, fabricated authority or fake completion.

## 9. Remaining milestones to demo

### M3 / R2 — separate payment lane

M3 continues in its existing lane and is currently affected by an external blocker.

M4 must not duplicate or restart M3.

When accepted, M3 exposes the manager integration contract:

- stable logical purchase/effect identity;
- approval and bound live terms;
- submission/settlement/reconciliation outcomes;
- result and verification events.

### M4 — Generic Somebody Management Engine

**One long-horizon implementation task. Do not split into M4A/M4B/etc.**

Internal checkpoints are allowed in `docs/work/ACTIVE_TASK.md`, but they are not separate milestones.

M4 implements:

- LangGraph management loop;
- persistent Somebody identity;
- Outcome Contracts / Outcome Levels / minimum completion bar;
- required/supporting Requirements;
- strategy/option model;
- economic MAKE/BUY/HYBRID judgment;
- LLM proposal + recommendation contracts;
- deterministic authorization;
- persistent workforce and real REUSE/CREATE;
- dynamic semantic capability/tool-contract definition;
- worker resource/capability requests;
- event-driven wake/replan;
- waiting / approval / blocked / escalated / failed / completed semantics;
- independent Objective completion gate;
- recovery/idempotent continuation;
- anti-explosion/no-progress limits;
- removal of launch/research-specific orchestration;
- Cutoff 2 robustness;
- generic external acquisition/effect seam ready for M3.

Because M3 is externally blocked, M4 tonight may stop truthfully at the external execution boundary. The final payment-backed Cutoff 1 proof is completed later through the same M4 branch once M3/R2 is accepted. This is not a new milestone.

### R3 — Premium Management-Engine Review

Run tomorrow morning after the long-horizon M4 implementation.

Review the integrated management architecture, especially:

- LangGraph/Convex authority boundary;
- requirement/completion semantics;
- economic counterexamples;
- REUSE/CREATE behavior;
- dynamic capability safety;
- scenario coupling;
- stale/duplicate wake-ups;
- retry/recovery;
- worker explosion/no progress;
- false completion;
- unrelated-objective robustness.

Classify every material finding:

- Act Now;
- Investigate Now;
- Park for Later;
- Ignore / Accept Risk.

Fix only blockers within scope.

### Finish M4 acceptance when M3 is ready

Integrate the accepted M3 buyer rail through the generic AuthorizedExecutionIntent/purchase seam.

Prove Cutoff 1 causally. Do not add a scenario-specific payment branch.

### M5 — Product Surface + Story Hardening

Show recorded management truth:

- founder objective + success criteria;
- outcome levels / current minimum bar;
- worker REUSE/CREATE decision;
- options considered;
- economic rationale;
- approvals/payments/acquired resources;
- internal reaction;
- external effects;
- verification;
- truthful current outcome and unfinished supporting work.

Main surface shows high-level decisions. Optional deeper trace/graph may expose technical detail for demo/debugging.

The runtime trace generates the story. Do not hardcode “reject FlyBeacon → Newsliquid → xbird”.

Record the first complete backup demo as soon as the full flow works.

### M6 — Release Candidate

Freeze feature expansion.

Require:

- Cutoff 1 demonstrated;
- Cutoff 2 abuse pass;
- bounded spend/staffing policies;
- repeatable reset/setup;
- provider fallback/substitution documented;
- accurate evidence/docs;
- backup recording.

### G1 — Promotion Gate

Run once on the exact M6 candidate SHA.

Use the canonical release gate only once:

- focused evidence still valid;
- build;
- typecheck;
- canonical lint if applicable;
- deployment;
- payment prerequisites/testnet funds;
- provider connectivity;
- reset;
- demo-critical E2E;
- UI sanity;
- backup demo.

No architecture work at G1.

## 10. Review/test discipline

Use risk-based cumulative testing.

Do not blast the full suite after every checkpoint.

Tonight:

- focused changed-behavior tests;
- directly affected seams;
- risk-specific persistence/recovery/authority tests when warranted.

Tomorrow R3 reviews the full M4 candidate.

G1 is the one canonical broad promotion gate.

## 11. Historical truth

M1 and M2 remain accepted for the scope they actually proved.

Do not rewrite historical records to imply M1/M2 had:

- generalized economic MAKE-vs-BUY;
- persistent staffing;
- LangGraph orchestration;
- arbitrary-prompt robustness;
- paid external effects.

The 19 September architecture supersedes planning assumptions, not historical evidence.
