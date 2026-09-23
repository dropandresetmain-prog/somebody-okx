# Somebody × OKX — Decisions Log

Status: **canonical decision history**

This log records settled product/architecture decisions and explicit supersessions. Current code/runtime/schema remain implementation truth; newer accepted decisions supersede older planning assumptions.

## 17 September 2026 — Repository authority

**Decision:** `dropandresetmain-prog/somebody-okx` is the authoritative implementation and submission repository for OKX Dev Day 2026.

`somebody-ai` and `army-of-interns` are source/reference repositories only.

## 17 September 2026 — Product vision

**Decision:** Somebody is the AI manager for the One Person Company: one person operating with the functional reach of a much larger company.

The founder gives Somebody an outcome, not an agent specification.

## 17 September 2026 — Hackathon thesis

**Decision:** the OKX project centers on dynamic capability/resource sourcing.

> **Somebody builds the company it needs, then buys what that company cannot make.**

MAKE when required resources are already controlled by the company. BUY only when execution requires a genuinely externally controlled scarce resource.

The absence of an existing agent is not a reason to BUY.

## 17 September 2026 — Active internal agent spawning

**Decision:** MAKE is not complete when Somebody merely creates a `WorkerSpec`.

Required path:

`WorkerSpec → WorkContract → model selection → bounded Agent/Runner → allowed tools → execution → evidence/result`

Application/domain policy, not model prose, decides completion.

## 17 September 2026 — Inherited Somebody architecture

**Decision:** preserve the useful generic worker/reliability architecture from pre-OKX Somebody, not the old procurement data model.

Reusable pattern:

`role-specific policy → generic work/reliability contract → bounded runtime → evidence/effects → verification`

Keep model-proposes/application-authorizes, run leases/fencing, evidence provenance, explicit effect lifecycle, idempotency/reconciliation and verification-before-completion.

Procurement is one prior role implementation, not the universal product architecture.

## 17 September 2026 — WorkerSpec and WorkContract are separate

**Decision:** `WorkerSpec` describes reusable bounded worker capability. `WorkContract` describes assignment-specific authority, evidence/effects and completion requirements.

Do not overload one object with both concerns.

## 17 September 2026 — Fresh OKX data plane

**Decision:** Somebody-OKX uses a fresh Convex deployment and fresh operational state. No migration from `acrobatic-swan-765` is required.

Old health probes, old procurement fixtures and old provider bindings are not current-product dependencies.

## 17 September 2026 — Current project language

**Decision:** use neutral engineering concepts such as `Objective`, `WorkItem`, `WorkerSpec`, `WorkContract`, `InternalWorker`, `ExternalProvider`, `Evidence`, `Effect`, `Outcome` and `ActivityEvent`.

Product/demo labels may use **That Guy** for internal workers and **Somebody Else** for external providers.

## 17 September 2026 — Role/capability policy remains specialized

**Decision:** do not build a generic workflow DSL. Each bounded role/capability owns only the domain policy needed to expose legal actions and decide completion.

## 17 September 2026 — Product surface

**Decision:** build the current Objective Workspace incrementally. Show objective, capability/resource decisions, meaningful work/evidence, provider/spend/verification and final outcome without exposing giant graphs, agent chat logs or Web3-first wallet UI.

## 17 September 2026 — Provenance vocabulary

**Decision:** use:

- **Inherited** — working capability before the OKX build;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — prior idea or inherited primitive materially adapted during the build;
- **New during OKX** — capability not previously present in working form.

`BUILD_DELTA.md` is the canonical provenance/evidence ledger.

## 17 September 2026 — Web3 positioning

**Decision:** Somebody is not Web3-first. OKX AI / X Layer sit at the cross-company machine-commerce boundary; internal orchestration remains normal software.

## 17 September 2026 — Initial canonical-demo gate

**Historical decision:** canonical scenario was held OPEN until 18 September 2026, 12:00 SGT. Invoice/Dial and CertiK-style flows were candidates only.

**Superseded by the 18 September canonical demo decision below.**

## 17 September 2026 — Test/development rail

**Decision:** X Layer Testnet and the official Mock Merchant are the preferred first payment-development environment.

Third-party OKX.AI provider network/payment support remains provider-specific. Never infer successful payment or settlement from submission alone.

## 17 September 2026 — Review gates

**Decision:** reviews are risk-boundary gates, not per-milestone ceremony.

Sequence:

`M1 → R1 → M2 → M3 → R2 → M4 → R3 → M5 → M6 → G1`

R1 is static architecture/authority review. R2, R3 and G1 require executable coding-agent evidence.

## 18 September 2026 — Canonical demo APPROVED

