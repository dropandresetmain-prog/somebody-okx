# Build Delta — Somebody × OKX Dev Day 2026

Status: **canonical hackathon provenance and evidence ledger**  
Created: **17 September 2026**  
Reconciled: **17 September 2026**

## Purpose

This file separates:

1. what **worked before** OKX Dev Day;
2. what existed only as **pre-existing R&D**;
3. what is **rebuilt/adapted during OKX**;
4. what is **new during OKX**;
5. what remains **planned / not yet built**.

The official build period is **17–25 September 2026**.

A transferred inherited capability does not become hackathon work merely because it was copied into this repository during the build period.

## Provenance vocabulary

- **Inherited** — working pre-OKX capability.
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody; not a working Somebody capability.
- **Rebuilt / Adapted during OKX** — a prior idea or inherited primitive changed/reimplemented during 17–25 September for the current product.
- **New during OKX** — capability neither prior project had in working product form.

`Transferred` describes repository movement only; it is not a provenance classification.

## 1. Before OKX — Somebody baseline

**Classification: Inherited.**

Source:

- repository: `dropandresetmain-prog/somebody-ai`
- accepted SHA: `709a169a1a4f71b8dc2d7427438ff514999fb07e`
- commit date: 13 September 2026

The baseline was transferred into `somebody-okx` during the build period. That transfer added no new product capability.

### 1.1 Transfer/verification evidence

- baseline transfer commit: `a47cc93`;
- verification checkpoint: `093d247`;
- inherited automated suite: **78/78 pass**;
- root TypeScript typecheck: **clean**;
- Convex TypeScript typecheck: **clean**.

### 1.2 Inherited product/runtime foundation

#### Product and UI

Working pre-OKX assets included:

- Next.js / React / Convex app shell;
- Somebody brand/mascot/icons;
- Mission Control operator UI;
- Operator drawer and presentation/view-model helpers;
- voice input;
- substantial existing CSS/design language.

**Reuse judgment:** preserve brand and useful visual primitives/direction. The large procurement-shaped `MissionControl.tsx` is extract/copy-small-pieces, not extend-into-a-universal-screen.

#### Generic worker/reliability architecture

Direct re-read of `somebody-ai@709a169` established that the previous product had a real architectural split:

```text
role-specific procurement policy
      |
      | contract(m)
      v
CoreWorkerContract / reliability core
      |
      v
bounded Agent/Runner runtime
      |
      v
evidence + effects + provider adapters
      |
      v
external verification
```

Inherited reusable architecture includes:

- `lib/reliability/core.ts` with `CoreWorkerContract`, `transition`, `authorizeEffect`, `verifyReceipt`, `assertComplete`;
- model-proposes / application-authorizes boundary;
- role-specific state compiling into a generic reliability contract;
- bounded read/act agent port;
- `@openai/agents` Agent/Runner execution pattern;
- explicit model/provider configuration;
- durable run state;
- lease expiry and stale-run fencing;
- tool-progress requirement before treating an autonomous run as successful;
- safe provider-error persistence;
- realtime Convex view/event patterns;
- evidence/provenance history;
- stable effect identity and idempotent retry/reconciliation;
- persisted human authority for gated effects;
- `pending/attempted/unverified/verified`-style effect lifecycle;
- execution separated from verification;
- application-owned completion.

**Important limitation:** inherited `assertComplete()` requires at least one required verified effect. That was appropriate for procurement but is too narrow for legitimate evidence-only internal MAKE work.

Adapting this architecture into a broader assignment-specific `WorkContract` is **Rebuilt / Adapted during OKX** once implemented.

#### Procurement role implementation

Working pre-OKX procurement code included:

- `lib/procurement/types.ts`;
- `lib/procurement/domain.ts`;
- `lib/procurement/commands.ts`;
- `lib/procurement/fixtures.ts`;
- `lib/agent/procurement.ts`;
- procurement persistence/gateway/effect adapter code.

It handled vendors, quotes, requirements, evidence supersession/conflict, deterministic ranking, approvals, RFQs, confirmations/rejections and Purchase Order intent.

**Reuse judgment:** procurement is an inherited role-specific implementation/reference, **not** the current product aggregate or universal workflow engine.

#### External integrations

Working pre-OKX provider paths included:

- Google Calendar;
- Google Drive;
- Gmail;
- Google Sheets;
- public web sourcing;
- Unipile WhatsApp/Instagram;
- QuickBooks Online Sandbox.

