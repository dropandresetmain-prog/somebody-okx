# ACTIVE TASK — Somebody × OKX Dev Day 2026

Status: **ACTIVE**  
Updated: **17 September 2026** (M2 generic sourcing integration complete; M2 acceptance blocked on the canonical demo gate — see "M2 checkpoint" below)

## Goal

Deliver one reliable 2–4 minute end-to-end demo proving:

`founder objective → capability/resource plan → MAKE + BUY → verified result → useful business outcome`

## Authoritative repo

`dropandresetmain-prog/somebody-okx`

## Read order

Read these before implementation:

1. `README.md`
2. `MASTER_PLAN.md`
3. `ARCHITECTURE.md`
4. `PRODUCT_SPEC.md`
5. `DECISIONS_LOG.md`
6. `REUSE_AUDIT.md`
7. `BUILD_DELTA.md`
8. this file

Architecture, integration decisions, wallet/signing/payment work, security-sensitive code and final verification remain primary-model responsibilities.

## Key dates

- canonical demo gate: **18 Sep 2026, 12:00 SGT**;
- hard feature freeze: **23 Sep 2026, 18:00 SGT**;
- 24 Sep: debugging/hardening only;
- 25 Sep: video/submission only;
- internal submission target: **25 Sep, 22:00 SGT**.

## Source baselines

- Somebody: `dropandresetmain-prog/somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`
- Army of Interns: `dropandresetmain-prog/army-of-interns@677166db591465fb6d201fb12db7cfe038557a92`
- Model guidance source: `dropandresetmain-prog/resume-copilot@78d147716cf314b766aaed91d9fcde23959ea690`

## Locked architectural constraints

- Somebody remains the accountable manager/product.
- MAKE and BUY must both be real in the final demo.
- Missing worker != missing capability.
- MAKE requires real bounded worker execution, not only a `WorkerSpec`.
- `WorkerSpec` describes reusable capability/tool/resource envelope.
- `WorkContract` describes one assignment's authority, required evidence/outputs/effects and completion requirements.
- The inherited `CoreWorkerContract` is the starting architecture for WorkContract, not a frozen universal interface.
- Role/capability-specific policy remains specialized; do not build a generic workflow DSL.
- Model may propose capabilities/resources/actions; application policy validates/authorizes.
- The model does not grant itself spend authority or approval.
- Execution/provider success is not verification/completion.
- Evidence/provenance and stable effect identity are retained where relevant.
- BUY must be justified by an externally controlled scarce resource or materially impractical internal reproduction.
- Prefer testnet/sandbox for payment development when supported.
- Never silently spend real funds or expose wallet credentials/private keys.
- One external provider on the critical path.
- One canonical demo only.
- Reuse useful Mission Control visual direction/primitives, not its procurement-shaped architecture.
- Do not generalize into a company-OS platform.

## Fresh OKX data-plane decision

Somebody-OKX will use a **fresh Convex project/deployment and fresh operational state**.

Do not migrate or preserve by default:

- `acrobatic-swan-765` data/deployment identity;
- old procurement rows/fixtures;
- `healthProbes`;
- `HEALTH_PROBE_WRITES_ENABLED`;
- old provider bindings;
- old deployment-specific write/health machinery.

Old procurement code may remain temporarily for provenance/reference/reuse, but keeping the old procurement demo operational is **not** an M1 acceptance criterion.

## Provenance vocabulary

Use four categories:

- **Inherited** — working pre-OKX capability;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — prior idea/inherited primitive changed/reimplemented for the current product;
- **New during OKX** — capability neither prior project had in working product form.

`BUILD_DELTA.md` remains the evidence ledger. Planned work cannot be called built before repository evidence passes.

## Current checkpoint

### M1 — Objective spine + active MAKE — ACCEPTED (see "M1 ACCEPTED" section below)

Branch `qoder/general-session-ao10w4`, checkpoints pushed:

- Checkpoint 1 (Objective/Work spine): `7b41ea6`;
- Checkpoint 2 (Active MAKE runtime): `cb271cf`;
- Checkpoint 3 (Convex objective runtime): `1700864`;
- Checkpoint 4 (Objective workspace UI + env cleanup): `26bcf15`;
- docs update: see `git log` on the branch for the docs commit SHA.

Built and verified:

