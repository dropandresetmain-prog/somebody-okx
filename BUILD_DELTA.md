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

### 3.5 R1 foundation-review remediation (blockers A–F)

**Classification: Rebuilt / Adapted during OKX.** All of it modifies M1 code built
earlier in this same milestone; none of it is inherited capability, and none of it
is claimed as a new product capability beyond what M1 already claimed.

Branch `fix/r1-m1-acceptance`, created from candidate tip `e06eb6f` and merged with
authoritative `main` (`1894649`). Integrated in lane order A → B → C → Convex spine
→ D, one cherry-pick per lane plus the primary's own seams, pushed after each lane.

| SHA | Lane | What it closes |
|---|---|---|
| `6a73133` | primary | `docs/work/R1_SHARED_CONTRACT.md` — binding cross-lane seam so four agents could not diverge on shapes |
| `3b93bf2` | primary | Blocker E — `lib/objective/runGuards.ts` (pure lease fencing: `EXECUTION_TIMEOUT_MS 270s < LEASE_MS 300s`, `fenceRunWrite`, `isRunActive`, `decideFinalization`) + `tests/runLifecycle.test.ts` (11) |
| `d93a203` | A | Blockers A + B — `EvidenceOrigin`, `SourceProof`, `normalizePublicUrl`/`sourceIdentity`, `evaluateCompletion` counts **distinct application-observed source identities** per class; `RESEARCH_ROLE` requires 1 company record + 2 distinct public sources |
| `64c7e2c` | B | Blocker D (pure half) — `assertRoleRequirementsSatisfied` + `planObjectiveWithModel` injected-model seam; additive, `tests/planner.test.ts` (15) |
| `d162eb6` | C | Blocker C — read tools return the bounded observed content wrapped as unmistakable untrusted data (1200-char cap, ≤6 recent findings), `record_finding` demoted to an explicit NOTE, `tests/worker.test.ts` (13) |
| `0e2883b` | primary | A/B/D/E on the application side — `convex/objectiveRunner.ts` (`"use node"`: `proposePlan` bounded structured planning call, `executeWorker` under an abort budget inside the lease, port that resolves and persists observations), run-scoped evidence, re-derived `sourceIdentity`, server-side `planObjectiveFromModel`, idempotent `finishRun`, `completion:{accepted,unmet}` read model, all seven `as never` codegen casts removed by real types |
| `45d4286` | primary | A's type-level half at the worker seam — `ModelNoteInput = Omit<FindingInput,"origin"\|"sourceId">` so the runtime physically cannot hand over proof fields; dead origin-minting helpers deleted; test twin aligned to the merged contract |
| `282f2a6`/`5e0f542` | D | Blocker F + cleanup — `app/resultStatus.ts` `resolveResultDisplay` wired into `ResultSection`; hard-coded client proposal literal deleted in favour of the server planning action; nine dead `package.json` scripts pointing at the removed `scripts/` directory deleted |

Honest limits of this work, as they stood before §3.6:

- **No live deployment proof.** Every claim above was static: types, unit tests and a
  production build. The blocker fixes change behaviour that only a fresh Convex
  deployment plus a real model call can confirm.
- **`convex/_generated/` was still a hand-maintained stand-in**, extended only to list
  the new `objectiveRunner` module.

Both limits are closed in §3.6 below.

### 3.6 Live M1 acceptance on `clean-tapir-151` (positive + deterministic negative proof)

**Classification: Rebuilt / Adapted during OKX** (proof of behaviour already implemented
in §3.5; no new product capability). Branch `fix/r1-m1-acceptance`, checkpoint SHAs
`ae490db` (planner provider compatibility) through the final documentation commit on
this branch.

**Deployment identity (no secrets):**

- Convex project: `dropandreset-main/somebody-okx`;
- dev deployment: `clean-tapir-151` (`https://clean-tapir-151.convex.cloud`);
- `acrobatic-swan-765` was not used;
- `convex/_generated/` is real `npx convex dev` codegen against this deployment —
  the hand-maintained stand-in caveat is retired;
- deployment env: `LIVE_AI_ENABLED=true`, `AI_PROVIDER=openrouter`,
  `AI_MODEL=openai/gpt-5.6-terra`, `OPENROUTER_API_KEY` set (value not recorded here).

**Positive live proof (real model, real public fetches, application-accepted):**

