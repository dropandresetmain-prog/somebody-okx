# Somebody × OKX

**Somebody is the accountable AI manager for the One Person Company.**

> **Somebody builds the company it needs, then economically acquires what should come from outside, and stays accountable until the outcome is verified.**

One person should be able to operate with the functional reach of a much larger company. The founder gives Somebody an objective, not an agent specification.

## Start here

Read current truth in this order:

1. [MASTER_PLAN.md](MASTER_PLAN.md) — approved shipping plan from integrated M5 to submission.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — Somebody management protocol and authority boundaries.
3. [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — product behavior and hackathon acceptance.
4. [DECISIONS_LOG.md](DECISIONS_LOG.md) — settled decisions and supersessions.
5. [BUILD_DELTA.md](BUILD_DELTA.md) — implementation/provenance evidence.
6. [docs/work/ACTIVE_TASK.md](docs/work/ACTIVE_TASK.md) — current demo-convergence working ledger.
7. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — local-Convex-first development workflow.

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

## Shipping acceptance

### Cutoff 1A — first product E2E

The integrated product must physically complete one canonical Objective through the real management engine and M5 surface. The unreliable external edge may be deterministic/simulated for this first proof.

Required causal spine:

```text
Founder objective
→ Outcome Contract / Requirements
→ That Guy REUSE / CREATE
→ real internal work
→ evidence gap
→ MAKE / BUY decision
→ external acquisition boundary
→ useful result enters company state
→ That Guy resumes with that result
→ artifact materially changes
→ verification
→ Requirement satisfaction
→ Objective completion
```

### Cutoff 1B — one genuine useful acquisition record

After 1A works, perform one supervised genuine useful OKX acquisition and preserve safe provenance for the provider, service, normalized request, economic/payment identity where available, response, hashes and timestamps.

This acquisition is evidence for the submission. It does **not** need to execute live every time the demo runs.

### Cutoff 1C — canonical replay demo

The final canonical demo replays that previously recorded genuine acquisition at the external boundary while the rest of Somebody runs normally. Replay must be explicit, provenance-preserving and bound to the recorded provider/service/request identity.

Public publishing, a mandatory second purchase and mobile are not on the release critical path.

### Cutoff 2 — founder can mess around

Unrelated objectives may be mediocre, unsupported, blocked or escalated, but must not crash, infinitely spawn workers, fabricate authority, duplicate economic effects or fake completion.

## Current status

- **M0–M2:** accepted historical foundations.
- **M3 + M4:** integrated; application/payment boundary accepted by R3. Do not reopen without new material evidence.
- **M5:** accepted frontend wired to the authoritative normalized read model. Integration code baseline: `a9a0b3d31a7125e83fe0771a783ee62cbd96914a`.
- **M6.1 — IN PROGRESS (implementation complete, physical run founder-gated):** all
  deterministic external-acquisition seams are implemented and tested on
  `feat/m6-1-first-product-e2e` (`005b68c`): simulation boundary in the real
  intent kernel (operator-gated, fail-closed, provenance `simulation`), worker
  access to verified results, evidence-ref artifact causality, verified-intent
  verification routing, truthful M5 rendering, and demo setup. Level 1+2 tests
  prove the simulation wake drives the real management pass to gate acceptance;
  the live-model physical run needs a founder-configured deployment (runbook in
  `docs/work/ACTIVE_TASK.md` CP3).
- **M6.2:** record one genuine useful external acquisition.
- **M6.3:** replay that acquisition through the canonical M5 demo and record Backup Demo #1 immediately.
- **M6.4:** harden reset/repeatability, freeze the release and fix only demonstrated defects.
- **G1:** exact-candidate promotion/submission gate.

Still unproven: the first complete E2E, a useful live provider acquisition, and the final canonical recording.

## Product principle

The canonical launch scenario validates the architecture. It does not define the architecture.
