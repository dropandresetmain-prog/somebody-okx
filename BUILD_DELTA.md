# Build Delta — Somebody × OKX Dev Day 2026

Status: **canonical hackathon provenance and evidence ledger**
Created: 17 September 2026

## Purpose

This file is the auditable record separating **what existed before OKX Dev Day** from **what is built during the official hackathon**.

Judges, reviewers and future contributors should be able to read this file alone and know exactly which capabilities are inherited and which are new.

## Official build period

**17–25 September 2026.**

Anything dated or committed before 17 September 2026 is inherited and is **not** submitted as hackathon work.

## How to read this file

| Section | Meaning |
|---|---|
| [1. Before OKX — Somebody baseline](#1-before-okx--somebody-baseline) | Pre-existing product. Inherited, not hackathon work. |
| [2. Before OKX — Workforce R&D baseline](#2-before-okx--workforce-rd-baseline-army-of-interns) | Pre-existing **separate R&D source material**. Never shipped inside Somebody. |
| [3. Built during OKX Dev Day](#3-built-during-okx-dev-day--1725-sep-2026) | Evidence ledger. Only repo-verified completed work. |
| [4. Planned / Not Yet Built](#4-planned--not-yet-built) | Target scope. **Not implemented.** |

Rules for maintaining this file:

- Section 3 is append-only-ish: add entries as milestones complete; do not quietly rewrite history.
- A capability may only move into Section 3 when repository evidence proves it.
- Inherited capability must never be presented as OKX Dev Day work, even when OKX-period commits moved the code between repositories.

### Terminology

- **Inherited** — existed and worked before 17 September 2026.
- **Transferred** — inherited code physically copied into `somebody-okx` during the build period. The *copy* is OKX-period activity; the *capability* is still inherited.
- **Built** — new capability created during the build period.

---

## 1. Before OKX — Somebody baseline

**Classification: pre-existing product. This is the inherited AI-manager product and reliability/runtime foundation.**

- Source repository: `dropandresetmain-prog/somebody-ai`
- Accepted pre-OKX SHA: `709a169a1a4f71b8dc2d7427438ff514999fb07e`
- Commit date: **13 September 2026** (verified via GitHub API — four days before the build period opened)
- Scale at that SHA: 118 tracked files

This inventory was produced by inspecting the repository at that SHA directly, not from prior summaries.

### 1.1 Transfer status into `somebody-okx`

The baseline was transferred into this repository during the build period at commit `a47cc93` (`chore: transfer Somebody baseline from 709a169`).

Fidelity evidence, measured by comparing git blob hashes at `somebody-ai@709a169` against `somebody-okx@093d247`:

- **113 of 115 shared files are byte-identical.**
- The only two differences are `README.md` and `ARCHITECTURE.md`, deliberately replaced by the OKX SSOT versions. The originals are preserved under `docs/legacy/somebody-ai/`.
- `PROJECT_BRIEF.md` was relocated to `docs/legacy/somebody-ai/PROJECT_BRIEF.md`; two incidental asset READMEs were not carried over.

**This transfer added no new product capability.** Everything in this section is inherited.

### 1.2 Inherited capability inventory

All rows: source repo `dropandresetmain-prog/somebody-ai`, source SHA `709a169a1a4f71b8dc2d7427438ff514999fb07e`, pre-OKX status **Working (inherited)** unless stated otherwise.

#### Product and operator surface

| Capability | Pre-OKX status | Key source files | Description |
|---|---|---|---|
| Product/UI shell | Working | `app/layout.tsx`, `app/page.tsx`, `app/ConvexClientProvider.tsx`, `app/globals.css` (2,106 lines) | Next.js 16 / React 19 app shell with Convex realtime provider and a substantial existing design system. |
| Mission Control UI | Working | `app/MissionControl.tsx` (1,529 lines) | Primary operator screen: mission state, vendors, evidence, approvals, effects and events. Large single file; audited as extract-don't-extend. |
| Operator drawer | Working | `app/somebody/OperatorDrawer.tsx` (458 lines) | Operator-facing detail/inspection surface. |
| Presentation layer | Working | `app/somebody/presentation.ts` (553 lines) | Pure view-model logic: stages, headlines, vendor status, changed-fact diffing, effect copy, money/date formatting. Test-covered. |
| Brand identity | Working | `brand/SOMEBODY_BRAND.md`, `brand/assets/**`, `public/mascot/**`, `app/somebody/Mascot.tsx`, `app/somebody/Icon.tsx` | Somebody mascot with seven emotional states mapped to mission status, avatar/hero assets, icon set. |
| Presentation/demo assets | Working | `video-assets/index.html`, `video-assets/scene.js`, `video-assets/styles.css` | Standalone presentation/recording scene. |
| Voice input | Working | `app/useSpeechToText.ts` (144 lines) | Speech-to-text hook for natural-language objective entry. |
| Health status surface | Working | `app/HealthStatus.tsx`, `convex/health.ts` | Deployment health probe and UI indicator. |

#### Mission lifecycle, state and reliability

| Capability | Pre-OKX status | Key source files | Description |
|---|---|---|---|
| Mission lifecycle | Working | `lib/procurement/types.ts`, `lib/procurement/domain.ts` (626 lines) | Controlled workflow: `clarifying → sourcing → awaiting_approval → approved → verifying → complete`, plus `blocked`. Illegal transitions throw. |
| Reliability core | Working | `lib/reliability/core.ts` (55 lines) | The load-bearing safety primitives, deliberately free of procurement semantics: `transition`, `authorizeEffect`, `verifyReceipt`, `assertComplete`, and the `CoreWorkerContract` carrying `idempotencyScope`, authorized effect keys and required-verified effect keys. |
| Convex state | Working | `convex/schema.ts`, `convex/missions.ts` (369 lines), `convex/validators.ts` (217 lines) | Mission aggregate persisted as one validated document so evidence, decisions and effects stay atomic. Tables: `missions`, `missionEvents`, `fixtureReceipts`, `unipileReceipts`, `unipileInbound`, `healthProbes`. |
| Realtime views and event log | Working | `convex/missions.ts` (`view` query), `missionEvents` table | Realtime mission projection plus an append-only mission event log indexed by mission key. |
| Approval controls | Working | `lib/reliability/core.ts` (`authorizeEffect`), `lib/procurement/domain.ts`, `convex/missions.ts` | Gated effects require a **persisted** approval whose `approvalVersion` matches the current contract. A model cannot self-approve, and a stale approval fails closed. |
| Effect lifecycle | Working | `lib/procurement/types.ts` (`Effect`), `convex/effectAdapter.ts` (372 lines) | Every external action is a persisted effect moving `pending → attempted → unverified → verified`, with kinds `rfq`, `clarification`, `confirmation`, `rejection`, `purchase_order`. Adapter dispatch is centralized. |
| Idempotency / retry handling | Working | `lib/procurement/domain.ts` (`effectForExecution`), `lib/accounting/quickbooks.ts` (`docNumberForEffect`, `createOrReconcilePurchaseOrder`), `lib/unipile/inbound.ts` | Stable logical effect identity plus an attempts counter, so a retry reconciles instead of duplicating. Inbound messages dedupe on `providerMessageId`; duplicate evidence ingest is idempotent (test-covered). |
| Verification before completion | Working | `lib/reliability/core.ts` (`verifyReceipt`, `assertComplete`), `lib/procurement/domain.ts` (`beginVerification`), `convex/missions.ts` (`verify`) | Completion is refused until every required effect is independently read back and matched on identity and payload. **Submission is never treated as completion.** This is the single most directly reusable principle for OKX payment safety. |
| Evidence and provenance | Working | `lib/procurement/domain.ts` (`evidenceId`, `ingestEvidence`), `lib/web/observationIdentity.ts`, `lib/unipile/chronology.ts`, `lib/google/evidence.ts` | Content-addressed evidence identity, per-provider provenance records, material fingerprints for web observations, and source-revision ordering so later claims supersede earlier ones deterministically. |
| Model-proposal containment | Working | `lib/procurement/commands.ts` (109 lines), `convex/gateway.ts` | Agent commands are Zod-validated at the boundary; the application owns truth, ranking, eligibility, identity, approval and completion. Model output is a proposal, never a persisted fact. |
| Access control / write gateway | Working | `convex/environment.ts`, `convex/gateway.ts`, `lib/server/local-control.ts`, `app/api/mission/route.ts` | Writes are pinned to a named development deployment, require an explicit env flag, and require a shared token of at least 32 characters. Local-only request guard is test-covered. |

#### Agent runtime and models

| Capability | Pre-OKX status | Key source files | Description |
|---|---|---|---|
| Agent runtime | Working | `lib/agent/procurement.ts` (175 lines), `convex/agent.ts` | `@openai/agents` `Agent` + `Runner` with nine bounded tools (`inspect_mission`, `ask_requirements`, `request_quote`, `clarify_quote`, `recommend`, `record_no_viable_option`, `execute_effect`, `verify_effect`, `complete_mission`). Serial tool calls, `toolChoice: "required"`, `maxTurns: 32`, application-driven stop conditions, tracing disabled so raw reasoning is never persisted. |
| Model-provider support | Working | `lib/agent/procurement.ts` (`providerConfiguration`), `scripts/model-probe.ts`, `.env.example` | OpenRouter or OpenAI, selected by env. Live calls are refused unless `LIVE_AI_ENABLED=true`, an API key is present, and `AI_MODEL` is set to a deliberately chosen tool-capable model. No implicit default model. |
| Prompt-injection posture | Working | `lib/agent/procurement.ts` instructions | Vendor text and user input are treated as untrusted data; embedded instructions are explicitly not followed. |

#### Procurement workflow (demo-specific)

| Capability | Pre-OKX status | Key source files | Description |
|---|---|---|---|
| Procurement workflow | Working, **narrow** | `lib/procurement/domain.ts`, `lib/procurement/types.ts`, `lib/procurement/commands.ts`, `lib/procurement/fixtures.ts` | Full vendor/quote/RFQ/clarification/ranking/recommendation/approval/purchase-order aggregate with MOQ, budget, deadline and branding constraints, deterministic ranking and `no_viable_option` handling. |
| | | | **Caveat carried forward from `REUSE_AUDIT.md`:** this is procurement-shaped, not a universal workflow engine. It is inherited working software, not a general capability platform. |

#### External integrations

| Capability | Pre-OKX status | Key source files | Description |
|---|---|---|---|
| Google integrations (shared) | Working | `lib/google/client.ts`, `lib/google/config.ts`, `lib/google/index.ts`, `convex/googleWorkspace.ts` | `googleapis` OAuth refresh-token auth and client factories for Gmail, Sheets, Calendar and Drive, behind an explicit `GOOGLE_WORKSPACE_LIVE` flag. |
| Gmail | Working | `lib/google/gmail.ts` (362 lines) | Outbound send as a verified effect (`sendGmailEffect`), read-back verification (`verifyGmailOutbound`), inbound vendor-reply polling (`listGmailVendorReplies`), body hashing for payload identity, recipient binding via opaque `endpointRef` map so the model never sees real addresses. |
| Sheets | Working | `lib/google/sheets.ts` (167 lines) | Deterministic mission→spreadsheet projection (`buildSheetsProjectionRows`, `projectMissionToSheet`) for an external comparison artifact. |
| Calendar | Working | `lib/google/calendar.ts` (100 lines) | `readCalendarMissionContext` — reads real calendar constraints into mission context. |
| Drive | Working | `lib/google/drive.ts` (65 lines) | `readDriveMissionContext` — reads company document context. |
| Web sourcing | Working | `lib/web/fetchPublicHtml.ts`, `lib/web/extractCatalogueFacts.ts`, `lib/web/catalogueSource.ts`, `lib/web/sourceCatalogueEvidence.ts`, `lib/web/observationIdentity.ts` | Live public-page retrieval, script-stripped text extraction, controlled fact extraction that refuses to fabricate absent fields, and stable observation identity. Exercised against a live page in the test suite. |
| Unipile (WhatsApp + Instagram) | Working | `lib/unipile/*` (9 modules, incl. `claims.ts` 432 lines, `inbound.ts` 215, `outbound.ts` 121), `convex/unipile.ts`, `convex/unipileStore.ts`, `convex/http.ts` | Real two-way messaging: outbound planning with read-back matching, webhook ingest with secret validation, own-message suppression, dedupe, inbound correlation to vendors, timezone-aware claim extraction (`Asia/Singapore` default) with both deterministic and model-assisted paths, and provider→channel mapping. |
| QuickBooks Online Sandbox | Working (Sandbox only) | `lib/accounting/quickbooks.ts` (581 lines) | Purchase-order write path with create-or-reconcile idempotency, deterministic doc numbers derived from effect keys, currency-capability checks, intent-vs-document matching (`assertPurchaseOrderMatchesIntent`) and independent read-back. Env contract forbids production. |

#### Verification evidence

| Capability | Pre-OKX status | Key source files | Description |
|---|---|---|---|
| Test suite | Working | `tests/` — 9 files, **78 tests** | `generalized` 15, `unipile` 18, `invariants` 14, `google-workspace` 8, `web-sourcing` 7, `web-ranking-policy` 6, `presentation` 5, `quickbooks-po` 4, `local-control` 1. Run via `tsx --test`. |
| Typecheck | Working | `tsconfig.json`, `convex/tsconfig.json` | Separate root and Convex typecheck scripts. |
| Build | Working | `next.config.ts`, `package.json` | `next build`. |
| Proof / ops scripts | Working | `scripts/` — 13 files | Per-integration live proof scripts (`prove-google-workspace`, `prove-gmail-inbound`, `prove-quickbooks-po`, `prove-web-sourcing`, `prove-unipile`, `prove-structured-quote`), OAuth bootstraps, resource discovery, model probe, configure/smoke. Evidence-first operating habit, inherited. |
| Secret hygiene | Working | `.env.example`, `.gitignore` | Variable **names** only; all `.env*` files gitignored except the example. |

#### Inherited stack

Next.js 16.3, React 19.3, Convex 1.45, `@openai/agents` 0.18, `openai` 7.15, `googleapis` 159, Zod 4.6, TypeScript 7, Node ≥ 22.6.

### 1.3 What the baseline does *not* contain

Verified by searching the repository at `093d247`: the terms `x402`, `X Layer`, `OKX`, `eip155`, `wallet`, `Onchain OS` and `privateKey` appear in **markdown documentation only**. There are **zero** occurrences in any product code (`app/`, `convex/`, `lib/`, `scripts/`, `tests/`).

The baseline also contains no workforce, capability-vocabulary, worker, assignment or Make-vs-Buy code of any kind.

---

## 2. Before OKX — Workforce R&D baseline (Army of Interns)

> ### **Pre-existing R&D / source material available before OKX Dev Day.**
>
> **This is NOT part of the existing Somebody product.** None of the items below ever shipped inside Somebody. This section exists to disclose available prior source material honestly — not to claim inherited product capability.
>
> Since [§3.2](#32-first-built-capability--minimal-workforce-kernel) a **small subset of these ideas** has been adapted into `somebody-okx` as new code. The Army *implementation* below is still not present; what was built is a rewritten minimal kernel. Read §3.2 for the exact port/rewrite/reject split.

- Source repository: `dropandresetmain-prog/army-of-interns`
- Pre-OKX SHA: `677166db591465fb6d201fb12db7cfe038557a92`
- Commit date: **13 September 2026** (verified via GitHub API)
- Scale at that SHA: 128 tracked files
- Stack: Next.js 16, Convex, `@openai/agents` via OpenRouter, Vitest

Only pieces materially relevant to the OKX **MAKE** path are inventoried. Army-specific runtime, Telegram/Twilio integrations, demo state machines, org-chart/avatar UI, personalities and rank/promotion systems are deliberately excluded per `REUSE_AUDIT.md`.

| R&D asset | Pre-OKX status | Source files (at `677166d`) | Relevance to OKX MAKE path |
|---|---|---|---|
| Capability vocabulary | Exists in Army only | `src/core/workforce/capabilityCatalog.ts` (304 lines) | `CONTROLLED_CAPABILITIES` — six controlled keys (`maintenance_triage`, `stakeholder_messaging`, `vendor_sourcing`, `content_marketing`, `research`, `bookkeeping`) with signals, role templates and `implies` chains, plus a `TOOL_PERMISSIONS` table. Demonstrates a controlled vocabulary the application owns. |
| Capability validation | Exists in Army only | `src/core/workforce/capabilityAnalysis.ts` (99 lines) | `analyzeRequiredCapabilities` matches work text against catalog signals, accepts model-proposed keys **only** if they exist in the catalog, returns `rejectedProposals` explicitly and flags `unrecognized`. This is the "model proposes, application validates" pattern the OKX planner needs. |
| Permission envelopes | Exists in Army only | `src/core/workforce/permissionMapping.ts` (71 lines), `src/agents/permissions.ts` (31 lines) | `mapCapabilitiesToToolPermissions` and `enforcePermissionEnvelope` strip self-granted or invented permissions down to what the worker's capabilities allow. Deny-by-default. Directly relevant to keeping a MAKE worker away from spend authority. |
| Worker creation | Exists in Army only | `src/core/workforce/workerSpecFactory.ts` (52 lines) | `createWorkerSpecFromCapabilities` builds a bounded worker spec from validated capabilities — the "missing worker is not a missing capability" mechanic. |
| Worker matching / reuse | Exists in Army only | `src/core/workforce/workforceMatcher.ts` (92 lines) | `matchWorkforce` selects an existing worker by capability coverage or returns `no_match`, enabling reuse instead of unbounded worker creation. |
| Assignments | Exists in Army only | `src/core/workforce/assignmentFactory.ts` (42 lines) | `createAssignmentDraft`, `defaultResponsibilityForCapabilities` — binds a bounded task to a worker. |
| Workforce events / staffing plan | Exists in Army only | `src/core/workforce/kernelPlan.ts` (173 lines), `src/core/workforce/workIntake.ts` (56 lines) | `planWorkforceStaffing` produces a `StaffingDecision` plus `KernelPlanEvent[]` lifecycle events for create-vs-reuse paths; `intakeNaturalWorkRequest` turns a natural request into a generic work item. |
| Relevant tests | Exists in Army only | `src/core/workforce/workforce.test.ts` (312 lines, Vitest) | 13 cases over 6 groups covering work intake, capability mapping, explicit rejection of unknown keys, worker selection by coverage, second-task reuse, `no_match`, WorkerSpec validity, out-of-envelope grant rejection, assignment creation, lifecycle events, two smoke scenarios through one planner, and a scenario-independence guard. Useful acceptance shape to reproduce. |
| Army persistence glue | Exists in Army only — **not a reuse candidate** | `convex/workforce.ts` (573 lines), `convex/capabilities.ts`, `convex/workers.ts`, `convex/assignments.ts` | Army-specific schema/runtime coupling. Recorded for completeness; `REUSE_AUDIT.md` recommends rewriting the primitives cleanly rather than importing this. |

**Standing judgment (unchanged):** the useful workforce ideas amount to a small volume of simple, well-tested logic. Reimplementing them minimally inside Somebody-OKX is expected to be cheaper than importing Army's dependencies.

---

## 3. Built during OKX Dev Day — 17–25 Sep 2026

**This is the hackathon delta.** Only work with repository evidence appears here.

**Current state of the build period: SSOT documentation, source audit, baseline transfer + verification, and the first built capability — a minimal internal-workforce kernel.** Nothing in this section should be read as a working Make-vs-Buy, marketplace, wallet or payment feature; none of those exist.

### 3.1 Completed

| Feature | Implementation status | Commit / SHA | Files / subsystems | Verification run | Result | Demo relevance |
|---|---|---|---|---|---|---|
| Project SSOT established | Complete (docs) | `d1c064d` | `README.md` | Manual review | Accepted | Frames the submission narrative. |
| Product scope locked | Complete (docs) | `bf53eca` | `PRODUCT_SPEC.md` | Manual review | Accepted | Defines the MAKE/BUY acceptance shape judges will see. |
| Architecture boundaries defined | Complete (docs) | `ac32b87` | `ARCHITECTURE.md` | Manual review | Accepted | Payment-state safety model and provider-adapter seam. |
| Decisions log created | Complete (docs) | `cc2a139` | `DECISIONS_LOG.md` | Manual review | Accepted | Records why the demo is still open and what was rejected. |
| Source reuse audit | Complete (docs) | `772f353` | `REUSE_AUDIT.md` | Manual review | Accepted | Transfer plan for both baselines. |
| Active task ledger | Complete (docs) | `73f2e88` | `docs/work/ACTIVE_TASK.md` | Manual review | Accepted | Long-horizon checkpoint/evidence discipline. |
| Pre-build research ingested | Complete (docs) | `c4267fe` | `docs/research/PREBUILD_RESEARCH_INGEST.md` | Manual review | Accepted | Provider-scarcity research and official OKX testnet findings. |
| **Somebody baseline transfer** | Complete — **transfer only, no new capability** | `d10a73a` (gate), `a47cc93` (transfer), `093d247` (gate removed) | 115 files from `somebody-ai@709a169` | Blob-hash comparison vs source SHA | **113/115 shared files byte-identical**; only `README.md` / `ARCHITECTURE.md` intentionally replaced | Provides the inherited runtime the OKX work will build on. Capability remains inherited (Section 1). |
| **Inherited baseline verified in this repo** | Complete — verification evidence | Run at `093d247`, 17 Sep 2026 | `tests/` (9 files), root + Convex typecheck | `npm ci`; `npm test`; `npm run typecheck`; `npm run typecheck:convex` | **78/78 tests pass. Root typecheck clean. Convex typecheck clean.** Install: 140 packages | Confirms the transferred foundation actually works here, so later OKX failures are attributable to new work. |
| Build provenance ledger | Complete (docs) | `f9333ad` | `BUILD_DELTA.md`, `README.md` | Source paths and SHAs verified against GitHub; link check | Accepted | The artifact that makes the 17–25 Sep delta legible to judges. |
| Model-selection guidance imported | Complete (docs) | `f9333ad` | `docs/agents/MODEL_ARSENAL.md`, `docs/agents/AGENT_MODEL_SELECTION.md` | Source SHA verified as current authoritative `main` | Accepted | Operating discipline: keeps wallet/payment/security/architecture work with the primary model. |
| OKX sandbox/test strategy recorded | Complete (docs) | `f9333ad` | `README.md`, `ARCHITECTURE.md`, `DECISIONS_LOG.md` | Grounded in official OKX documentation | Accepted | Establishes a no-real-funds development rail before any payment code exists. |
| **Minimal workforce kernel (MAKE foundation)** | **Built — first OKX-period product capability** | this commit | `lib/workforce/` (5 new files), `tests/workforce.test.ts` | `npx tsx --test tests/workforce.test.ts`; `npm test`; `npm run typecheck` | **Focused 11/11 pass. Full suite 89/89 pass (78 inherited + 11 new). Root typecheck clean.** | Scenario-independent foundation the MAKE path and the later Make-vs-Buy policy are built on. |

### 3.2 First built capability — minimal workforce kernel

This is the **first genuinely new capability created during the OKX build period**, as opposed to documentation or transfer activity. Its provenance needs stating precisely.

#### Provenance

- Workforce ideas **existed before OKX Dev Day**, in `dropandresetmain-prog/army-of-interns` (see [§2](#2-before-okx--workforce-rd-baseline-army-of-interns)). That is pre-existing R&D.
- Those ideas were **never part of the Somebody product**. The inherited Somebody baseline ([§1](#1-before-okx--somebody-baseline)) contains no workforce, capability or worker code of any kind.
- What is **built** here is a new, rewritten, minimal kernel inside `somebody-okx`, informed by that R&D.

**This is not a claim that Army's workforce system was built during OKX Dev Day.** Army's system is larger, scenario-specific and remains outside this repository.

#### Source inspiration inspected

Read directly at `army-of-interns@677166db591465fb6d201fb12db7cfe038557a92`:

- `src/core/workforce/capabilityCatalog.ts`
- `src/core/workforce/capabilityAnalysis.ts`
- `src/core/workforce/permissionMapping.ts`
- `src/core/workforce/workerSpecFactory.ts`
- `src/core/workforce/workforceMatcher.ts`
- `src/core/workforce/workforce.test.ts`
- `src/core/workforce/index.ts`
- `src/agents/permissions.ts`

#### Ported vs rewritten vs rejected

| Army primitive | Decision | Reason |
|---|---|---|
| Controlled capability vocabulary | **Rewritten** | The *principle* — application owns the vocabulary, models may only propose — is kept. Army's six demo capabilities (`maintenance_triage`, `vendor_sourcing`, …) are scenario-specific and were not carried over. |
| Capability → tool permission mapping | **Rewritten, single-table** | Army stores grants twice (`defaultToolPermissionIds` plus `grantedByCapabilityKeys`) and the two tables can silently disagree. The rewrite makes the capability the single source of truth and adds `assertCatalogIntegrity()`. |
| Permission envelope enforcement | **Ported in concept** | `enforcePermissionEnvelope` keeps Army's deny-by-default filtering of self-granted permissions. Rewritten against the new types. |
| Worker matching / reuse | **Ported in concept** | Capability-coverage matching with a smallest-envelope tiebreak, rewritten without worker status/orchestration semantics. |
| Worker spec factory | **Rewritten and stripped** | Army's `WorkerSpec` carries `employmentType`, `rank`, `personality`, `communicationStyle` and manager links. None were carried over. |
| Capability *analysis* (`analyzeRequiredCapabilities`) | **Rejected** | Keyword-signal matching (`leak`, `toilet`, `hvac`) is scenario-coupled, and capability selection is a planner concern, not a kernel concern. |
| `implies` capability chains | **Rejected** | Unnecessary ontology for the current scope. |
| Work intake, assignments, kernel plan events | **Rejected** | Orchestration and work-queue concerns, explicitly out of scope. |
| `convex/workforce.ts` and Army schema glue | **Rejected** | Army-specific runtime coupling. No persistence was added; the kernel is pure and testable without Convex. |
| `src/agents/permissions.ts` (manager/rank tools) | **Rejected** | Depends on rank and org hierarchy. |

#### New files

| File | Purpose |
|---|---|
| `lib/workforce/types.ts` | Resource classes, tool permission IDs, capability keys, `WorkerSpec`, `WorkerResolution`. |
| `lib/workforce/catalog.ts` | Controlled vocabulary: 11 resource classes (5 owned / 6 externally controlled), 5 tool permissions, 3 scenario-independent capabilities, plus validation and `assertCatalogIntegrity()`. |
| `lib/workforce/permissions.ts` | Deny-by-default capability → tool mapping and envelope enforcement. |
| `lib/workforce/workers.ts` | `createWorkerSpec` and `resolveWorker` (reuse-or-create). |
| `lib/workforce/index.ts` | Public seam for the kernel. |
| `tests/workforce.test.ts` | 11 focused tests. |

No existing file was modified. The inherited procurement flow, Convex schema and agent runtime are untouched.

#### Behavior built

- **Controlled capability definitions** — stable key, name, description, required resource classes, allowed tools and an execution responsibility.
- **Fail-closed validation** — unknown capability keys throw wherever they could reach a worker; `validateCapabilityKeys` splits model proposals into accepted/rejected.
- **Resource vocabulary** — owned classes (`llm_reasoning`, `public_web`, `company_records`, `company_tools`, `ordinary_compute`) and externally controlled classes (`proprietary_data`, `privileged_access`, `specialist_compute`, `human_voice_contact`, `physical_presence`, `attestation`) as vocabulary for the later policy. Requirements are emitted deterministically (deduplicated, sorted, order-independent).
- **Deny-by-default tools** — a worker holds a tool only because a capability grants it. Unknown tools are denied; a worker cannot widen its own envelope; reuse re-derives permissions so a tampered inventory worker is narrowed, never widened.
- **Minimal worker spec** — deterministic key, capability keys, allowed tools, required resources, responsibility. No personality, rank, promotion, avatar, hierarchy, employment metadata or messaging identity.
- **Reuse-or-create** — `resolveWorker` reuses the narrowest compatible existing worker, or constructs a new minimal spec. This is the "a missing worker is not a missing capability" mechanic.
- **No BUY leakage** — `authorize_external_spend` exists as *known* vocabulary flagged `externalAuthority`, and is granted by **no** capability. It is denied to every MAKE worker, and `assertCatalogIntegrity()` fails the catalog if any capability ever tries to grant it. No BUY, marketplace, wallet or payment behavior was implemented.

#### Verification evidence

| Check | Command | Result |
|---|---|---|
| Focused workforce tests | `npx tsx --test tests/workforce.test.ts` | **11/11 pass** |
| Full existing unit suite | `npm test` | **89/89 pass** (78 inherited baseline + 11 new) |
| Root typecheck | `npm run typecheck` | **Clean** |
| Convex typecheck | Not run | Deliberate — no Convex-facing file or type was touched. |

### 3.3 Honest summary of the delta so far

As of this checkpoint the OKX Dev Day contribution is: **a locked product/architecture SSOT, an audited and byte-verified transfer of the inherited Somebody baseline, proof that the inherited baseline passes its own checks inside this repository, imported model-routing discipline, a documented sandbox-first payment development strategy, and one built capability — a minimal, scenario-independent internal-workforce kernel with deny-by-default tool permissions.**

No OKX integration, Make-vs-Buy policy, marketplace or payment code exists yet.

---

## 4. Planned / Not Yet Built

**Everything in this section is NOT IMPLEMENTED.** No repository evidence supports any of it. It is target scope only.

| Planned item | Status | Notes |
|---|---|---|
| Transferred Somebody runtime adapted for OKX use | **Not built** | The baseline is transferred and verified, but *no OKX-specific adaptation* of it exists. |
| Dynamic workforce (MAKE path) | **Partially built** | The kernel exists and is tested (§3.2): capability vocabulary, fail-closed validation, deny-by-default tool permissions, minimal worker specs and reuse-or-create. **Not built:** worker execution, persistence, assignments or any planner that selects capabilities from a founder objective. |
| Make-vs-Buy policy implementation | **Not built** | The rule is specified in `PRODUCT_SPEC.md` and `ARCHITECTURE.md`. There is no `MAKE` / `BUY` / `BLOCKED` policy code. The kernel's resource-ownership vocabulary is the intended input to it. |
| OKX AI marketplace integration | **Not built** | No provider selected, no adapter, no client. |
| Agentic Wallet integration | **Not built** | No wallet, key handling or signing code. Zero wallet references in product code. |
| x402 payments | **Not built** | No x402 client, no `402` handling, no authorize/sign/pay/retry loop. |
| X Layer settlement | **Not built** | No chain client, no RPC configuration, no settlement or receipt code. |
| External-provider verification | **Not built** | The inherited `verifyReceipt` / `assertComplete` primitives exist and are the intended foundation, but no external-provider verification path is implemented. |
| Canonical demo selection | **Not decided** | Remains OPEN per `DECISIONS_LOG.md`. The supplier-invoice / independent-attestation scenario is a research candidate only. |
| Company resource inventory | **Not built** | The kernel classifies *resource classes* as owned or externally controlled, but there is no inventory of what this company actually holds. |
| Objective / capability planner | **Not built** | Not started. |
| Spend authorization and budget controls | **Not built** | Approval primitives are inherited; OKX spend policy is not built. |
| Final canonical demo | **Not built** | Not recorded, not rehearsed, not selected. |

---

## Maintenance

Update this file at every OKX milestone checkpoint.

When a Section 4 item becomes real, move it to Section 3 **with its commit SHA, the files touched, the verification command actually run and the observed result.** An item with no verification evidence stays in Section 4.

Related canonical documents:

- [`README.md`](README.md) — build-provenance summary and sandbox/test strategy.
- [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) — locked product and hackathon scope.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — target boundaries and payment-state safety.
- [`DECISIONS_LOG.md`](DECISIONS_LOG.md) — settled decisions.
- [`REUSE_AUDIT.md`](REUSE_AUDIT.md) — transfer classification for both source baselines.
- [`docs/work/ACTIVE_TASK.md`](docs/work/ACTIVE_TASK.md) — current checkpoint and next action.
- [`docs/agents/AGENT_MODEL_SELECTION.md`](docs/agents/AGENT_MODEL_SELECTION.md) — model/subagent routing.