- objective: `obj_1789659986103_l9gomb` — "Evaluate whether Cloudflare is a suitable
  partnership and business target using our internal criteria and current public
  information.";
- sourcing: `MAKE` (company controls every required resource class);
- worker: `worker_company_records_lookup-public_information_research` (Research
  analyst, created);
- run: `run_1789660001886_c92t0u`, model `openai/gpt-5.6-terra` via OpenRouter;
- evidence (3 application observations, all `origin: application_observation`):
  `record:partnerships/evaluation-criteria`,
  `url:https://www.cloudflare.com/plans/free/`,
  `url:https://www.cloudflare.com/partners/`;
- structured result persisted; `finishRun` → `completion.accepted = true`, `unmet = []`;
  run status `stopped`, objective state `completed`;
- event order observed: objective received → MAKE plan → run started → company-record
  observation → two distinct public-web observations → structured result → application
  acceptance.

**Deterministic negative proof (application-owned completion refuses duplicate identity):**

- objective: `obj_1789661449740_36j0y3` — "Evaluate whether Stripe is a suitable
  partnership and business target using our internal criteria and current public
  information."; planned server-side to `MAKE` the same way as the positive run;
- run: `run_1789661601739_4xravw`, started via the real `startRun`/`startRunPublic`
  path (so the live scheduled worker was concurrently active on the same run — see
  method note below);
- method: exact current function signatures were pulled live from the deployment with
  `npx convex function-spec` (not guessed), then the internal mutations
  `objectives:recordFinding` (×3), `objectives:submitResult` and `objectives:finishRun`
  were invoked directly against `clean-tapir-151` — one application-observed company
  record (`record:partnerships/evaluation-criteria`), and the same public source
  identity (`url:https://stripe.com/partners`) recorded twice, plus a complete
  structured result. Direct-invocation instead of Dashboard point-and-click was used
  deliberately: `startRun` schedules the live worker in the same tick, so winning the
  race to finalize before the live worker could independently reach two distinct real
  public sources required fast, scripted calls (~11s end to end) rather than manual
  UI clicks. No public mutation was added and no authority boundary was changed —
  every call used the existing internal-mutation surface, invoked with real deployment
  credentials, the same privileged path the Dashboard Functions panel itself uses;
- observed refusal: `finishRun` returned `{ completed: false, unmet:
  ["public_web: found 1 distinct source(s), required 2"] }`; `getObjective.completion
  = { accepted: false, unmet: [...] }`; run status `stopped`, objective state `failed`;
- race outcome, checked directly: the concurrently-scheduled live worker did land one
  real `company_record` observation (same `recordRef`, so no new distinct identity)
  and one real `public_web` fetch — of the identical URL (`https://stripe.com/partners`)
  already used for the manual duplicate, so it added no new distinct identity either.
  The objective was re-queried ~8s after `finishRun` returned and evidence/event counts
  were unchanged, confirming the refusal is durable and the run is terminal (fenced
  against further writes by `assertActiveRun`/`fenceRunWrite`).

**UI proof:**

- the app has no existing way to reopen a specific persisted objective by key (the
  workspace only tracks `activeKey` in local React state, set on submit). A minimal,
  read-only `?objective=<key>` deep link was added to `app/ObjectiveWorkspace.tsx`
  (a `useEffect` reading `window.location.search` once on mount) so a specific durable
  record can be reopened for verification. This adds no mutation, no new authority and
  no server-side surface — it only seeds which existing objective the page queries;
- with the local app running against `clean-tapir-151` via the existing `.env.local`,
  `?objective=obj_1789659986103_l9gomb` renders: YOU ASKED (the Cloudflare objective),
  SOMEBODY'S PLAN → MAKE with the "company controls every required resource class"
  rationale, THAT GUY → Research analyst, completed, "Application accepted completion",
  EVIDENCE → all 3 rows, RESULT → **Accepted**;
- `?objective=obj_1789661449740_36j0y3` renders the same structure with THAT GUY →
  failed, RESULT → **Not accepted**, "The application has not accepted this result.",
  UNMET REQUIREMENTS → `public_web: found 1 distinct source(s), required 2`. The UI
  never claims Accepted for this run;