**Decision:** canonical founder objective is a bounded version of:

> **“Our launch isn’t working. Fix it and relaunch today.”**

This supersedes the invoice/Dial candidate, CertiK partnership-diligence candidate and broad scenario exploration.

Do not reopen broad scenario ideation unless provider or technical feasibility exposes a serious blocker.

The founder may provide a small believable spend limit. Do not use fake large spend amounts for drama.

## 18 September 2026 — Sourcing is repeated and resource-level

**Decision:** the objective itself is not globally labelled MAKE or BUY.

A single mission may contain multiple bounded sourcing decisions as resource gaps emerge during execution.

Canonical demo shape:

`MAKE → market discovery → REJECT/MAKE → BUY #1 → MAKE reacts → BUY #2 → ACT/VERIFY → outcome`

Hackathon scope is one meaningful MAKE path, maximum two justified real purchases, one visible rejected external option where useful, and one final founder outcome.

The existing pure `lib/sourcing` `MAKE / BUY / BLOCKED` kernel remains the canonical deterministic policy and should be reused per bounded resource need rather than rewritten.

Models may propose resource needs. Application state decides ownership, provider approval, sourcing and spend authority.

## 18 September 2026 — Marketplace is a resource market, not an agent directory

**Decision:** Somebody shops for externally controlled resources its own workers cannot make, not generic cognition packaged as agents.

Relevant BUY resource classes include proprietary/privileged data, external execution/distribution interfaces, specialist infrastructure, physical capacity, human presence and independent authority/attestation.

## 18 September 2026 — Marketplace discovery

**Decision:** marketplace discovery is part of the canonical product flow, but a generalized marketplace search/indexing platform is out of scope.

Implementation order:

1. use a supported official discovery/search primitive if one is available and appropriate;
2. otherwise use a small application-owned synchronized snapshot of the relevant current OKX.AI offerings behind a replaceable discovery interface;
3. do not scrape undocumented/private APIs.

Provider invocation/payment must remain real even if discovery uses the synchronized snapshot.

## 18 September 2026 — Canonical provider set

**Decision:** current canonical provider candidates are:

**Rejected external option — FlyBeacon or equivalent generic growth service.** Reject when it substantially reproduces reasoning, public research, planning or copy work the internal growth worker can already perform.

**BUY #1 — Newsliquid.** Target resource: proprietary/privileged social intelligence. The purchased evidence must materially affect subsequent internal work.

**BUY #2 — xbird.** Target resource: external social execution infrastructure / privileged execution interface. The founder/company retains control of the underlying X account and intent; the purchase is the machine execution interface, not an X identity.

Exact endpoint, current price, payment environment, credentials, result schema and independent verification must be checked immediately before integration.

If either primary provider fails the feasibility gate, substitute the nearest reliable provider of the **same resource type** without reopening broad scenario ideation.

## 18 September 2026 — Canonical mission behavior

**Decision:** the internal growth/launch worker must do real work on controlled company state, ideally landing-page/campaign messaging.

BUY #1 must not itself solve the objective. External social evidence must flow back into MAKE so the internal worker changes positioning/message/segment/artifact.

BUY #2 performs the external relaunch action. Completion requires read-back/verification of that effect.

Do not promise downstream business outcomes such as “100 customers acquired” unless they actually happen. The demo completes when the relaunch work itself is verified.

## 18 September 2026 — Five-day scope boundary

**Decision:** one reliable canonical mission outranks infrastructure breadth.

Explicitly out of scope:

- universal marketplace indexing;
- auctions or generic provider ranking/reputation;
- automated negotiations;
- generalized A2A escrow unless strictly forced by a provider;
- generalized internal-vs-external cost optimization;
- three or more providers;
- workflow DSL;
- permanent giant org chart;
- second polished scenario;
- arbitrary-prompt support;
- broad company-OS architecture.

## Superseded / rejected ideas

- Renaming Somebody to “One Man Army / OMA AI” — rejected.
- Making Somebody primarily an agent marketplace — rejected.
- Buying generic cognition merely because another agent wraps an LLM — rejected.
- Public-web-heavy market research as the canonical demo — rejected as too internally reproducible.
- Supplier invoice / Dial as canonical — superseded by the failing-launch scenario.
- CertiK partnership diligence as canonical — superseded by the failing-launch scenario.
- Treating MAKE as only a worker-spec/planning exercise — superseded; active execution is required.
- One global objective-level MAKE/BUY verdict — superseded by repeated resource-level sourcing decisions.
- “One external provider on the critical path” — superseded; the canonical mission may use up to two justified BUYs of different resource types.
- Broad marketplace discovery being entirely out of scope — refined; bounded discovery is required, generalized indexing is not.
- Preserving the old procurement deployment/runtime for continuity — rejected.


