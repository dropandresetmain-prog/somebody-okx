# Somebody × OKX — Decisions Log

Status: canonical decision history

## 17 September 2026 — Repository authority

**Decision:** `dropandresetmain-prog/somebody-okx` is the authoritative implementation and submission repository for OKX Dev Day 2026.

`somebody-ai` and `army-of-interns` are source/reference repositories only. Earlier `wip-personal/somebody-okx/` planning documents are research inputs, not SSOT.

## 17 September 2026 — Product vision

**Decision:** Somebody's long-term vision is the AI manager for the One Person Company: one person operating with the functional reach of a much larger company.

The customer-facing product remains outcome-oriented rather than agent-oriented.

## 17 September 2026 — Hackathon thesis

**Decision:** the OKX project centers on dynamic capability sourcing:

> Determine what should be MADE internally and what should be BOUGHT externally, then complete the founder's objective using both.

Both paths must appear in the canonical demo.

## 17 September 2026 — Make vs Buy rule

**Decision:** the absence of an existing agent is not a reason to buy.

MAKE when the capability can reasonably be constructed from resources the company already controls.

BUY when the capability depends on a genuinely externally controlled scarce resource or when reproducing it internally would be materially impractical.

**Guiding principle:** do not buy generic cognition merely because it is packaged by another agent.

## 17 September 2026 — Workforce strategy

**Decision:** do not preserve “Army of Interns” as a required product/module/brand.

Use Army only as pre-existing R&D. The useful concepts have already been rewritten into a minimal `lib/workforce/` kernel inside Somebody-OKX.

Army-specific keyword analysis, duplicated permission sources, ranks, personalities, org hierarchy, Telegram/Twilio coupling and demo runtime are not carried forward.

## 17 September 2026 — Active internal agent spawning

**Decision:** MAKE is not complete when Somebody merely creates a `WorkerSpec`.

The product must support:

`WorkerSpec → WorkContract → model selection → bounded agent instantiation → allowed tools → execution → evidence/result`

This is core hackathon scope, not stretch.

The M1 proof must involve nontrivial tool-mediated work; a single free-form model completion does not satisfy active MAKE.

Model/harness guidance may inform execution model choice, while architecture, security-sensitive work, wallet/signing/payment and final verification remain primary-model responsibilities.

## 17 September 2026 — Inherited Somebody architecture

**Decision:** pre-OKX Somebody is more than a procurement demo to cannibalize for utilities. Its worker/reliability architecture is a deliberate inheritance.

The reusable architecture is:

`role-specific policy → generic worker contract/reliability core → bounded Agent/Runner runtime → evidence/effects → external verification`

Key inherited patterns include:

- `CoreWorkerContract` and controlled transitions;
- role/domain state compiling into the generic contract;
- model proposes, application authorizes;
- bounded read/act agent ports;
- deliberate model/provider selection;
- durable runs, leases and stale-run fencing;
- evidence/provenance;
- persisted approval for gated effects;
- stable effect identity/idempotency;
- execution separated from verification;
- application-owned completion.

Procurement is the first role-specific implementation of that architecture, not the universal product model.

## 17 September 2026 — WorkerSpec and WorkContract are separate

**Decision:** do not overload a worker definition with assignment authority/completion semantics.

- `WorkerSpec` describes what an internal worker can do: capabilities, required resources, tool envelope and bounded responsibility.
- `WorkContract` describes what that worker is allowed and required to do for one assignment: objective, idempotency scope, authority/effects where applicable, required evidence/outputs and completion requirements.

The inherited `CoreWorkerContract` is the starting architecture for `WorkContract`.

Its current effect-centric completion rule may be adapted during OKX so legitimate evidence-only MAKE work can complete without inventing an external effect.

## 17 September 2026 — Fresh OKX Convex data plane

**Decision:** Somebody-OKX will use a fresh Convex project/deployment and fresh operational state.

There is no migration requirement from `acrobatic-swan-765`, which belongs to the previous Somebody hackathon environment.

Do not inherit old data, `healthProbes`, `HEALTH_PROBE_WRITES_ENABLED`, old deployment pins or old demo fixtures merely for continuity.

Useful Convex/runtime patterns may be reused. Deployment-specific state and guards must justify themselves against the current product.

## 17 September 2026 — Old procurement compatibility is not an M1 gate

**Decision:** M1 does not need to keep the inherited procurement demo operational.

Old procurement code may remain temporarily for provenance/reference/reuse, but the new operational schema and current product path should not be distorted to preserve the old hackathon runtime.

This does not authorize careless deletion of useful inherited primitives. It removes backwards compatibility as a product requirement.

## 17 September 2026 — Current-project domain language

**Decision:** do not preserve the noun `Mission` merely because procurement used it.

Current engineering concepts should use product-relevant neutral language such as:

- `Objective`;
- `CapabilityPlan`;
- `WorkItem`;
- `WorkerSpec`;
- `WorkContract`;
- `InternalWorker`;
- `ExternalProvider`;
- `Evidence`;
- `Effect`;
- `Outcome`;
- `ActivityEvent`.

The exact storage schema can remain minimal and evolve only with demonstrated need.

## 17 September 2026 — Role/capability policy remains specialized

**Decision:** do not build a generic workflow DSL.

Each bounded role/capability may own the smallest domain policy needed to interpret evidence, expose legal actions and determine domain-specific completion.

The generic runtime should not contain procurement, research or future-role semantics.

## 17 September 2026 — Product surface