- `run.toolCalls` finding: the field is written once as `0` at `startRun` and never
  incremented anywhere in `convex/objectives.ts` or `convex/objectiveRunner.ts`, so it
  reads `0` even on runs with real tool-mediated evidence. The only UI reference
  (`app/ObjectiveWorkspace.tsx`, `{run.toolCalls > 0 && ...}`) is guarded on `> 0`, so
  it silently never renders rather than asserting a false "0 tool calls" claim — it
  does not contradict the accepted/not-accepted state or the evidence list, which are
  both driven by durable application data. Classified non-blocking (Park for Later):
  the counter is dead instrumentation, not a truthfulness defect in a material UI
  surface. Not fixed in this pass to avoid touching runtime code beyond what M1
  acceptance requires.

**Checks run at this checkpoint:**

- focused suite `npx tsx --test tests/objective.test.ts tests/planner.test.ts
  tests/runLifecycle.test.ts tests/worker.test.ts tests/workforce.test.ts
  tests/ui.test.ts`: **77/77 pass** (unchanged from §3.5; re-run after the UI deep-link
  edit);
- `npx tsc --noEmit`: clean; `npx tsc -p convex/tsconfig.json --noEmit`: clean;
- `npx convex function-spec` against `clean-tapir-151`: live signatures matched the
  repository source exactly (no stale-argument guessing);
- live `npx convex dev --once`-equivalent state: deployment already current (functions
  pushed at earlier checkpoints); no redeploy was needed for this pass.

### 3.7 M2 — canonical MAKE path + deterministic Make-vs-Buy policy

**Branch:** `feat/m2-make-buy-policy` (from accepted M1 `1e2c1a484713792cead51b85e1e1ae36d28b3e77`,
promoted to `main`).

**Prepared material consumed:** `prep/m2-sourcing-policy` @ `3de805ec564bf85bfd4ac398eab2c207f526aee1`
— `lib/sourcing/{types,policy,index}.ts` + `tests/sourcing.test.ts`. Cherry-picked, not rewritten.
Provenance: **New during OKX** (current OKX implementation work); the concept was not inherited.

**Checkpoints:**

- kernel cherry-pick: `82dbfa29dde40c59357cc88b4480f3c6a1abc7f1`;
- Checkpoint 1 (single sourcing authority integrated): `530ff67c20cec48c18e81fd5a5fe71eb4eb7d5b5`;
- sourcing invariant hardening: `71eed968c55d56487b183d8bb8694ac615dc556d`;
- Checkpoint 2 (persisted + UI sourcing truth): `266b3db8e24c6435a62647c708627908c4a0e7bc`.

**Architecture — exactly one sourcing authority:**

```
model proposes capability/resource needs
  → lib/objective/planner.ts validates controlled identities (fail-closed)
  → factual company inventory (CURRENT_RESOURCE_INVENTORY)
  → lib/sourcing/policy.ts :: evaluateSourcingPolicy()   ← the only MAKE/BUY/BLOCKED rule
  → lib/objective/sourcing.ts :: decideObjectiveSourcing()  ← thin adapter, contains no rule
  → Objective layer persists + presents the decision
```

The competing M1 rule (`evaluateSourcing()` in `planner.ts`, MAKE/BLOCKED only) was **deleted**
rather than left beside the canonical policy. `SourcingDecision` is now declared once in
`lib/sourcing/types.ts` and re-exported by the Objective layer, so no second vocabulary can drift.

**Rule implemented:** all required resources factually controlled → MAKE; one or more missing and
*every* missing resource has an approved provider path → BUY; one or more missing and at least one
lacks an approved path → BLOCKED. Missing worker never implies BUY. The model cannot choose the
decision and cannot approve a provider path.

**Adaptations made to the prepared kernel (not cosmetic):**

1. **Path-alias drift, found by verification, not by the cherry-pick.** The kernel imported
   `@/lib/workforce/types`; `convex/tsconfig.json` defines no `paths` mapping, so that alias does
   not resolve inside the Convex compilation unit. Proven with a throwaway probe importing the
   kernel from `convex/` (`TS2307` twice), then fixed with relative type-only imports matching M1
   convention. The cherry-pick applied cleanly and still carried a real defect — a clean apply is
   not semantic proof.