---

## 19 September 2026 — Somebody Management Protocol v1

**Decision:** Somebody is a persistent accountable managerial identity operating an observe → decide → authorize → execute → verify → replan loop.

This supersedes treating the current launch/research flow as the target orchestration architecture.

### Outcome contracts

- Risk-based autonomy: Somebody may define ordinary low-risk success criteria; material ambiguity may require founder clarification/approval.
- Objectives may have multiple Outcome Levels.
- One Outcome Level is the minimum completion bar.
- Required Requirements gate completion.
- Supporting Requirements may remain incomplete but must be disclosed clearly.
- Worker/run completion is not Objective completion.
- Somebody proposes Objective completion; deterministic application checks current contract/evidence.

### Options and economics

**Decision:** internal feasibility does not force MAKE.

When internal and external paths are feasible, both classes may enter the option set. Discovery may remain bounded.

Allowed strategies include MAKE, BUY, HYBRID, WAIT, ASK FOUNDER and BLOCK/ESCALATE. Investigation is bounded work.

The LLM performs managerial recommendation over grounded eligible options. Deterministic application logic owns eligibility, authority, spend, provider identity, effect identity and completion proof.

The earlier “BUY only scarce resources / globally reject generic cognition” rule is superseded as a universal economic rule. Scarcity remains a strong external advantage, not the only legitimate BUY reason.

## 19 September 2026 — LangGraph adopted for M4 orchestration

**Decision:** use LangGraph for Somebody's management/control loop.

- Convex remains authoritative company/business state.
- `@openai/agents` remains That Guy execution.
- LangChain is not adopted.
- LangGraph checkpoints contain continuation/execution-local state only.
- Every consequential resumed action revalidates current Convex truth.
- Payment/publication exactly-once semantics remain application-owned through stable identities and reconciliation.

This is not a migration of M1/M2 business truth. It replaces/refactors the orchestration layer that M4 already needs to change.

## 19 September 2026 — Persistent workforce / staffing authority

**Decision:** That Guys are persistent reusable worker identities; runs are ephemeral.

Prefer REUSE when an eligible worker fits, but allow CREATE for supported reasons such as availability, specialization, context, parallelism or cost.

Worker breadth is the smallest coherent bounded responsibility.

Workers may request capability/resource support. Only Somebody may create/reuse workers, authorize acquisition/spend or propose Objective completion.

Worker-to-worker autonomous creation is not allowed in M4.

## 19 September 2026 — Dynamic capability/tool-contract definition

**Decision:** Somebody may dynamically define new semantic capabilities and tool contracts.

This does not allow a model to conjure real-world authority. New executable primitives requiring an integration, credential, destructive permission, professional authority or payment right remain unavailable until governed application onboarding/authorization exists.

Dynamic capability is allowed; dynamic authority is not.

## 19 September 2026 — M4 / review / demo sequence

**Decision:** M4 is one long-horizon task, not M4A–M4F.

Internal checkpoints may exist only as implementation working memory in `docs/work/ACTIVE_TASK.md`.

M3/R2 remains a separate payment lane and may integrate later because of an external blocker. M4 must build the generic buyer/effect seam without duplicating M3.

Remaining sequence:

`M4 long-horizon implementation → R3 premium review → finish M4 payment-backed acceptance when M3/R2 is ready → M5 surface/story → M6 RC → G1 → demo`

Hackathon acceptance has two cutoffs:

1. canonical causal end-to-end trace including integrated sandbox/X Layer Testnet payment once M3 is available;
2. unrelated founder prompts remain structurally safe even when answer quality is weak.

## 19 September 2026 — Product surface

**Decision:** default UI shows high-level management truth; optional deeper graph/trace supports demo/debugging.

Do not expose private chain-of-thought. The runtime decision/evidence record, not hidden reasoning, is the product trace.


---

## 20 September 2026 — Demo convergence / release scope

**Decision:** the architecture phase is closed for the hackathon release. The R3-accepted M4 × M3 backend and accepted M5 Executive Mission Control are integrated on the M5 code baseline `a9a0b3d31a7125e83fe0771a783ee62cbd96914a`.

The next proof is the **first complete product E2E**, not another subsystem milestone.

Shipping sequence:

1. **M6.1 — First Product E2E:** run the full Somebody workflow with a deterministic simulated useful external result so worker resumption, artifact causality, verification, completion and M5 rendering are proven without provider/payment uncertainty.
2. **M6.2 — Useful Acquisition RECORD:** perform one genuine useful OKX acquisition and preserve safe immutable provenance/result evidence.
3. **M6.3 — Canonical Replay E2E:** replay that recorded acquisition at the external boundary while the rest of the product runs normally; record Backup Demo #1 immediately.
4. **M6.4 — Harden / reset / freeze:** fix only demonstrated defects, make reset repeatable without restoring spend authority, then freeze.
5. **G1 — Submission gate:** exact-candidate validation, final recording and submission package.

**Decision:** the canonical release minimum completion bar is a **verified relaunch-ready asset**, not public posting. Public publishing may remain a higher Outcome Level.

**Decision:** one useful external acquisition is mandatory for the stronger demo story; a second purchase is not. xbird/public publishing, a mandatory second purchase, mobile, extra provider breadth and further architecture generalization are parked.

**Decision:** the final demo may use **transparent RECORD/REPLAY** for the unreliable external payment/provider boundary. The original acquisition must be genuine, provenance-preserving and bound to the provider/service/normalized request. Replay must not complete the Objective directly: Somebody still makes the decision, ingests the purchased result, resumes the worker, changes the artifact, verifies it and passes the normal completion gate.

This supersedes the earlier release-critical assumption that the canonical mission must include BUY #2/public publication. It does not erase that earlier decision from historical evidence.

---

## 21 September 2026 — M6.1 manager–execution mini-refactor

**Decision status: approved direction and implementation plan; NOT implementation or physical acceptance.**

The founder requested a bounded redesign after the failed M6.1 patch-and-retry sequence. The implementation plan is `docs/work/M6_1_MANAGER_EXECUTION_REFACTOR_PLAN.md`; `docs/work/ACTIVE_TASK.md` is the current execution ledger. The complete prior ledger is preserved at `docs/work/M6_1_PRE_REFACTOR_RECOVERY_HISTORY.md` for historical evidence only.

**Decision:** make the management/execution loop coherent before another blind run. This is an explicit, narrow exception to the 20 September architecture freeze, not permission to rewrite the entire project.

For newly created objectives using the refactored path:

- Keep a stable founder-facing output contract. Separate the final deliverable's criteria from next-action planning and action receipts; do not turn every planning thought into a mandatory requirement.
- Somebody uses the LLM for semantic diagnosis, evidence adequacy, comparison of grounded eligible options, next-action recommendation and final assessment. Application code owns facts, permission, financial authority, effect identity, validation and acceptance of concrete completion evidence.
- Availability and semantic adequacy are different. A worker failure cannot manufacture scarcity, and a BUY need not wait for MAKE to fail. The existing economic principle that internal feasibility does not force MAKE remains intact.
- Execute one current action at a time. Park compound HYBRID execution for new objectives; a mixed plan is separately authorized MAKE and BUY actions with reassessment between them. Preserve historical HYBRID data and evidence without relabelling or replaying old financial actions.
- Use one worker terminal submission surface for delivered work, an evidence-linked input request, or an application-classified failure. Persist observations/results and wake Somebody through the normal application path; remove mandatory bookkeeping tool ceremonies. An analysis assignment need not mutate the launch artifact just because its tools could do so.
- A completed acquisition does not itself complete the output requirement. Subsequent work must receive explicitly linked, verified, scoped evidence and use it substantively. An evidence ID or unrelated version bump alone is not causal acceptance.
- The release deliverable remains a persisted, evidence-backed relaunch recommendation with real revised messaging, assumptions/unknowns and next steps. It is not public posting or a claim of measured conversion improvement.

**Preserved:** Convex, LangGraph, bounded subordinate workers, persistent worker identities, existing authorization and M3 financial authority, leases/fencing, provenance, idempotency, independent completion checks and the accepted M5 visual layout. Do not introduce a parallel demo engine, a second payment/policy authority or hardcoded MAKE → BUY choreography.

**Acceptance:** Gate 1 proves the production path with a pinned live model and only the acquisition edge simulated, including repeat fresh-objective runs without manual state rescue. Gate 2 is the subsequent genuine-acquisition record/replay and release freeze under separate live-execution scope. The next implementation owner is assigned Gate 1, not automatic live spending. Keep intermediate work internal rather than creating more founder checkpoints.

This supersedes conflicting prior assumptions about frozen management/worker protocol, mandatory compound HYBRID execution, strategy-derived outcome meaning and the old STOP-A1/B route as the universal acceptance bar. Unchanged financial/security decisions remain binding. Detailed field choices remain implementation work; code/runtime/schema still establish what is actually implemented. The plan's base is recovery `07230355c0000d294be32aa6bf08a2200631d3e2`; no end-to-end PASS or deployment is asserted by this documentation change.