**Decision:** the current product surface is developed incrementally from M1, not added after the engine is complete.

Reuse useful Mission Control visual direction and small primitives — Somebody identity, calm operator state, activity/evidence/approval/verification patterns — but do not expand the large procurement-shaped `MissionControl.tsx` into a universal UI.

The surface should show objective, capabilities/resources, MAKE/BUY reasons, internal worker status/result/evidence, external provider and price, approval/payment/verification, and Somebody's unified outcome.

Avoid giant graphs, permanent org charts, raw agent-chat logs and Web3-first wallet UX.

## 17 September 2026 — Product language

**Decision:** the demo/product surface may use:

- **That Guy** for an internal worker created or reused by Somebody;
- **Somebody Else** for an external provider used when the company lacks a required scarce capability.

Engineering terminology remains neutral. The playful labels do not enter core architecture types.

## 17 September 2026 — Build provenance vocabulary

**Decision:** provenance reporting uses four categories:

- **Inherited** — working pre-OKX capability;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — a prior idea or inherited primitive changed/reimplemented inside Somebody-OKX for the current product;
- **New during OKX** — capability neither prior project had in working product form.

Rebuilt/adapted implementation created during 17–25 September is legitimate OKX-period engineering even when the original concept predates the hackathon. Source inspiration must still be disclosed.

`BUILD_DELTA.md` remains the canonical evidence ledger.

## 17 September 2026 — Web3 positioning

**Decision:** Somebody is not a Web3-first product.

OKX AI / X Layer are used at the cross-company machine-commerce boundary. “Web3 infrastructure for non-Web3 users” is a supporting marketing angle, not the primary product thesis.

## 17 September 2026 — Canonical demo

**Decision:** OPEN until **18 September 2026, 12:00 SGT**.

The supplier-invoice / changed-bank-details / Dial scenario is a researched candidate only.

After the decision gate, broad scenario ideation stops unless material technical/provider failure requires a reopen.

## 17 September 2026 — Scope boundary

**Decision:** one reliable 2–4 minute end-to-end demo outranks breadth.

Critical shape:

`objective → capabilities/resources → MAKE → BUY → verify → synthesize → outcome`

Not required on critical path:

- generic autonomous-company architecture;
- generic workflow DSL;
- broad marketplace discovery;
- multi-vendor competition;
- A2A negotiations;
- worker social chatter;
- org-chart theater;
- multiple polished workflows.

## 17 September 2026 — Test environment

**Decision:** X Layer Testnet plus the official Mock Merchant is the preferred initial OKX payment development environment.

Official docs support X Layer Testnet (`eip155:1952`), faucet test OKB/test USD₮0 and an official Mock Merchant for the full x402 buyer lifecycle without real funds.

Marketplace-provider environment support remains provider-specific. Mainnet expenditure stays bounded and explicitly approved.

## 17 September 2026 — Master Plan and release freeze

**Decision:** `MASTER_PLAN.md` is the canonical execution plan.

Milestones:

- M0 foundation/provenance — complete;
- M1 Objective spine + active MAKE + first current-product surface;
- M2 canonical MAKE + Make-vs-Buy policy;
- M3 safe generic OKX buyer rail on testnet;
- M4 selected provider + full backend E2E;
- M5 surface/story hardening + first backup video;
- M6 release candidate.

M1 is **one milestone**. Internal implementation checkpoints must not be promoted into new project milestone numbers.

**Hard feature freeze: 23 September 2026, 18:00 SGT.**

24 September is debugging/hardening only. 25 September is video/submission only, with an internal submission target of 22:00 SGT.

## 17 September 2026 — Build provenance ledger

**Decision:** `BUILD_DELTA.md` is the canonical hackathon provenance/evidence ledger.

Completed work requires repository evidence and observed verification. Planned work remains under Planned / Not Yet Built until proven.

Transferring inherited code during the build period does not convert inherited capability into hackathon work.

## 17 September 2026 — Model/subagent operating guidance

**Decision:** `docs/agents/MODEL_ARSENAL.md` and `docs/agents/AGENT_MODEL_SELECTION.md` are imported operating guidance from `dropandresetmain-prog/resume-copilot@78d1477`.

They guide engineering task routing. They are **not automatically a product runtime-routing algorithm** for dynamically spawned workers.

Product worker model selection should be deliberate and bounded to current needs. Architecture, integration decisions, wallet/signing/payment work, security-sensitive code and final verification stay with the primary model.

## Superseded / rejected ideas

- Renaming Somebody to “One Man Army / OMA AI” — rejected; keep Somebody.
- Making the product primarily an agent marketplace — rejected.
- Buying another generic LLM/research wrapper merely because a worker does not exist — rejected.
- Previous public-web-heavy market-research canonical demo — rejected as too easy to reproduce internally.
- Treating the Opus invoice/Dial demo as already canonical — corrected; candidate only.
- Making `somebody-ai` the final OKX repo — corrected; final repo is `somebody-okx`.
- Treating MAKE as only a worker-spec/planning exercise — superseded; active internal execution is required.
- Delaying product-surface work until after the engine — superseded; surface starts in M1.
- **“Build a Company Mission path beside procurement” as the architectural requirement — superseded.** Build the current Objective/WorkItem path on a fresh OKX data plane while inheriting the useful generic worker/reliability architecture.
- Preserving `acrobatic-swan-765` or old health-probe machinery for M1 continuity — rejected.
- Requiring inherited procurement behavior to remain operational as M1 acceptance — rejected.