2. **Identity allow-list made exhaustively compile-checked.** `KNOWN_RESOURCE_CLASSES` was a
   hand-maintained array whose drift risk was only documented in a comment. It is now derived from
   a `Record<ResourceClass, true>`, so adding a `ResourceClass` without declaring it is a
   *compilation error* instead of a silent fail-closed rejection of a valid class. The array is
   exported and pinned to the catalog vocabulary by a runtime sync test as well.
   Identity validation and ownership stay distinct: the kernel never consults catalog
   `ownership` metadata, and tests assert that a catalog-"owned" class is still missing when the
   factual inventory omits it.
3. **Application-owned provider registry.** `APPROVED_PROVIDER_PATHS` lives in
   `lib/objective/sourcing.ts`, not in the model path. It is **empty by design** — see the gate
   below.

**M2 acceptance is BLOCKED on the canonical scenario gate — not on code.**

`DECISIONS_LOG.md` records the canonical demo as **OPEN until 18 September 2026, 12:00 SGT**, and
explicitly rejects "treating the Opus invoice/Dial demo as already canonical". No canonical
provider is recorded anywhere in the repo, and `ApprovedProviderPath` had never existed as an
identifier before this work.

Rather than invent a fake canonical provider to mark M2 complete, the registry ships empty. The
consequence is deliberate and test-enforced (`the shipped provider registry is empty, so the
current product cannot fabricate a BUY`): with no approved paths, a missing resource yields
**BLOCKED**, and only full factual control yields **MAKE**. BUY is fully implemented and proven at
the policy and seam level with injected fixtures, and will be exposed for real once the scenario
lane names an actual approved provider.

Acceptance items 1–10 and 13–17 are met. Items 11–12 (canonical scenario runs its real MAKE path;
scenario exposes a genuine BUY with a named missing resource) require the selected scenario and are
the only outstanding criteria.

**M2 scope boundary held:** no signing, no wallet, no payment, no x402, no provider call, no
receipt, no payment-lifecycle state. `ApprovedProviderPath` means only "the application knows an
approved route exists". That is M3/M4 work.

**Checks run (observed, not reported):**

- `npx tsx --test tests/sourcing.test.ts`: **19/19 pass** (16 prepared + 3 added invariants);
- `npx tsx --test tests/sourcingSeam.test.ts`: **14/14 pass** (new Level-2 seam file);
- `npx tsx --test tests/ui.test.ts`: **13/13 pass** (5 pre-existing + 8 sourcing display);
- affected M1 regression `npx tsx --test tests/sourcing.test.ts tests/sourcingSeam.test.ts tests/objective.test.ts tests/planner.test.ts tests/workforce.test.ts`: **81/81 pass**;
- full suite `npx tsx --test tests/*.test.ts`: **118/118 pass**;
- `npx tsc --noEmit`: clean; `npx tsc -p convex/tsconfig.json --noEmit`: clean;
- validator coupling proven, not assumed: adding a field to the persisted `sourcingReason`
  validator was observed to break the root typecheck, confirming the Convex shape and
  `lib/objective/types.ts` are compiler-checked against each other. No hand-edited generated
  files; `convex/_generated/dataModel.d.ts` derives types from `typeof schema`, so this schema-free
  validator change needs no codegen regeneration.

`worker.test.ts` lost only an unused `evaluateSourcing` import; the worker/run-lifecycle seams
themselves were not changed, and both files still pass.

## 4. Planned / Not Yet Built

Everything in this section is **not implemented** until repository evidence moves it into Section 3.

