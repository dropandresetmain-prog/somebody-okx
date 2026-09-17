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