**Reuse judgment:** these are available inherited assets, not mandatory dependencies. Reuse only when a current M1/canonical-demo flow needs them.

### 1.3 Inherited environment/runtime baggage that is NOT selected for reuse

The old repository also contained deployment-specific machinery:

- `acrobatic-swan-765` Convex deployment assumptions;
- old Convex data/rows;
- `healthProbes`;
- `HEALTH_PROBE_WRITES_ENABLED`;
- old procurement fixtures/demo state;
- old provider bindings;
- localhost/development guards shaped around the previous hackathon environment.

These existed pre-OKX, but **existence does not equal target architecture**.

Current decision: Somebody-OKX will use a fresh Convex project/data plane. There is no migration requirement from `acrobatic-swan-765` and no M1 requirement to preserve the old procurement demo.

## 2. Before OKX — Army of Interns R&D

**Classification: Pre-existing R&D.**

Source:

- repository: `dropandresetmain-prog/army-of-interns`
- accepted SHA: `677166db591465fb6d201fb12db7cfe038557a92`
- commit date: 13 September 2026

Army was a separate prototype/R&D project and never shipped inside Somebody.

Useful prior ideas:

- controlled capability vocabulary;
- model-proposed capability keys validated against application-owned vocabulary;
- deny-by-default capability → tool mapping;
- permission-envelope enforcement;
- worker creation;
- worker reuse/matching.

Rejected prior baggage:

- scenario keyword capability analysis;
- duplicated permission sources;
- ranks/promotions;
- personalities;
- org hierarchy;
- Telegram/Twilio coupling;
- Army-specific persistence/runtime;
- demo state machines;
- contractor/demo structures.

## 3. Built / adapted during OKX Dev Day

Only repository-evidenced work belongs here.

### 3.1 Repository/SSOT and source audit

**Classification: New during OKX (project/documentation work, not product capability).**

Completed during 17 September:

- final authoritative repository established;
- product thesis/scope locked;
- architecture/reuse decisions recorded;
- source provenance documented;
- model-selection engineering guidance imported;
- X Layer/Onchain OS sandbox-first development strategy documented;
- long-horizon active task ledger established.

### 3.2 Somebody baseline transfer + verification

**Classification: Inherited capability, transferred during OKX.**

Evidence:

- transfer commit: `a47cc93`;
- baseline verification at `093d247`;
- **78/78 inherited tests pass**;
- root typecheck clean;
- Convex typecheck clean.

This proves the inherited foundation arrived intact. It does **not** classify the inherited capability as hackathon work.

### 3.3 Minimal workforce kernel

**Classification: Rebuilt / Adapted during OKX from Army R&D.**

Commit:

- `dfae75af9326a8e719033948ede8b2b481b423bd`

Files:

- `lib/workforce/types.ts`;
- `lib/workforce/catalog.ts`;
- `lib/workforce/permissions.ts`;
- `lib/workforce/workers.ts`;
- `lib/workforce/index.ts`;
- `tests/workforce.test.ts`.

Built behavior:

- controlled scenario-independent capability vocabulary;
- resource-class requirements;
- fail-closed validation;
- deny-by-default capability → tool permissions;
- permission-envelope enforcement;
- minimal `WorkerSpec`;
- reuse-or-create worker resolution;
- no external spend authority granted to MAKE workers.

Explicitly rejected from Army:

- keyword capability analysis;
- ranks/personality/org hierarchy;
- broad assignment/workforce runtime;
- Army persistence/schema;
- Telegram/Twilio/demo coupling.

Verification at the workforce checkpoint:

- focused workforce tests: **11/11 pass**;
- cumulative suite at that checkpoint: **89/89 pass**;
- root typecheck: **clean**;
- Convex typecheck: not run because no Convex-facing file was touched.

### 3.4 Architecture/reuse reconciliation

**Classification: New during OKX documentation/decision work; no new product capability claimed.**

Reason:

A direct follow-up inspection of `somebody-ai@709a169` established that the earlier reuse docs understated the architectural value of the old worker/reliability split and over-weighted continuity with the old procurement deployment.

Doc-pass commits on `docs/reconcile-somebody-runtime` include:

- `4ee6f17` — architecture reconciled with inherited runtime;
- `a850231` — Master Plan aligned;
- `8f23cfc` — Product Spec aligned;
- `29ad04d` — fresh data plane and runtime decisions recorded;
- `42b8fde` — reuse audit reconciled against direct source read;
- `8582791` — README cleaned as contributor/agent entry point.