| Planned item | Status | Provenance expectation / notes |
|---|---|---|
| Fresh Somebody-OKX Convex project/data plane | **Built and live (M1, §3.6)**: `clean-tapir-151`, real `npx convex dev` codegen, positive and negative live proof observed. | **New during OKX.** No migration from `acrobatic-swan-765`. |
| Current `Objective` / `WorkItem` runtime + realtime read model | **Built (M1)** — `convex/objectives.ts`, `convex/objectiveValidators.ts`, `convex/objectiveArgs.ts`; public read model `getObjective`/`listObjectives`. | **New during OKX.** Reuses Convex patterns (lease/expiry fencing from inherited `convex/missions.ts`), not the procurement aggregate. |
| `WorkContract` adaptation from `CoreWorkerContract` | **Built (M1)** — `lib/objective/contract.ts` (`createWorkContract`, `evaluateCompletion`). Inherited `lib/reliability/core.ts` untouched; evidence-only completion supported; `requiredVerifiedEffectKeys` kept for the future BUY path. | **Rebuilt / Adapted during OKX.** |
| Objective → capability/resource planner | **Built (M1)** — `lib/objective/planner.ts`: fail-closed `validatePlannerProposal` + permission envelope derivation. | **New during OKX.** Model proposes; application validates. |
| Factual company resource inventory | **Built (M1), consumed by M2** — `lib/objective/policy.ts` `CURRENT_RESOURCE_INVENTORY` / `currentResourceInventory()`; consumed by the canonical sourcing policy through the `decideObjectiveSourcing` seam in `lib/objective/sourcing.ts`. | **New during OKX.** Catalog vocabulary is not factual inventory. |
| Active internal worker execution | **Built (M1)** — `lib/worker/runtime.ts` (real Agent/Runner, envelope-only tool materialization, application-owned finalization), `lib/worker/port.ts`, `lib/worker/modelSelection.ts`; executed through `convex/objectives.ts` port. | **New/Rebuilt combination.** Agent/Runner pattern adapted from inherited `lib/agent/procurement.ts`; workforce kernel inherited. |
| Role/capability policy for M1 proof | **Built (M1)** — `lib/objective/policy.ts` `RESEARCH_ROLE` (research analyst: ≥3 observations across company_record + public_web, structured result) + internal `COMPANY_RECORDS`. | **New during OKX.** |
| Persisted MAKE evidence/result/activity | **Built (M1)** — `evidence` / `objectiveEvents` tables with provenance (sourceClass, url/recordRef, observedAt, recordedBy, runId); result stored on the objective record. | Inherits evidence/event principles; current implementation is new/adapted. |
| Current Objective product surface | **Built (M1)** — `app/ObjectiveWorkspace.tsx` as the app entry point (`app/page.tsx`); YOU ASKED / SOMEBODY'S PLAN / WHY MAKE? / THAT GUY / EVIDENCE / RESULT. Reuses Wordmark/LivePill/pill/timeline patterns and `./somebody` components. | Reuses visual language; new current-product information architecture. |
| Deterministic Make-vs-Buy policy | **Built (M2)** — `lib/sourcing/` is the single canonical authority (`evaluateSourcingPolicy`): all required resources factually controlled → MAKE; missing + every missing resource has an approved provider path → BUY; missing + any lacking an approved path → BLOCKED. Adapted into the Objective layer by the rule-free seam `decideObjectiveSourcing` (`lib/objective/sourcing.ts`). The M1 MAKE/BLOCKED rule in `planner.ts` was deleted rather than left beside it. `ApprovedProviderPath` means an approved acquisition route only — no payment, wallet, provider call or receipt (M3/M4). | **New during OKX.** Kernel prepared on `prep/m2-sourcing-policy` (`3de805ec564bf85bfd4ac398eab2c207f526aee1`), integrated on `feat/m2-make-buy-policy`. |
| OKX AI provider integration | **Not built** | **New during OKX.** Provider not yet selected. |
| x402 buyer flow | **Not built** | **New during OKX.** No 402/pay/retry code yet. |
| X Layer payment/settlement path | **Not built** | **New during OKX.** Testnet first. |
| Spend authorization/reconciliation | **Not built** — M1 enforces the negative invariant: `authorize_external_spend` is granted by no capability, never materializes as a tool, and a contract binding it is rejected. | Adapts inherited approval/idempotency/verification principles to financial execution. |
| Selected real external-provider adapter | **Not built** | **New during OKX** unless it reuses a narrowly relevant inherited client. |
| External result verification | **Not built** — the inherited attempted → unverified → verified lifecycle is retained in the reliability core for the BUY path; M1 work is evidence-only. | Adapts inherited verify-before-complete principles. |
| Final objective synthesis | **Not built** | **New during OKX** as combined MAKE+BUY product behavior. |
| Canonical demo | **Not selected/built** | Demo selection gate: 18 Sep 2026, 12:00 SGT. |

### 4.1 M1 removals (legacy runtime decommissioned from the active surface)

Removed by `git rm` during M1 (provenance fully preserved in git history; these are dormant-by-removal,
not deleted-from-history):

- Convex legacy runtime: `convex/{missions,validators,agent,effectAdapter,gateway,googleWorkspace,unipile,unipileStore,health,environment,http}.ts` — removed because they required the old schema (healthProbes/missions tables) and the old deployment gate (`assertDevelopment`, `acrobatic-swan-765`, `HEALTH_PROBE_WRITES_ENABLED`);
- legacy UI: `app/{MissionControl,HealthStatus,conversation,useSpeechToText}.{ts,tsx}`, `app/api/mission/route.ts`;
- legacy scripts/tests: procurement/unipile/google/qbo smoke + probe scripts and their tests.

