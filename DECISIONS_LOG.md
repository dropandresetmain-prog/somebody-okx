# Somebody × OKX — Decisions Log

Status: canonical decision history

## 17 September 2026 — Repository authority

**Decision:** `dropandresetmain-prog/somebody-okx` is the authoritative implementation and submission repository for OKX Dev Day 2026.

`somebody-ai` and `army-of-interns` are source/reference repositories only.

The earlier `wip-personal/somebody-okx/` planning documents are research inputs, not SSOT.

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

Use the source repo only for useful patterns and code. The hackathon needs a minimal dynamic internal workforce path, not a generalized organization simulator.

## 17 September 2026 — Web3 positioning

**Decision:** Somebody is not a Web3-first product.

OKX AI / X Layer are used at the cross-company machine-commerce boundary. “Web3 infrastructure for non-Web3 users” is a supporting marketing angle, not the primary product thesis.

## 17 September 2026 — Canonical demo

**Decision:** OPEN.

The supplier-invoice / changed-bank-details / Dial scenario is a researched candidate only. Earlier planning documents that called it canonical were premature.

A demo becomes canonical only after user acceptance and provider/payment feasibility evidence.

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

## 17 September 2026 — Source-project reuse

**Decision:** Somebody is the primary mature engineering source; Army is an R&D source.

From Somebody, prioritize reliability/effect/approval/verification patterns, agent execution scaffolding, Convex realtime patterns and relevant UI/project configuration.

From Army, prioritize controlled capability validation and deny-by-default tool permission patterns. Do not wholesale merge its schema/runtime.

## 17 September 2026 — Test environment

**Decision:** prefer X Layer Testnet and official test tooling during routine development.

Official docs support X Layer Testnet (`eip155:1952`), faucet test OKB/test USD₮0 and an official Mock Merchant for x402 verification.

Third-party OKX.AI providers may still be mainnet-only; provider environment support must be checked independently before live spending.

## Superseded / rejected ideas

- Renaming Somebody to “One Man Army / OMA AI” — rejected; keep Somebody.
- Making the product primarily an agent marketplace — rejected.
- Buying another generic LLM/research wrapper merely because a worker does not exist — rejected.
- Previous public-web-heavy market-research demo — rejected as too easy to reproduce internally.
- Treating the Opus invoice/Dial demo as already canonical — corrected; candidate only.
- Making `somebody-ai` the final OKX repo — corrected; final repo is `somebody-okx`.