This pass records, but does not yet implement:

- fresh OKX Convex project/data plane;
- current Objective/WorkItem model;
- `WorkerSpec` vs assignment-specific `WorkContract` split;
- evidence-only MAKE completion adaptation;
- current-product surface replacing old Company-Mission framing.

## 4. Planned / Not Yet Built

Everything in this section is **not implemented** until repository evidence moves it into Section 3.

| Planned item | Status | Provenance expectation / notes |
|---|---|---|
| Fresh Somebody-OKX Convex project/data plane | **Not built** | **New during OKX.** No migration from `acrobatic-swan-765`. |
| Current `Objective` / `WorkItem` runtime + realtime read model | **Not built** | **New during OKX.** Reuses Convex patterns, not procurement aggregate. |
| `WorkContract` adaptation from `CoreWorkerContract` | **Not built** | **Rebuilt / Adapted during OKX.** Must support assignment authority/completion beyond external effects. |
| Objective → capability/resource planner | **Not built** | **New during OKX** as working Somebody capability. Model proposes; application validates. |
| Factual company resource inventory | **Not built** | **New during OKX.** Catalog vocabulary is not factual inventory. |
| Active internal worker execution | **Not built** | **New/Rebuilt combination.** Workforce kernel exists; real Agent/Runner spawn path does not. |
| Role/capability policy for M1 proof | **Not built** | **New during OKX** unless directly adapted from an inherited role helper. Must be nontrivial, tool-mediated. |
| Persisted MAKE evidence/result/activity | **Not built** | Inherits evidence/event principles; current implementation is new/adapted. |
| Current Objective product surface | **Not built** | Reuses visual language; new current-product information architecture. |
| Deterministic Make-vs-Buy policy | **Not built** | **New during OKX.** `MAKE` / `BUY` / `BLOCKED`. |
| OKX AI provider integration | **Not built** | **New during OKX.** Provider not yet selected. |
| x402 buyer flow | **Not built** | **New during OKX.** No 402/pay/retry code yet. |
| X Layer payment/settlement path | **Not built** | **New during OKX.** Testnet first. |
| Spend authorization/reconciliation | **Not built** | Adapts inherited approval/idempotency/verification principles to financial execution. |
| Selected real external-provider adapter | **Not built** | **New during OKX** unless it reuses a narrowly relevant inherited client. |
| External result verification | **Not built** | Adapts inherited verify-before-complete principles. |
| Final objective synthesis | **Not built** | **New during OKX** as combined MAKE+BUY product behavior. |
| Canonical demo | **Not selected/built** | Demo selection gate: 18 Sep 2026, 12:00 SGT. |

## 5. Current truthful state

As of the 17 September architecture reconciliation:

**Working and inherited:**

- Somebody app/runtime foundation;
- reliability core and worker-runtime patterns;
- old procurement role implementation;
- old provider integrations;
- old UI/brand assets.

**Working and built/adapted during OKX:**

- minimal scenario-independent workforce kernel.

**Documented but not yet implemented:**

- fresh OKX data plane;
- Objective/WorkItem operational spine;
- WorkContract evolution;
- objective/capability planner;
- factual resource inventory;
- active dynamic internal worker spawning;
- nontrivial M1 MAKE proof;
- Make-vs-Buy policy;
- OKX/x402/X Layer buyer rail;
- selected external provider;
- final MAKE+BUY E2E.

No OKX payment, wallet or marketplace capability should be claimed before code and observed evidence exist.

## 6. Maintenance rules

When planned work becomes real:

1. record exact commit/SHA;
2. list affected files/subsystem;
3. classify provenance honestly;
4. record the focused checks actually run and their observed results;
5. distinguish mock, testnet, sandbox and mainnet;
6. do not equate submitted/sent with settled/verified;
7. never rewrite an inherited capability into hackathon work merely because it was modified or moved.

Related canonical documents:

- [`README.md`](README.md) — contributor/agent entry point and current status;
- [`MASTER_PLAN.md`](MASTER_PLAN.md) — locked execution plan;
- [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) — product/hackathon scope;
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — current architecture and inheritance boundary;
- [`DECISIONS_LOG.md`](DECISIONS_LOG.md) — settled/superseded decisions;
- [`REUSE_AUDIT.md`](REUSE_AUDIT.md) — detailed source-project reuse classification;
- [`docs/work/ACTIVE_TASK.md`](docs/work/ACTIVE_TASK.md) — current checkpoint and next action.