Retained from inheritance and still active: `lib/reliability/core.ts`, `lib/workforce/**`, inherited pure
`lib/web` helpers (`fetchPublicHtml`, `htmlToExtractableText`), `lib/agent/procurement.ts` as the
reference pattern (no longer imported by runtime code), `app/somebody/**` visual components, brand assets.

## 5. Current truthful state

As of the 17 September M1 implementation (branch `qoder/general-session-ao10w4`):

**Working and inherited (still active in the repo):**

- Somebody app/runtime foundation (`app/` shell, layout, global styles, brand assets);
- reliability core and worker-runtime patterns (`lib/reliability/core.ts` — unmodified);
- workforce kernel (`lib/workforce/**` — catalog, permissions, worker resolution; extended with objective-spine re-exports);
- inherited pure web helpers (`lib/web/fetchPublicHtml.ts`);
- UI/brand visual language (`app/somebody/**`, mascot/wordmark/pill CSS tokens);
- reference pattern (not imported by runtime): `lib/agent/procurement.ts`.

**Working and built/adapted during OKX (M1, R1-remediated — see §3.5; M2 sourcing — see §3.7):**

- fresh current-product Convex schema + objective runtime (`convex/schema.ts`, `convex/objectives.ts`, `convex/objective{Validators,Args}.ts`) with run lease/expiry fencing;
- objective spine: fail-closed planner validation, factual inventory, WorkContract, application-owned completion (`lib/objective/{types,planner,contract,policy,runGuards}.ts`);
- **M2:** single canonical Make-vs-Buy policy in `lib/sourcing/` (MAKE / BUY / BLOCKED), consumed through the rule-free Objective seam `decideObjectiveSourcing` (`lib/objective/sourcing.ts`); decision, reason code, named missing resources and approved provider paths are persisted and presented (`convex/objectiveValidators.ts`, `app/ObjectiveWorkspace.tsx`);
- Active MAKE runtime: deliberate model selection, envelope-only tool materialization, real `@openai/agents` Agent/Runner execution, bounded untrusted-content observation surface (`lib/worker/{modelSelection,port,runtime}.ts`);
- Node-resident executor + application-owned evidence port (`convex/objectiveRunner.ts`, `"use node"`);
- Objective workspace UI as the app entry point (`app/ObjectiveWorkspace.tsx`, `app/page.tsx`, acceptance truthfulness in `app/resultStatus.ts`);
- focused Level-1 tests (corrected breakdown, observed on `fix/r1-m1-acceptance` at `5e0f542`):
  `tests/objective.test.ts` 22, `tests/planner.test.ts` 15, `tests/runLifecycle.test.ts` 11,
  `tests/worker.test.ts` 13, `tests/workforce.test.ts` 11, `tests/ui.test.ts` 5 — **77/77 pass**;
  `npx tsc --noEmit` and `npx tsc -p convex/tsconfig.json --noEmit` both clean; `npx next build` compiles.
  The earlier "32/32 (16 objective / 9 workforce / 7 worker)" line described the pre-R1 baseline and was stale.
- **M2** focused tests (observed at `266b3db` + docs commit): `tests/sourcing.test.ts` 19,
  `tests/sourcingSeam.test.ts` 14, `tests/ui.test.ts` 13, plus the M1 files above —
  full suite `npx tsx --test tests/*.test.ts` **118/118 pass**; root and `convex` typechecks both clean.

**Documented but not yet implemented:**

- BUY *execution*: calling an approved provider, and the OKX/x402/X Layer buyer rail (M3). The BUY **decision** and its persisted provider-path metadata are built (§3.7);
- selected external provider / non-empty `APPROVED_PROVIDER_PATHS` — blocked on the canonical demo gate, deliberately not invented (§3.7);
- final MAKE+BUY E2E.

Closed in §3.6 (previously listed here as documented-but-not-implemented): live fresh
Convex deployment (`clean-tapir-151`, real codegen), live Development smoke of the full
objective flow (positive proof `obj_1789659986103_l9gomb`), and the deterministic
negative proof (`obj_1789661449740_36j0y3`).

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
