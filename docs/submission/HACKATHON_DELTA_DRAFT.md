# Somebody × OKX — Hackathon Delta Draft

Status: **DRAFT JUDGE-FACING EXISTING-PROJECT DISCLOSURE**  
Official build period: **17–25 September 2026**  
Draft basis: **main@2bc3e06a60e32fe5e987b1dced35627f7dae2827**

This document is the concise submission version of the canonical BUILD_DELTA.md.

It exists because OKX Dev Day permits existing projects but judges assess **only work completed during the official build period**.

---

## 1. Pre-OKX baseline — inherited, not claimed as hackathon work

Source:

- repository: dropandresetmain-prog/somebody-ai
- accepted pre-OKX SHA: 709a169a1a4f71b8dc2d7427438ff514999fb07e
- date: **13 September 2026**

Transferred into somebody-okx during the build period:

- transfer commit: a47cc93
- inherited-baseline verification checkpoint: 093d247
- inherited automated suite: **78/78 pass**
- root TypeScript typecheck: clean
- Convex TypeScript typecheck: clean

### What already existed

The inherited Somebody project already had:

- Somebody brand, mascot and useful UI primitives;
- a working procurement vertical;
- a generic reliability/core-worker split;
- model-proposes / application-authorizes patterns;
- evidence/provenance history;
- persisted human approval for gated effects;
- stable effect identity and idempotent retry/reconciliation;
- execution separated from external read-back/verification;
- several real provider integrations used by the old procurement demo.

These are **not** presented as OKX Dev Day output.

The old procurement implementation is a reference/vertical, not the new product architecture.

---

## 2. Prior R&D reused as ideas, not claimed as a shipped baseline

A separate pre-existing army-of-interns prototype contained useful R&D ideas around:

- controlled capability vocabularies;
- capability-to-tool permissions;
- worker creation;
- worker reuse/matching.

The OKX project deliberately rejected its product/runtime baggage and rebuilt only the minimal useful semantics inside Somebody.

Source R&D SHA: 677166db591465fb6d201fb12db7cfe038557a92

---

## 3. Built or materially rebuilt during OKX Dev Day

### A. Generalized workforce kernel

Classification: **Rebuilt / adapted during OKX**

Evidence:

- workforce kernel checkpoint: dfae75af9326a8e719033948ede8b2b481b423bd

Added:

- scenario-independent controlled capability vocabulary;
- deny-by-default capability → tool permissions;
- permission-envelope enforcement;
- resource-class requirements;
- minimal persistent WorkerSpec;
- reuse-or-create staffing;
- workers that cannot grant themselves spend authority.

### B. Objective, Outcome Contract and Requirement semantics

Classification: **New / rebuilt during OKX**

Added:

- explicit founder Objective;
- Outcome Contracts with multiple Outcome Levels;
- minimum completion bar;
- required vs supporting Requirements;
- current-revision satisfaction semantics;
- proof-bearing requirement resolution;
- independent application completion gate.

Core rule:

**run stopped ≠ assignment complete ≠ requirement satisfied ≠ objective complete**

### C. Economic MAKE / BUY / HYBRID decisions

Classification: **New during OKX**

Added:

- internal and external options may both be eligible;
- internal feasibility no longer automatically forces MAKE;
- hard eligibility before model recommendation;
- comparable current facts such as scope, time, cost, reliability, availability, reuse value and provenance;
- LLM managerial recommendation among eligible options;
- deterministic recheck before authorization;
- WAIT / ASK FOUNDER / BLOCK-ESCALATE states where action is not justified.

Evidence anchors:

- accepted M1 base: 1e2c1a484713792cead51b85e1e1ae36d28b3e77
- M2 accepted base before M3/M4: 1fa7962d9ef0d359951d14993834d1d419a5c980

### D. Persistent Somebody management engine

Classification: **New during OKX**

M4 introduced Somebody as a persistent accountable managerial identity instead of a one-shot planner.

Implemented:

- Outcome Contract / Requirement management;
- grounded managerial decision protocol;
- persistent reusable workforce;
- LangGraph wake-driven management loop;
- bounded budgets / no-progress termination / replay safety;
- external execution-intent seam;
- request-resource → wake → redecision behavior;
- completion-gate proposal and independent acceptance.

M4 evidence:

- CP7 / R3 review target: 59f75f7
- M4 completion suite at that checkpoint: **404/404 pass**
- root and Convex TypeScript programs: clean

### E. Governed payment / external acquisition boundary

Classification: **New / materially rebuilt during OKX**

The OKX product adds a buyer/acquisition rail as a separate authority boundary from managerial state.

The architecture keeps these truths distinct:

~~~text
unsigned intent
→ prepared
→ signed
→ submitted
→ reconciled / settled-or-terminal
→ provider result
→ business evidence
→ downstream consumption
→ verified objective progress
~~~

The management engine does not treat a payment request, signature, submission or transaction identifier as business completion.

M3 and M4 were integrated and reviewed together. Accepted integration evidence recorded by the current master plan:

- exact accepted M4 × M3 code candidate: 88afa084f64d57a0b189811df846d0016ac87e3e
- docs/freeze head containing it: b10b7de7df71a040936c4ec64435fc5498dc3a78

Final useful acquisition/provider evidence remains:

**FINAL M6.2 EVIDENCE — DO NOT CLAIM YET**

### F. New management product surface

Classification: **New / rebuilt during OKX**

M5 replaced the previous procurement-shaped presentation with a surface driven by the authoritative normalized management read model.

The product can present:

- founder objective;
- success criteria / minimum completion bar;
- requirements;
- internal worker creation/reuse;
- options considered;
- MAKE / BUY / HYBRID recommendation;
- approvals/resources/payment state;
- verified effects;
- completed/pending outcome levels;
- blockers and supporting work.

Accepted integrated M5 baseline:

**a9a0b3d31a7125e83fe0771a783ee62cbd96914a**

### G. Causal external-result continuation

Classification: **CURRENT OKX WORK — pending acceptance**

The final convergence work is proving the causal requirement that an acquired external result is not decorative payment evidence.

Required proof:

~~~text
Artifact v1
→ real/recorded useful external result E
→ dependent worker receives E
→ worker actually uses E
→ Artifact v2 materially changes
→ verification accepts v2
→ Objective reaches the minimum completion bar
~~~

Current repair work is on:

- branch: fix/m6-1-causal-pipeline
- observed head while this draft was prepared: 9ca33ea3a79a12686802202218a97bad7a295b9b

This branch is **not counted as accepted submission evidence in this draft**.

Near submission, replace this section with the accepted final result and exact release-candidate SHA.

---

## 4. What changed at the product level

Before OKX, Somebody demonstrated a strong but role-specific procurement job.

During OKX, Somebody is being transformed into a general accountable management layer for the One Person Company:

~~~text
BEFORE
one strong operational worker / procurement job
+ generic reliability primitives

DURING OKX
persistent manager
+ explicit business outcomes
+ governed reusable workforce
+ economic make-vs-buy judgment
+ external machine-service acquisition
+ OKX payment/economic boundary
+ causal result consumption
+ independent objective completion
~~~

The new product thesis is therefore not "procurement with crypto."

It is:

> **One person should be able to operate with the functional reach of a much larger company because Somebody can build internal capability, economically acquire external capability, and remain accountable until the outcome is verified.**

---

## 5. Submission evidence index

Detailed canonical provenance:

- BUILD_DELTA.md

Architecture and current accepted product truth:

- ARCHITECTURE.md
- PRODUCT_SPEC.md
- MASTER_PLAN.md
- DECISIONS_LOG.md

Milestone/review evidence:

- docs/work/M3_FINAL_REPORT.md
- docs/work/M4_COMPLETION_REPORT.md
- docs/work/ACTIVE_TASK.md

Final candidate evidence to add:

- release candidate: FINAL SHA
- canonical E2E: FINAL OBJECTIVE / RUN EVIDENCE
- useful external acquisition: FINAL PROVIDER / SERVICE / PROVENANCE
- OKX AI service/listing/integration URL: FINAL OKX AI URL
- demo video: FINAL VIDEO URL

---

## 6. Finalization rule

Before submission, reconcile this document against the exact frozen release candidate.

Delete stale interim failures and implementation-detail noise where they no longer help the judge, but do **not** erase provenance or convert partial evidence into success.

Only claims supported by committed code, accepted milestone evidence and the final recorded workflow belong in the submitted version.
