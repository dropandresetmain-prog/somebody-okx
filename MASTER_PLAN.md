# Somebody × OKX Dev Day 2026 — Master Plan

Status: **APPROVED — R3-accepted M4 × M3 backend and accepted M5 frontend are integrated on current `main` (integration code baseline `a9a0b3d31a7125e83fe0771a783ee62cbd96914a`). Architecture is frozen. FIRST PRODUCT E2E remains unproven and is the next milestone.**
Build period: **17–25 September 2026**  
Authoritative repo: `dropandresetmain-prog/somebody-okx`  
Accepted baseline before M3/M4: `main@1fa7962d9ef0d359951d14993834d1d419a5c980`

> **R3 acceptance record (do not reopen).** Verdict: *"M4 × M3 PRE-LIVE CANDIDATE ACCEPTED — application path frozen for integration."*
> Exact accepted code candidate: `88afa084f64d57a0b189811df846d0016ac87e3e`.
> Docs/freeze head containing it: `b10b7de7df71a040936c4ec64435fc5498dc3a78` (branch `fix/m4-m3-production-driver`).
> The R3 record proves application readiness only. M5 is now integrated, but this still does NOT claim: a useful live provider acquisition succeeded, the first full product E2E completed, or the demo is ready.
> M3 financial truth and M4 business truth remain distinct machines and must not be collapsed.

## 1. Goal

Build the smallest reliable product that proves:

> **One person can operate with the functional reach of a much larger company because Somebody can assemble internal capability, economically acquire external capability/resources, observe reality, and keep managing until a verified outcome is reached.**

Canonical founder objective:

> **“Our launch messaging isn’t working. Figure out what’s wrong and get a better relaunch ready. You can spend within the approved limit if it’s justified.”**

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

## 8. Shipping cutoffs

### Cutoff 1A — first product E2E

Before touching a live provider, prove the integrated product itself:

```text
founder objective
→ outcome/requirements
→ internal staffing
→ real bounded MAKE
→ evidence gap
→ grounded MAKE / BUY choice
→ deterministic authorization
→ deterministic simulated external result
→ result enters authoritative company state
→ worker resumes with that result
→ artifact changes because of it
→ verification
→ Requirement satisfaction
→ truthful Objective completion
→ visible through M5
```

The external boundary may be simulated for this proof. Everything around it must be production code.

### Cutoff 1B — genuine useful acquisition record

Once 1A works, perform one supervised genuine useful OKX acquisition. Capture safe immutable provenance and the real provider result. One successful useful acquisition is sufficient for the release requirement; a second purchase is optional.

NewsLiquid is the preferred first candidate if it fits the payment/provider contract, but provider compatibility is not allowed to block 1A.

### Cutoff 1C — canonical replay demo

Replay the genuine recorded acquisition through the normal external-acquisition boundary while the rest of the workflow runs live. Replay must be explicit and bound to the recorded provider/service/normalized request so unrelated requests cannot consume the fixture.

The canonical submission story ends at a verified relaunch-ready artifact. Public posting may be a higher Outcome Level, but it is not the minimum completion bar for this release.

No `if launch`, `if Newsliquid`, `if xbird`, `if second_purchase` or named-worker orchestration.

### Cutoff 2 — safe arbitrary prompts

Unrelated prompts need structural safety, not universal competence.

Unsupported/infeasible objectives should reach typed waiting, approval_required, blocked, escalated, failed or unsupported states rather than exceptions, infinite loops, fabricated authority or fake completion.

## 9. Remaining milestones to submission

### M6.1 — First Product E2E

Immediate priority.

Physically run the canonical Objective through the integrated product with a deterministic simulated useful external result. Prove the causal chain:

```text
Artifact v1
→ external result E
→ resumed worker receives E
→ worker run uses E
→ Artifact v2 materially changes
→ verification accepts v2
→ Objective reaches the minimum completion bar
```

Do not accept a transaction/result ID with no worker access to the useful content, or an unrelated artifact version bump.

### M6.2 — Useful Acquisition RECORD

After M6.1 is green, attempt one genuine useful OKX acquisition.

Capture provider/service, normalized request, request fingerprint, economic/payment identity where available, provider response, response hash, timestamps and provenance. Never retain wallet secrets/signatures/authorization headers.

If the preferred provider is fundamentally incompatible, allow at most one narrow substitute of the same resource type before making a release decision.

### M6.3 — Canonical Replay E2E + Backup Recording

Replace the simulated external edge with the recorded genuine acquisition.

Everything else runs through the production workflow and accepted M5 surface. The product must clearly label the external boundary as recorded/replayed rather than live.

As soon as the full run works, record Backup Demo #1 before polishing minor defects.

### M6.4 — Demo Hardening / Release Freeze

After Backup Demo #1:

- fix only defects that affect truthfulness, readability, repeatability or the demonstrated flow;
- implement a safe demo reset that does not restore spent/ambiguous financial authority;
- preserve immutable recorded acquisition evidence;
- freeze one exact release candidate.

Park for later unless they become actual blockers:

- public publishing / xbird;
- mandatory second purchase;
- mobile;
- additional polished scenarios;
- marketplace breadth;
- further architecture generalization.

### G1 — Promotion / submission gate

Run once on the exact frozen release candidate.

Verify focused evidence, typecheck/build, demo reset, canonical replay E2E, UI sanity, recording, repository/submission access and accurate claims.

No new architecture or feature expansion at G1.

## 10. Review/test discipline

Use risk-based cumulative testing.

Do not blast the full suite after every checkpoint.

For each M6 milestone:

- run focused changed-behavior tests;
- exercise only directly affected seams;
- add risk-specific persistence/recovery/authority tests when warranted;
- preserve still-valid M3/M4/M5 evidence.

G1 is the one canonical broad promotion/submission gate.

## 11. Historical truth

M1 and M2 remain accepted for the scope they actually proved.

Do not rewrite historical records to imply M1/M2 had:

- generalized economic MAKE-vs-BUY;
- persistent staffing;
- LangGraph orchestration;
- arbitrary-prompt robustness;
- paid external effects.

The 19 September architecture supersedes planning assumptions, not historical evidence.