- [x] fresh current-product Convex schema (`objectives`, `objectiveEvents`, `evidence` only) — `convex/schema.ts`;
- [x] fail-closed planner validation (unknown capability keys / resource classes / permission smuggling fail closed; permission envelope derived by application code) — `lib/objective/planner.ts`;
- [x] factual company resource inventory + MAKE/BLOCKED sourcing — `lib/objective/policy.ts` + `evaluateSourcing` *(superseded in M2: this rule was deleted; the single authority is now `lib/sourcing/policy.ts::evaluateSourcingPolicy` behind the `decideObjectiveSourcing` seam — see §M2 checkpoint)*;
- [x] worker resolution through `lib/workforce/` (`resolveWorker`), WorkerSpec-derived `workerKey`;
- [x] assignment-specific WorkContract (`createWorkContract`), spend-binding rejected, evidence-only completion (`evaluateCompletion`); inherited `lib/reliability/core.ts` untouched;
- [x] deliberate model selection, fail-closed live provider gate — `lib/worker/modelSelection.ts`;
- [x] envelope-only tool materialization + real Agent/Runner execution with application-owned finalization — `lib/worker/runtime.ts`; `authorize_external_spend` never materializes (test-enforced);
- [x] Convex objective runtime: submit → plan → run start (lease + expiry fence + scheduler) → tool-mediated evidence/result recording → `finishRun` application-owned completion — `convex/objectives.ts`;
- [x] Objective workspace as app entry point (YOU ASKED / SOMEBODY'S PLAN / WHY MAKE? / THAT GUY / EVIDENCE / RESULT) reusing Mission Control visual language — `app/ObjectiveWorkspace.tsx`;
- [x] env cleanup: `.env.example` reduced to current-product variables; no `acrobatic-swan-765`, `DEVELOPMENT_ACCESS_TOKEN` or `HEALTH_PROBE_WRITES_ENABLED` references in active runtime;
- [x] legacy runtime modules removed from the active surface (provenance in git history; see `BUILD_DELTA.md` §4.1).

Test evidence (observed at the docs-update commit):

- root `npx tsc --noEmit`: clean;
- `convex` `npx tsc --noEmit`: clean;
- focused tests `npx tsx --test tests/objective.test.ts tests/workforce.test.ts tests/worker.test.ts`: **32/32 pass** (16 planner/sourcing/contract/resolution, 9 workforce kernel, 7 worker runtime incl. real-Runner scripted-model proof);
- `npx next build`: compiles, static prerender OK.

(Stale as of the R1 pass below: the suite is now six files / 77 tests. See the R1
checkpoint for the corrected breakdown.)

### R1 — foundation-review blockers (A–F) — CLOSED STATICALLY, LIVE PROOF PENDING

Branch `fix/r1-m1-acceptance`, from candidate tip `e06eb6f` merged with authoritative
`main` (`1894649`). Integration order A → B → C → Convex spine → D, branch pushed after
each integrated lane. SHA-by-SHA record and provenance: `BUILD_DELTA.md` §3.5.

| Blocker | State | Evidence |
|---|---|---|
| A — fabricated evidence could count as proof | closed | `EvidenceOrigin` + application-owned `sourceId`; `ModelNoteInput` omits both fields so the runtime cannot assert them; `recordFinding` re-derives identity and rejects caller-claimed origin (`d93a203`, `0e2883b`, `45d4286`); `tests/objective.test.ts`, `tests/worker.test.ts` "notes-only run cannot complete" |
| B — two distinct public sources + ≥1 company record not enforced | closed | `sourceProofs` + `normalizePublicUrl`/`sourceIdentity`; distinct-identity counts per class; proof is run-scoped (`d93a203`, `0e2883b`); URL-variant and duplicate-URL tests |
| C — worker could not see observed content | closed | read tools return bounded (1200-char) observed text wrapped in `<untrusted_content>`; ≤6 recent findings; port also bounds text so durable full text cannot leak (`d162eb6`, `0e2883b`); `tests/worker.test.ts` content/marker/truncation tests |
| D — client hard-coded plan; capability/role disconnected | closed | server-side `planObjectiveFromModel` action → one bounded structured model call → deterministic validation → `assertRoleRequirementsSatisfied`; fails closed if approved capabilities cannot obtain both evidence classes; client proposal literal deleted (`64c7e2c`, `0e2883b`, `282f2a6`); `tests/planner.test.ts` |
| E — run finalization / lease fencing | closed | pure `lib/objective/runGuards.ts` (`EXECUTION_TIMEOUT_MS` 270 s `<` `LEASE_MS` 300 s), `fenceRunWrite`, idempotent `decideFinalization`, abort budget inside the lease (`3b93bf2`, `0e2883b`); `tests/runLifecycle.test.ts` 11 cases incl. double-finalize and partial-failure-cannot-become-success |
| F — UI claimed acceptance it did not have | closed | `resolveResultDisplay(completion, hasResult)` drives `ResultSection`; read model returns durable `completion:{accepted,unmet}` (`282f2a6`); `tests/ui.test.ts` |
| Cleanup — dead scripts | closed | nine scripts pointing at the deleted `scripts/` directory removed; eight survive, each resolving to an installed binary; **no** new live-smoke command added (see below) |

Corrected checks, observed at `5e0f542`:

- `tests/objective.test.ts` 22, `tests/planner.test.ts` 15, `tests/runLifecycle.test.ts` 11,
  `tests/worker.test.ts` 13, `tests/workforce.test.ts` 11, `tests/ui.test.ts` 5 — **77/77 pass**;
- root `npx tsc --noEmit`: clean; `npx tsc -p convex/tsconfig.json --noEmit`: clean;
- zero `as never` casts remain anywhere in `convex/`, `lib/`, `app/`;
- `npx next build`: compiles, static prerender OK.

**M1 acceptance is now closed — see the "M1 ACCEPTED" section below.** Acceptance
criteria 1, 3, 10 and 12, which hinge on a real deployment and a real model call, are
now verified by a live positive proof and a live deterministic negative proof against
`clean-tapir-151`, in addition to the focused tests below.

On the "at most ONE current M1 live-smoke command" rule: no script was added to the
repo. Every candidate entry point needs a Convex deployment plus a provider key to run,
so a script would be a dangling command — the same defect the cleanup removed. The live
smoke was driven through the real product surface (submit one objective in the
Objective workspace / the equivalent `submitObjective` → `planObjectiveFromModel` →
`startRunPublic` call sequence) exactly as documented below.

### M1 ACCEPTED — live positive + deterministic negative proof (fix/r1-m1-acceptance)

Deployment: `clean-tapir-151` (`dropandreset-main/somebody-okx`). `acrobatic-swan-765`
was not used. `convex/_generated/` is real `npx convex dev` codegen; the hand-maintained
stand-in is retired. Provider: `openrouter`, model `openai/gpt-5.6-terra`.

**Positive proof** — objective `obj_1789659986103_l9gomb` (Cloudflare partnership
evaluation), run `run_1789660001886_c92t0u`: MAKE plan → worker created → company-record
observation (`record:partnerships/evaluation-criteria`) → two distinct public-web
observations (`url:https://www.cloudflare.com/plans/free/`,
`url:https://www.cloudflare.com/partners/`) → structured result →
`completion.accepted = true`, `unmet = []`. UI at `?objective=obj_1789659986103_l9gomb`
renders MAKE rationale, worker, all evidence and **RESULT → Accepted**.

**Deterministic negative proof** — objective `obj_1789661449740_36j0y3` (Stripe,
planned MAKE the same way), run `run_1789661601739_4xravw`: internal mutations
(`recordFinding` ×3, `submitResult`, `finishRun`) invoked directly against
`clean-tapir-151` using signatures pulled live via `npx convex function-spec`, recording
one company-record observation and the same public source identity
(`url:https://stripe.com/partners`) twice. `finishRun` returned `completed: false,
unmet: ["public_web: found 1 distinct source(s), required 2"]`; re-checked ~8s later,
unchanged. UI at `?objective=obj_1789661449740_36j0y3` renders THAT GUY → failed,
**RESULT → Not accepted**, unmet reason shown verbatim. Full method, race handling and
honest caveats: `BUILD_DELTA.md` §3.6.

**UI verification:** the workspace had no way to reopen a specific persisted objective
by key (only local React state set on submit), so a minimal read-only
`?objective=<key>` deep link was added to `app/ObjectiveWorkspace.tsx` — no new
mutation, no authority change. `run.toolCalls` is dead instrumentation (written once as
`0`, never incremented) but the one UI reference is guarded on `> 0`, so it never
renders a false claim; classified non-blocking (`BUILD_DELTA.md` §3.6).

**Checks:** focused suite 77/77 pass (`tests/{objective,planner,runLifecycle,worker,
workforce,ui}.test.ts`); root `npx tsc --noEmit` clean; `npx tsc -p
convex/tsconfig.json --noEmit` clean.

### M0 — Foundation and provenance — COMPLETE

Completed:

- [x] product/customer thesis locked;
- [x] OKX project thesis locked;
- [x] Make-vs-Buy rule locked;
- [x] Web3/OKX role bounded to external machine commerce;
- [x] pre-build planning/reuse audit ingested;
- [x] X Layer / Onchain OS test environment verified from official docs;
- [x] canonical SSOT established;
- [x] inherited Somebody baseline transferred and verified;
- [x] `BUILD_DELTA.md` created;
- [x] model/subagent selection guidance imported;
- [x] minimal workforce kernel rebuilt from Army-inspired R&D;
- [x] pre-OKX Somebody runtime directly re-audited;
- [x] canonical docs reconciled around the inherited worker/reliability architecture and fresh OKX data plane.

Evidence already established:

- baseline transfer commit: `a47cc93`;
- baseline verification at `093d247`: 78/78 inherited tests, clean root + Convex typechecks;
- workforce implementation: `dfae75af9326a8e719033948ede8b2b481b423bd`;
- workforce evidence: focused 11/11, cumulative 89/89 at that checkpoint, root typecheck clean;
- doc-reconciliation branch base: `4eb34800dc7aa7c6991474ab6787e40eafd124f0`.

## Canonical demo selection — PARALLEL / OPEN

Hard deadline: **18 Sep, 12:00 SGT**.

The demo-selection lane runs in parallel with M1 and must produce:

- canonical founder objective;
- MAKE path;
- genuinely scarce BUY path;
- actual provider;
- scarcity justification;
- reliability/environment evidence;
- fallback.

Do not block M1 on the exact final scenario; M1 is architecture/proof oriented.

**M2 dependency (new):** scenario selection now gates M2 *acceptance*, not M2 *implementation*.
The generic deterministic sourcing policy is complete (see §M2 checkpoint). What the gate must
still name is the canonical objective and **one real approved external provider path** for a
genuinely missing resource, so `APPROVED_PROVIDER_PATHS` can be populated with an actual provider
instead of an invented one. Until then a missing resource correctly yields BLOCKED.

## M2 checkpoint — canonical MAKE path + deterministic Make-vs-Buy policy

Status: **IMPLEMENTATION READY — ACCEPTANCE BLOCKED ON CANONICAL DEMO GATE**

Updated: 17 September 2026. Branch `feat/m2-make-buy-policy`, cut from accepted M1
`1e2c1a484713792cead51b85e1e1ae36d28b3e77` (promoted to `main`).

Prepared material consumed: `prep/m2-sourcing-policy` @ `3de805ec564bf85bfd4ac398eab2c207f526aee1`
(`lib/sourcing/{types,policy,index}.ts`, `tests/sourcing.test.ts`), cherry-picked as `82dbfa29`.

Checkpoint SHAs:

| Checkpoint | SHA | Scope |
|---|---|---|
| kernel cherry-pick | `82dbfa29dde40c59357cc88b4480f3c6a1abc7f1` | prepared kernel applied |
| 1 | `530ff67c20cec48c18e81fd5a5fe71eb4eb7d5b5` | single sourcing authority integrated |
| 1b | `71eed968c55d56487b183d8bb8694ac615dc556d` | fail-closed + provider-approval invariants |
| 2 | `266b3db8e24c6435a62647c708627908c4a0e7bc` | persisted + UI sourcing truth |

Complete and verified:

- [x] exactly one canonical sourcing authority: `lib/sourcing/policy.ts::evaluateSourcingPolicy`;
- [x] the duplicate M1 MAKE/BLOCKED rule removed from `lib/objective/planner.ts` (not left beside the canonical policy);
- [x] Objective layer consumes it through a thin adapter with no rule of its own: `lib/objective/sourcing.ts::decideObjectiveSourcing`;
- [x] authoritative rule: all resources controlled → MAKE; missing + every missing has an approved path → BUY; missing + any lacking a path → BLOCKED;
- [x] missing worker ≠ BUY; model cannot choose the decision and cannot approve a provider path (test-enforced, including that the spine never passes provider paths in and `vPlannerProposal` has no decision/provider/pathId field);
- [x] factual inventory is the sole ownership authority; catalog `ownership` metadata never implies control (test-enforced);
- [x] `ResourceClass` identity allow-list is an exhaustive `Record<ResourceClass, true>`, so a new class that is undeclared is a compile error; identity-sync tests pin the kernel set to the catalog vocabulary and keep identity distinct from ownership;
- [x] unknown/tampered identities and empty requirements fail closed (never MAKE), including identities injected directly past `validateModelProposal`;
- [x] decision + reason code + named missing resources + approved provider paths persisted on the objective plan (`convex/objectiveValidators.ts`) and rendered truthfully by the Objective Workspace (display-only; no payment UI);
- [x] deterministic: same inputs → same output (test-enforced).

**Adaptation found by verification, not by the cherry-pick:** the prepared kernel imported
`@/lib/workforce/types`, but `convex/tsconfig.json` defines no `paths` mapping, so that alias does
not resolve in the Convex compilation unit. Proven with a throwaway `convex/` probe (`TS2307`),
fixed with relative type-only imports per M1 convention. A clean cherry-pick apply is not semantic
proof; the prep branch was based on an earlier M1 SHA.

Not in M2 scope, deliberately absent: payment, wallet, signing, x402, provider calls, receipts,
payment-lifecycle state, provider result/receipt state. `ApprovedProviderPath` means only that the
application knows an approved acquisition route exists.

Remaining gate (acceptance items 11–12):

1. canonical scenario must be selected at the 18 Sep 12:00 SGT gate;
2. then wire only that scenario's capability/resource requirements;
3. prove a **real MAKE** through the accepted M1 machinery (validated capability → MAKE → That Guy
   → bounded WorkContract → real worker execution → evidence/result), not a stub;
4. expose at least one **genuine BUY** with a named missing resource and a real approved provider
   path — recorded, not paid.

Do not invent a scenario or provider to close M2. Do not start M3 while this gate is open.

Checks run at this checkpoint (observed):

- `npx tsx --test tests/sourcing.test.ts` → 19/19; `tests/sourcingSeam.test.ts` → 14/14; `tests/ui.test.ts` → 13/13;
- M1 regression + sourcing focused set `tests/sourcing.test.ts tests/sourcingSeam.test.ts tests/objective.test.ts tests/planner.test.ts tests/workforce.test.ts` → **81/81**;
- full suite `npx tsx --test tests/*.test.ts` → **118/118 pass**;
- `npx tsc --noEmit` clean; `npx tsc -p convex/tsconfig.json --noEmit` clean;
- Convex validator ↔ TypeScript coupling proven by a temporary added-field probe (it broke the
  typecheck as expected, then was reverted); no generated files hand-edited.

## Immediate next milestone

# M1 — Objective spine + active MAKE *(ACCEPTED — retained below as the M1 record)*

Target: **17–18 Sep**

M1 is **one project milestone**. Internal implementation checkpoints are allowed; do not create M1.1/M1.2-style milestone sprawl.

Objective:

> Turn the inherited Somebody worker/reliability architecture plus the OKX workforce kernel into a real dynamically assembled internal capability on a fresh current-project backend.

### Build scope

#### Fresh current backend

- create a fresh Somebody-OKX Convex project/deployment;
- design only the current Objective/WorkItem operational state required for M1;
- reuse Convex patterns, not old deployment/schema baggage;
- no migration from `acrobatic-swan-765`.

#### Objective → capability/resource planner

Model proposes:

- controlled capability key;
- bounded responsibility;
- required resource classes.

Application validates:

- capability exists;
- resource classes are recognized;
- proposal matches controlled capability requirements;
- tool permissions cannot exceed capability envelope;
- invalid proposals fail closed.

No spend authority in planner output.

#### Factual company resource inventory

Represent what the company actually controls now.

Do not equate catalog membership with factual availability.

Keep it minimal and scenario-independent for M1.

#### WorkerSpec → WorkContract

Use the existing workforce kernel to create/reuse an `InternalWorker` / `WorkerSpec`.

Create an assignment-specific `WorkContract` that carries the objective, idempotency/authority requirements, required evidence/outputs/effects and completion criteria.

Adapt the inherited `CoreWorkerContract` only as much as current M1 behavior requires. In particular, legitimate evidence-only MAKE work must not need a fake external effect solely to satisfy completion.

#### Role/capability policy

Implement the smallest policy needed for the selected M1 internal role.

It should own work-specific truth/evidence/completion rules. Do not put role semantics into the generic runtime.

#### Active internal agent spawning

Required runtime path:

`WorkerSpec → WorkContract → deliberate model selection → bounded Agent/Runner → allowed tools → execution → evidence/result`

Reuse useful inherited patterns:

- read/act application boundary;
- bounded Zod tool schemas;
- run status;
- lease/stale-run fencing where needed;
- safe provider errors;
- tool-progress requirement;
- activity/event history.

Persistent cross-objective workforce is not required. Objective-local creation/reuse is acceptable.

#### M1 proof quality

The M1 worker must do genuinely useful autonomous work.

A single free-form LLM completion or simple document drafting is **not** sufficient.

Require multiple meaningful tool-mediated observations/actions appropriate to the role, ideally across at least two distinct information sources or resource classes.

Persist enough evidence/provenance to show what the worker actually used/did.

Application/domain policy, not the model, decides whether the work is complete.

#### First current-product surface

Render real persisted current-product state from the fresh backend.

Minimum visible information:

- founder objective;
- capabilities/resources;
- MAKE reasoning;
- That Guy creation/reuse;
- worker status/activity;
- evidence;
- worker result/outcome.

Reuse Somebody/Mission-Control visual direction where useful. Do not build a procurement dashboard, giant graph, permanent org chart or agent-chat theater.

## M1 acceptance criteria — PASS (see "M1 ACCEPTED" above)

PASS only when one bounded objective can:

1. enter the fresh current Objective runtime;
2. produce an application-validated capability/resource plan;
3. prove required resources are factually available for MAKE;
4. resolve/create an internal worker through `lib/workforce/`;
5. bind that worker to an assignment-specific WorkContract;
6. select an execution model deliberately;
7. instantiate a real bounded agent;
8. expose only tools allowed by WorkerSpec + WorkContract;
9. perform nontrivial tool-mediated work;
10. persist meaningful evidence/result/activity;
11. reach completion only when application/domain policy says proof is sufficient;
12. render meaningful real state in the current product surface.

No BUY required yet.

### M1 deployment blocker — RESOLVED (was: founder action required, recorded 17 Sep 2026)

The founder authenticated `npx convex dev` against `clean-tapir-151` and set the
deployment env vars; see "M1 ACCEPTED" above and `BUILD_DELTA.md` §3.6 for the live
proof this unblocked. The original blocker record is kept below for provenance.

Creating the fresh Somebody-OKX Convex deployment requires Convex platform
authentication that is not available in the build sandbox. The following exact
commands were attempted and failed as shown (no deployment was created, no success
is claimed):

```
$ npx convex dev
✖ No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project

$ npx convex codegen --typecheck=disable
✖ No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project

$ CONVEX_DEPLOYMENT=dev:<name> npx convex env list
✖ Error fetching GET https://api.convex.dev/api/deployment/<name>/team_and_project
  401 Unauthorized: MissingAccessToken: An access token is required for this command.
  Authenticate with `npx convex dev`
```

R1 re-verification of the boundary (so the founder action is not guesswork):

- `~/.config/convex` and `~/.convex*` do not exist — no credential store to reuse;
- `https://dash.convex.dev` is unreachable from this sandbox (no HTTP response);
- no `CONVEX_DEPLOYMENT` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` in the environment;
- `npx convex deployment list` is **not** a valid subcommand — `deployment` supports
  `select`, `create`, `token`, `usage`, `usage-limits`. Use `create`, not `list`;
- there is no standalone `npx convex login` command in this CLI version either —
  authentication is initiated by `npx convex dev` (which opens a browser);
- there is no local Convex runtime fallback here: no Docker daemon is available, so
  `npx convex dev --local` cannot substitute for the authenticated cloud path.

Minimum founder action (one authenticated machine with a browser; commands verified
against the installed CLI's own help output):

1. Create and select the fresh dev deployment — never reuse `acrobatic-swan-765`:
   `npx convex dev --team <team-slug> --project somebody-okx --dev-deployment somebody-okx-m1`
   (interactive alternative: plain `npx convex dev`, accept the create-project prompt,
   and complete the browser login it starts). This writes `CONVEX_DEPLOYMENT` and
   `.env.local` (`NEXT_PUBLIC_CONVEX_URL`) and regenerates `convex/_generated/`,
   replacing the hand-maintained stand-in.
   Equivalent explicit form: `npx convex deployment create dev/somebody-okx-m1 --type dev --select`.
2. Push functions and confirm codegen replaced the stand-in, then re-check types:
   `npx convex dev --once` (or `npm run convex:codegen`), followed by
   `npm run typecheck && npm run typecheck:convex`.
3. Set the deployment env vars so scheduled runs can reach the provider:
   `npx convex env set LIVE_AI_ENABLED true`, `AI_PROVIDER`, `AI_MODEL` (a tool-capable
   model), and the matching `OPENAI_API_KEY` or `OPENROUTER_API_KEY`. Keys go to the
   deployment environment, never into git or logs.
4. Run the single bounded live smoke and one cheap negative proof (see below) against
   that deployment — `npm run dev` and submit one objective in the Objective workspace.
5. Record the observed evidence in `BUILD_DELTA.md` §5 with the deployment name, and
   delete the stand-in caveat from §3.5 / §5 / README once real codegen is committed.

Until that smoke runs, criteria 1, 3, 10 and 12 are verified by focused tests and
typechecks but **not** by a live deployment; this is recorded honestly in
`BUILD_DELTA.md` §5 and in the R1 checkpoint above.

#### The two live proofs — RUN, see "M1 ACCEPTED" above and `BUILD_DELTA.md` §3.6

1. **Bounded live smoke (exactly one):** fresh deployment + real model, submit one
   objective in the Objective workspace → server planning chooses the role-satisfying
   capability set → MAKE decision → `startRun` → worker calls `read_company_record`
   once and `read_public_web` twice on **distinct** URLs and sees the bounded content →
   `submit_result` → the application verifies distinct application-observed proof →
   `finishRun` → durable state shows `completed` → the UI shows **Accepted** from the
   read model, not from a client-side guess. Capture the deployment name, objective key,
   evidence ids and `sourceId`s; no secrets.
2. **Cheap negative proof (one):** a run whose public observations are the same URL
   twice (or a notes-only run) must end **not accepted**, with the unmet distinct-source
   reason visible in durable state and in the UI. This is the check that the blocker
   fixes hold against a live model rather than only against an injected scripted one.

## M1 test/evidence hierarchy

1. **Focused changed-behavior tests** — planner validation, resource inventory, WorkerSpec/WorkContract boundaries, role policy, permission/tool materialization, completion behavior.
2. **Direct seams** — Agent/Runner with injected test model; fresh Convex persistence/read model; run/fencing behavior if touched.
3. **Risk-specific checks only if needed** — no broad inherited-provider testing unless reused by M1.
4. **One bounded live Development proof** on the fresh Convex deployment after focused evidence passes.
5. Broader cumulative/build/typecheck gate only at the justified M1 checkpoint, not after every edit.

Historical inherited tests are evidence of the old baseline, not a requirement to preserve unrelated legacy behavior.

## M1 non-goals

Do not yet implement:

- final canonical scenario-specific worker catalogue;
- full Make-vs-Buy policy;
- marketplace discovery/ranking;
- OKX payment code;
- real BUY provider adapter;
- wallet/signing integration;
- cross-objective persistent workforce;
- multiple simultaneous workers unless M1 genuinely requires them;
- generic workflow DSL;
- visual polish/animation;
- old procurement compatibility work for its own sake.

## Next milestones after M1

- **M2 (18–19 Sep):** canonical scenario MAKE path + deterministic Make-vs-Buy policy.
- **M3 (19–20 Sep):** generic safe OKX buyer rail on X Layer Testnet / Mock Merchant.
- **M4 (20–21 Sep):** selected real provider + full backend E2E.
- **M5 (21–22 Sep):** product-surface/story hardening + first complete backup video.
- **M6 (23 Sep):** release candidate + promotion gate.

## Evidence discipline

- Check items only after evidence passes.
- Run focused tests before broader checks.
- Never claim live OKX call/payment/confirmation/deployment/persistence without observing it.
- Keep mock/testnet/mainnet visibly distinct.
- Update `BUILD_DELTA.md` at each accepted milestone with exact SHA and evidence.
- For cloud coding agents, require meaningful checkpoint commits/pushes rather than one giant unreviewable final commit.

## Cut order if schedule slips

1. marketplace discovery/ranking;
2. second provider;
3. cross-objective persistent worker reuse;
4. multiple internal workers;
5. broad capability ontology;
6. fancy worker visualization;
7. UI animation;
8. flexible arbitrary decomposition.

Do NOT cut:

- active MAKE execution;
- justified BUY decision;
- actual OKX integration;
- spend/payment safety;
- external result verification;
- final synthesis;
- understandable working demo.
