# Somebody × OKX — Architecture

Status: **canonical architecture boundaries; implementation details may evolve**  
Date: **17 September 2026**

## 1. Architectural goal

Build the smallest reliable system that proves:

> **Somebody can assemble internal capability when it should MAKE and acquire external capability when it should BUY.**

The architecture should extend the strongest parts of pre-OKX Somebody rather than either discarding them or turning the old procurement demo into a universal workflow engine.

The locked milestone sequence and release freeze live in `MASTER_PLAN.md`.

## 2. Architectural inheritance from Somebody

Source: `dropandresetmain-prog/somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`.

The old Somebody implementation already contained a useful separation between **role-specific work policy** and a more generic **worker reliability/runtime layer**.

Its procurement implementation can be summarized as:

```text
Procurement Agent
      |
      v
Procurement domain / policy
      |
      | contract(m)
      v
CoreWorkerContract
      |
      v
worker reliability/runtime
      |
      v
provider/effect adapters
      |
      v
external evidence + read-back
```

The important inheritance is the architecture, not the old procurement data model.

### 2.1 Generic reliability contract

`lib/reliability/core.ts` is intentionally free of quote/vendor semantics. It provides:

- controlled workflow transitions;
- a `CoreWorkerContract` carrying objective, idempotency scope, authorized effect keys, required verified effects and approval version;
- effect authorization against persisted authority;
- receipt/read-back verification;
- completion gating based on externally verified effects.

This file is directly inherited into `somebody-okx` as the starting reliability core.

### 2.2 Role-specific policy compiles into the generic contract

In old Somebody, `lib/procurement/domain.ts` owned procurement truth and exposed `contract(m): CoreWorkerContract`.

That is the architectural seam to preserve:

> **A role/capability policy owns domain truth and translates the current assignment into a generic work contract.**

Procurement was the first role-specific implementation. It is not the universal product model.

### 2.3 Agent/application authority split

Old Somebody followed:

```text
model proposes
→ application policy decides whether the action is legal
→ external evidence determines whether it worked
```

The model could choose among bounded tools, but application code owned transitions, identity, approval, deterministic policy, idempotency and completion.

This boundary remains canonical for Somebody-OKX.

### 2.4 Reusable runtime patterns

The following pre-OKX patterns are useful architectural inheritance:

- `@openai/agents` Agent/Runner execution;
- explicit model/provider selection rather than an implicit model;
- bounded Zod tool schemas;
- read/act ports rather than direct model access to the database;
- serial/bounded tool execution where appropriate;
- durable run records;
- run leases and stale-run fencing;
- safe provider-error persistence;
- tool-progress requirement before calling an autonomous run successful;
- realtime state and append-only-ish activity/event history;
- evidence/provenance preservation;
- stable effect identity and idempotent retry/reconciliation;
- explicit `attempted → unverified → verified` external-effect semantics;
- persisted human authority for gated actions;
- execution separated from verification;
- completion decided by application proof, not a model claim.

### 2.5 What is NOT architectural inheritance

The following existed in old Somebody but are not automatically part of Somebody-OKX:

- the `acrobatic-swan-765` Convex deployment;
- any old Convex rows or production/demo data;
- `healthProbes` or `HEALTH_PROBE_WRITES_ENABLED`;
- the procurement `Mission` aggregate and its vendor/quote/RFQ semantics;
- procurement workflow states;
- procurement fixtures;
- QuickBooks, Unipile, Gmail, Google Workspace or public-web integrations unless the current OKX flow needs them;
- the old localhost-only write gateway unless a current security need justifies an equivalent boundary;
- the large procurement-shaped `MissionControl.tsx` implementation as the new application architecture.

Old code may remain in the repository temporarily for provenance or reuse, but M1 does **not** require backward compatibility with the previous hackathon runtime.

## 3. Fresh OKX data plane

Somebody-OKX uses a **fresh Convex project/deployment and fresh operational data**.

There is no data migration from `acrobatic-swan-765` and no requirement to preserve old health-probe or procurement tables in the new operational schema.

The new data model should be designed around the current product only. Reuse Convex patterns where useful; do not inherit stale deployment-specific guards merely because they existed.

Secrets remain outside application state and Git.

## 4. Target architecture

```text
Founder objective
      |
      v
   Somebody
      |
      v
Capability planner
      |
      v
validated capability/resource needs
      |
      v
Resource evaluation
   /             \
MAKE              BUY
 |                 |
 |                 |
resolve/create      approved external path
InternalWorker      |
 |                  spend authority
WorkerSpec          |
 |                  x402 / X Layer / provider
WorkContract        |
 |                  ExternalProvider
role/capability     |
policy              result + receipt
 |                  |
bounded worker      verification
runtime             |
 |                  |
evidence/effects ---+
        |
        v
     Somebody
        |
        v
 verified founder-facing outcome
```

