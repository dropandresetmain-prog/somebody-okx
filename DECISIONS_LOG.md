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

The canonical product must support:

`WorkerSpec → model selection → bounded agent instantiation → allowed tools → execution → result/evidence`

This is core hackathon scope, not stretch.

Model/harness selection follows `docs/agents/AGENT_MODEL_SELECTION.md` and `MODEL_ARSENAL.md`; architecture, security-sensitive work, wallet/signing/payment and final verification remain primary-model responsibilities.

## 17 September 2026 — Company Mission path

**Decision:** build a new bounded Company Mission path beside the inherited procurement mission.

Do not refactor the procurement aggregate into a universal workflow engine.

Company Mission should minimally represent objective, capability plan, workers, sourcing decisions, work results, external effects, verification, final outcome and event history.

## 17 September 2026 — Product surface

**Decision:** the Company Mission product surface is developed incrementally from M1, not added after the engine is complete.

The surface should show objective, capabilities, MAKE/BUY reasons, internal worker status/result, external provider and price, approval/payment/verification, and Somebody's unified outcome.

Avoid giant graphs, permanent org charts, raw agent-chat logs and Web3-first wallet UX.

## 17 September 2026 — Product language

**Decision:** the demo/product surface may use:

- **That Guy** for an internal worker created or reused by Somebody;
- **Somebody Else** for an external provider used when the company lacks a required scarce capability.

Engineering terminology remains `InternalWorker` / `ExternalProvider`. The playful labels do not enter core architecture types.

## 17 September 2026 — Build provenance vocabulary

**Decision:** `BUILD_DELTA.md` distinguishes four categories:

- **Inherited** — working pre-OKX capability;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — a prior idea reimplemented inside Somebody-OKX after discarding broken/demo-specific architecture;
- **New during OKX** — capability neither prior project had in working product form.

Rebuilt/adapted implementation created during 17–25 September is legitimate OKX-period engineering even when the original concept predates the hackathon. The source inspiration must still be disclosed.

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

`objective → capabilities → MAKE → BUY → verify → synthesize → outcome`

Not required on critical path:

- generic autonomous-company architecture;
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
- M1 Company Mission spine + active MAKE + first product surface;
- M2 canonical MAKE + Make-vs-Buy policy;
- M3 safe generic OKX buyer rail on testnet;
- M4 selected provider + full backend E2E;
- M5 surface/story hardening + first backup video;
- M6 release candidate.

**Hard feature freeze: 23 September 2026, 18:00 SGT.**

24 September is debugging/hardening only. 25 September is video/submission only, with an internal submission target of 22:00 SGT.

## 17 September 2026 — Build provenance ledger

**Decision:** `BUILD_DELTA.md` is the canonical hackathon provenance/evidence ledger.

Completed work requires repository evidence and observed verification. Planned work remains under Planned / Not Yet Built until proven.

Transferring inherited code during the build period does not convert inherited capability into hackathon work.

## 17 September 2026 — Model/subagent operating guidance

**Decision:** `docs/agents/MODEL_ARSENAL.md` and `docs/agents/AGENT_MODEL_SELECTION.md` are imported canonical operating guidance from `dropandresetmain-prog/resume-copilot@78d1477`.

They do not override the project rule that architecture, integration decisions, wallet/signing/payment work, security-sensitive code and final verification stay with the primary model.

## Superseded / rejected ideas

- Renaming Somebody to “One Man Army / OMA AI” — rejected; keep Somebody.
- Making the product primarily an agent marketplace — rejected.
- Buying another generic LLM/research wrapper merely because a worker does not exist — rejected.
- Previous public-web-heavy market-research demo — rejected as too easy to reproduce internally.
- Treating the Opus invoice/Dial demo as already canonical — corrected; candidate only.
- Making `somebody-ai` the final OKX repo — corrected; final repo is `somebody-okx`.
- Treating MAKE as only a worker-spec/planning exercise — superseded; active internal execution is required.
- Delaying product-surface work until after the engine — superseded; surface starts in M1.
