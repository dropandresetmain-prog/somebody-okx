# Somebody × OKX

**Somebody is the accountable AI manager for the One Person Company.**

> **Somebody builds the company it needs, then economically acquires what should come from outside, and stays accountable until the outcome is verified.**

One person should be able to operate with the functional reach of a much larger company. The founder gives Somebody an objective, not an agent specification.

## Start here

Read current truth in this order:

1. [MASTER_PLAN.md](MASTER_PLAN.md) — approved M4-to-demo execution plan.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — Somebody management protocol and authority boundaries.
3. [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — product behavior and hackathon acceptance.
4. [DECISIONS_LOG.md](DECISIONS_LOG.md) — settled decisions and supersessions.
5. [BUILD_DELTA.md](BUILD_DELTA.md) — implementation/provenance evidence.
6. [docs/work/ACTIVE_TASK.md](docs/work/ACTIVE_TASK.md) — tonight's M4 long-horizon ledger.

Current code/runtime/schema and newer accepted decisions outrank stale plans.

## Current architecture

```text
Founder objective
      ↓
Persistent Somebody identity
      ↓
LangGraph management loop
      ↓
Objective → Outcome Contract → Requirements
      ↓
candidate satisfaction strategies
MAKE / BUY / HYBRID / WAIT / ASK / BLOCK
      ↓
grounded facts + eligible options
      ↓
LLM managerial recommendation
      ↓
deterministic authorization
      ↓
execute bounded work / acquisition / effect
      ↓
verify
      ↓
persist authoritative truth in Convex
      ↓
wake Somebody and replan
      ↺
```

### Responsibility split

- **LangGraph:** Somebody's orchestration/continuation loop.
- **Convex:** authoritative company/business state.
- **@openai/agents:** bounded That Guy execution.
- **M3 buyer rail:** payment/signing/submission/reconciliation boundary.
- **External providers / chain:** external reality, reconciled into Convex as evidence.

LangChain is not adopted.

## Workforce model

**Somebody** is a persistent managerial identity.

**That Guy** is a persistent reusable worker identity with a bounded capability envelope.

A **WorkerRun** is ephemeral. A **WorkContract** governs one assignment.

Workers may request missing capability/resource support. Only Somebody may staff work, create/reuse workers, recommend acquisition, or propose objective completion.

Somebody may dynamically define new semantic capabilities and tool contracts. A model cannot conjure real-world authority: executable tools still require governed primitives, integrations, credentials and authorization.

## Economic decision model

Internal feasibility does **not** automatically force MAKE.

When internal and external paths are both feasible, both may enter the option set. Compare grounded facts such as:

- scope / quality;
- time;
- monetary and runtime cost;
- reliability;
- availability;
- reuse value;
- external advantage;
- uncertainty and provenance.

The LLM performs genuine managerial judgment among permitted options. Deterministic application logic validates eligibility, authority, spend, provider identity, effect identity and completion proof.

## Hackathon acceptance

### Cutoff 1 — canonical causal demo

> **“Our launch isn’t working. Fix it and relaunch today.”**

The supported demo must causally traverse the generic engine, eventually including an integrated sandbox/X Layer Testnet payment when M3 is ready, acquired result, internal reaction, external effect verification and truthful objective resolution.

Provider names are data/adapters, not orchestration branches.

### Cutoff 2 — founder can mess around

Unrelated objectives may be mediocre, unsupported, blocked or escalated, but must not crash, infinitely spawn workers, fabricate authority, duplicate economic effects or fake completion.

## Current status

- **M0:** complete.
- **M1 + R1:** accepted.
- **M2:** accepted on `main@1fa7962d9ef0d359951d14993834d1d419a5c980`.
- **M3 / R2:** separate payment lane; currently externally blocked. Do not duplicate/restart it from M4.
- **M4:** one long-horizon task implementing the generic Somebody management engine; payment integration lands later when M3 is accepted.
- **R3:** premium management-engine review after the long-horizon M4 implementation.
- **M5:** product surface / story hardening.
- **M6:** release candidate.
- **G1:** exact-candidate promotion gate.

## Product principle

The canonical launch scenario validates the architecture. It does not define the architecture.