Somebody remains accountable. Internal workers and external providers are execution resources, not separate product protagonists.

## 5. Current-project domain language

Do not preserve old internal nouns simply because they existed in procurement.

The current engineering model should use neutral product-relevant concepts such as:

- **Objective** — the founder outcome Somebody owns;
- **CapabilityPlan** — the validated capabilities and resource needs required for that objective;
- **WorkItem** — one bounded unit of work inside an objective;
- **WorkerSpec** — what an internal worker is capable of doing and the maximum tool/resource envelope it may receive;
- **WorkContract** — what one specific assignment authorizes and what proof is required for completion;
- **InternalWorker** — a reusable or newly constructed MAKE worker;
- **ExternalProvider** — a BUY-side provider;
- **Evidence** — observed facts/results with provenance;
- **Effect** — an intended state-changing action with stable identity and lifecycle;
- **Outcome** — Somebody's verified synthesis for the founder;
- **ActivityEvent** — durable user-facing operational history.

These names describe architecture. Product UI may use **That Guy** and **Somebody Else** where useful.

## 6. WorkerSpec vs WorkContract

Do not overload one object with both capability identity and assignment authority.

### WorkerSpec

`WorkerSpec` answers:

> **What can this internal worker do?**

It should contain only bounded, reusable worker properties such as:

- worker identity/key;
- controlled capability keys;
- required resource classes;
- allowed tool permissions;
- bounded responsibility.

The implemented `lib/workforce/` kernel already provides this foundation.

### WorkContract

`WorkContract` answers:

> **What is this worker allowed and required to do for this specific assignment?**

The exact implementation may evolve, but it must be able to express the assignment's:

- objective/responsibility;
- stable idempotency scope;
- allowed effects or actions where applicable;
- persisted approval/authority snapshot where applicable;
- required outputs/evidence;
- required verified effects where applicable;
- completion requirements.

The inherited `CoreWorkerContract` is the starting point for this concept, but it is effect-centric: its current `assertComplete()` requires at least one verified effect. That is correct for the old procurement demo but too narrow for evidence-only internal work.

Adapting that inherited contract so legitimate MAKE work can complete from verified outputs/evidence **without inventing an external effect** is valid OKX-period engineering.

## 7. Role / capability policy

Each bounded role or capability may need domain-specific truth and completion rules.

Examples:

- procurement knows quote completeness, ranking and supplier eligibility;
- a research/analysis worker may know required source classes, claim/evidence structure and confidence/unknown handling;
- a future coding worker may know repository/test evidence requirements.

Do **not** build a generic workflow DSL.

The role/capability policy should be the smallest code that:

1. understands the work-specific state/evidence;
2. exposes only legal commands/actions;
3. translates the current assignment into its `WorkContract`;
4. decides whether domain-specific completion requirements are satisfied.

The generic runtime should not contain procurement, research or other role semantics.

## 8. Objective / capability planner

Input: founder objective plus available company context.

The model may propose:

- controlled capability key;
- bounded responsibility/task;
- required resource classes.

Application code validates:

- capability exists;
- resources are recognized;
- proposal stays inside the controlled capability definition;
- requested tool permissions cannot widen the capability envelope;
- worker spec is valid.

Unknown capability/resource proposals fail closed.

The planner never grants spend authority.

## 9. Company resource inventory

The company resource inventory is a factual runtime input: what the company actually controls now.

Examples may include:

- generic model reasoning;
- public web/search;
- company records;
- authenticated company tools;
- ordinary compute.

Do not infer ownership merely because a resource class exists in the catalog or because a worker already exists.

This factual inventory becomes the input to Make-vs-Buy policy.

## 10. Make-vs-Buy policy

Pure application policy returns at minimum:

- `MAKE` — all required resources are currently controlled by the company;
- `BUY` — at least one required resource is externally controlled and an approved acquisition path exists;
- `BLOCKED` — an external resource is required but no approved acquisition path exists.

Models may propose needs. Application code decides sourcing.

A missing pre-existing worker is not a reason to BUY.

## 11. Internal workforce path

For MAKE:

1. validate capability/resource requirements;
2. reuse a compatible worker where useful or construct a minimal `WorkerSpec`;
3. create a bounded `WorkContract` for this assignment;
4. select an execution model deliberately;
5. materialize only tools permitted by the WorkerSpec and WorkContract;
6. instantiate a real bounded agent through the inherited Agent/Runner pattern;
7. execute through application-owned read/act boundaries;
8. persist evidence, outputs, relevant effects and activity;
9. evaluate completion using application/domain policy;
10. expose failure rather than fabricating success.

The canonical demo requires **active internal agent spawning**. A WorkerSpec alone is not enough.

Persistent cross-objective workforce is not required for the hackathon.

## 12. Evidence and completion

Somebody should preserve the old reliability principle that truth is not whatever the model last said.

Evidence should retain enough provenance to answer:

- what was observed;
- from which source/resource;
- when it was observed;
- which worker/run produced or normalized it;
- whether newer evidence supersedes or conflicts with it where relevant.

For internal evidence-only work, completion may be based on required outputs/evidence plus role policy.

For state-changing external effects, completion remains stricter:

```text
intent
→ authorized
→ attempted/submitted
→ provider receipt
→ independent read-back/reconciliation
→ verified
```

Submission/API success is never automatically completion.

## 13. BUY / payment path

For BUY:

1. identify the missing externally controlled resource;
2. identify an approved provider path;
3. establish expected provider, price, network, recipient and terms;
4. apply spend policy and persisted human authority where required;
5. invoke the provider through the relevant OKX AI / Onchain OS flow;
6. persist explicit payment/effect state;
7. reconcile ambiguous submission before any retry;
8. receive the external result;
9. verify settlement and result;
10. return verified evidence/result to Somebody.

Provider-specific behavior stays behind the smallest practical adapter seam.

Preserve explicit lifecycle states such as:

`prepared → awaiting_approval → approved → payment_attempted → submitted → settled → result_received → verified`

plus failed/reconciliation-required states.

Requirements:

- no silent mainnet payment;
- no duplicate payment on retry;
- no blind repay after an ambiguous state;
- quote/payment terms checked against approved terms;
- wallet credentials/private keys never logged or persisted in ordinary application state;
- testnet and mainnet behavior visibly distinct.

## 14. OKX / X Layer test environment

X Layer Testnet (`eip155:1952`) plus the official Mock Merchant is the preferred first payment-development rail.

Prove:

`request → 402 → inspect terms → authorize/sign → pay → retry → resource/receipt`

before any mainnet provider consideration.

Third-party OKX.AI providers are not automatically mirrored on testnet. Provider environment/network support must be verified individually.

## 15. Product surface architecture

Reuse the useful visual direction of old Mission Control, not its procurement-shaped information architecture.

Useful inherited ideas include:

- Somebody wordmark/mascot;
- calm operator workspace;
- clear current-state/status treatment;
- activity/event history;
- evidence presentation;
- approval/authority treatment;
- working/waiting/verified visual states.

The current surface should progressively show:

- founder objective;
- capability decomposition;
- MAKE/BUY reasons;
- internal worker creation/reuse/status/result;
- evidence and meaningful activity;
- external provider, missing resource and price;
- spend/payment/verification state;
- Somebody's unified outcome.

Avoid giant graphs, permanent org charts, raw agent-chat logs, token counters and Web3-first wallet UX.

Do not expand the large inherited procurement `MissionControl.tsx` into the new universal surface. Extract/copy small useful primitives or build the new surface cleanly.

## 16. M1 architectural target

M1 remains **one milestone**: active MAKE plus the first real current-product surface.

M1 should prove the inherited runtime architecture can support a newly assembled internal worker, not merely reproduce a chat completion.

The proof must include:

- fresh OKX Convex deployment/data plane;
- founder objective;
- model-proposed but application-validated capability/resource plan;
- factual company resource inventory;
- worker reuse/create through `lib/workforce/`;
- deliberate model selection;
- real bounded Agent/Runner instantiation;
- permission-derived tools only;
- nontrivial tool-mediated work;
- persisted evidence/result/activity;
- application-owned completion decision;
- real UI state rendered from persisted current-product data.

A worker that only returns one free-form model response does **not** satisfy M1. The acceptance proof should require multiple meaningful tool-mediated observations/actions appropriate to the selected M1 internal role, ideally across at least two distinct information sources or resource classes.

M1 does not require BUY yet.

## 17. Verification strategy

Verification is risk-based and follows the repository test hierarchy.

Current evidence:

1. inherited Somebody baseline transferred and verified: 78/78 inherited tests, clean root + Convex typechecks;
2. OKX workforce kernel: 11 focused tests, 89/89 cumulative at its checkpoint, root typecheck clean.

Important: inherited baseline tests prove what the old system did; they are **not** a requirement that every old demo path remain operational after the new fresh OKX data plane is introduced.

M1 should run:

1. focused changed-behavior tests for planning, resource validation, worker construction, WorkContract/completion and bounded execution;
2. direct affected seams such as Convex persistence/read model and Agent/Runner integration;
3. one bounded live-development proof against the fresh OKX deployment when local tests pass;
4. only broader regression/build/typecheck checks justified by the actual changed seams or required at the milestone checkpoint.

Do not repeatedly blast the full inherited suite merely for reassurance.

## 18. Canonical-demo independence

The baseline architecture must not hard-code the current invoice/Dial research candidate.

Do not build a generic marketplace framework either. Support one canonical provider cleanly after the demo-selection gate.

The canonical scenario should be locked by **18 September 2026, 12:00 SGT**, after which broad scenario ideation stops unless a material provider/technical failure forces a reopen.
