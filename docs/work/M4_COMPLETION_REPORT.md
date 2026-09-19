# M4 COMPLETION REPORT — Generic Somebody Management Engine

Date: 19 September 2026
Branch: `feat/m4-management-engine`
R3 review SHA (exact): `59f75f7` (ledger commit recording it: `e6af324`)
Accepted base: `main@1fa7962d9ef0d359951d14993834d1d419a5c980`

---

## 1. Executive summary

The generic Somebody Management Engine (Management Protocol v1) is implemented on one M4 branch across checkpoints CP1–CP7, with no milestone split. Somebody now runs as a persistent managerial identity: founder objectives become governed Outcome Contracts with Requirements, decisions are grounded/eligible/recommended/rechecked deterministically, execution flows through bounded That Guy runs over a persistent reusable workforce, and completion is decided only by an independent application gate. Scenario coupling has been removed from the runtime; the engine is fully generic in role, prompt, and control state. Full test suite: 404 pass / 0 fail; both TypeScript programs (`tsc --noEmit`, `tsc -p convex/tsconfig.json`) clean.

## 2. Scope delivered

- Domain-truth kernels: Outcome Contract / Outcome Levels / minimum completion bar; Requirement identity, revision, priority (required/supporting), lifecycle; governed proof kinds; satisfaction semantics; independent completion gate; deterministic authorization recheck; staffing; budget; grounded options + eligibility (CP1).
- Managerial decision protocol: ground → hard eligibility → comparable facts → LLM recommendation among eligible options only → deterministic recheck → strategy binding with proof attachment (CP2).
- Persistent workforce: 8 new Convex tables + validators + authoritative internal mutations; reuse-first staffing on the real worker inventory; dynamic semantic CapabilitySpec definition that cannot invent real authority (CP3).
- LangGraph management loop: frozen small graph state, pure-kernel delegation, wake-driven passes, quiescent states, coherence invariant on every reduce (CP4).
- Recovery / Cutoff 2: typed termination for malformed model output, hostile providers, budget ceilings, replay storms, nonsense prompts — never exceptions, never hallucinated authority, never fake completion (CP5).
- External seam: authorization-only ExecutionIntent, small monotone intent lifecycle, MOCK-labelled buyer-rail fixture, provider events → wakes on shipped handlers (CP6).
- Runtime integration and scenario decoupling: capability-derived roles, persistent worker REUSE fix, request_resource → wake, wake-scheduler wiring, run-finish → completion-gate proposal, production Convex-backed ManagementPorts adapter (CP7).

## 3. Architecture conformance

- LangGraph = continuation only: `GraphAnnotation` is field-for-field the frozen `GraphState` (ids/cursors/pass); business rows never ride graph channels; every consequential node reloads Convex fresh through `ManagementPorts`.
- Convex = authoritative business state: all M4 truth lives in the 8 M4 tables plus the objective aggregate; the graph holds zero state between invocations.
- `@openai/agents` = bounded That Guy execution: unchanged `lib/worker/**` port/runtime seam; a genuine Runner continuation across a wake is proven in `tests/managementWorkerContinuation.test.ts`.
- M3 buyer rail = sole payment authority: M4 intents stop truthfully at the boundary (`awaiting_m3`, boundaryNote "no payment was attempted or made"); the mock rail self-describes as MOCK and refuses to fake hand-off.

## 4. Management protocol conformance

All 16 approved product decisions are enforced in code, not convention. Key structural guarantees: the model proposes semantics but only `buildOutcomeContract`/`buildRequirement` produce governed rows; proof attachment is strategy-derived (a BUY cannot name artifact proofs, a MAKE cannot claim external verification); material ambiguity always routes to the founder; the reducer's single authorship of control state; Somebody proposes completion and only the gate accepts.

## 5. Scenario decoupling (CP7)

- `selectRoleKeyForRequest` (keyword routing over "launch"/"growth"/"convert") deleted. Role is derived from the validated capability envelope's granted permissions (`roleKeyForGrantedPermissions`, single authority in `lib/objective/planner.ts`, imported by `convex/objectives.ts`); derived roles still enforce M1 evidence-class satisfiability.
- The execution-order prompt (`lib/worker/runtime.ts`) is contract-derived: tool lines from granted permissions, order steps from the assignment, proof lines from `contract.sourceProofs`. No scenario vocabulary, no role-keyed branches, no permission-keyword completion extras. `toolUseBehavior` (application-owned completion) unchanged.
- Growth completion extras removed from `readWorkerObservation` and `finishRun`; the artifact obligation is expressed as governed proof kinds checked by the gate.
- Domain data remains in `lib/objective/policy.ts`, `lib/workforce/catalog.ts`, `lib/market/registryData.ts` — data, not control flow.

## 6. Persistent workforce and REUSE

The M2 defect `resolveWorker({inventory: []})` is fixed: `planObjective` reads the real `workers` Convex table as the inventory and persists newly created workers, so a capable+available worker is genuinely reused across objectives and runs. Reservation is lease-fenced (`canAcceptReservation` with replay tolerance — a CP6 lane-defect fix), release is owner-fenced, and verified-assignment history accumulates on the worker identity. Dynamic CapabilitySpecs validate against existing governed primitives; `authorize_external_spend` and worker→worker creation are structurally impossible.

## 7. Wake discipline and event flow

Worker-originated and rail-originated signals both converge on the same wake plane: `planWakeForResourceRequest` (`request_resource`), `planWakeForWorkerResult` (run terminus), `planWakeForRailEvent` (provider events) — all with sha256-derived eventIds and fact-derived dedupeKeys, all persisted through the shipped `appendWakeEvent` (dedupe by `by_dedupe` index), all consumed via the `consumedAt` cursor. Wake-scheduler wiring (CP7): stored events schedule `internal.management.runManagementPass`, which invokes the graph once per wake; redelivery is harmless by construction. A finished run is NEVER satisfaction — `requirements.ts` refuses `assignment_run_finished`; the wake only hands Somebody a pointer.

## 8. Completion semantics

Central rule enforced and tested: run stopped ≠ assignment complete ≠ requirement satisfied ≠ objective complete. Only `attemptRequirementSatisfaction` can set "satisfied", only with current-revision proof-bearing resolutions; candidate rejection, strategy authorization, buy-proposal rejection and run-finish can never satisfy. `finishRun` no longer asserts completion: it records a `completion_proposed` control note (M4-managed rows keep state "executing"; M2-legacy rows keep the historical spine transition so canonical M2 evidence is untouched). `evaluateCompletionGate` re-derives from the current contract revision, the minimum bar, required Requirements with verified proofs, and unresolved effects/resources — and discloses pending supporting work on acceptance.

## 9. Economic semantics

Internal availability is grounded as an ELIGIBLE fact only — it never forces MAKE. The decision pass grounds internal/external/hybrid options, applies hard eligibility (verified source, quote, budget, authority, proof availability), and lets the model recommend only among eligible options; the deterministic recheck re-verifies against fresh Convex truth at authorization time. Zero eligible options yields a typed refusal (the model is not consulted), never a silent MAKE fallback. BUY inside a founder-granted bound authorizes; outside it routes to approval.

## 10. Cutoff 2 robustness

Typed termination everywhere: 17 hostile recommendation shapes produce typed refusals with zero throws; budget ceilings (decisions 40, model calls 60, worker attempts 3/requirement, intent retries 2, elapsed 45m, spend $1, no-progress 3) all return typed verdicts that route to recovery/escalation/waiting — never exceptions; replay storms (identical envelope ×10) collapse to one worker key and one option id; stale revisions refuse; duplicate wakes consume to no-op turns; nonsense prompts terminate coherently. A hostile row reading "satisfied" still fails the gate when no proof is verified.

## 11. Test evidence

Full suite: **404 tests, 404 pass, 0 fail** (`npm test`). New CP7 suites: `managementWakesPersistence` (4 — wake determinism, pointer-not-payload, shipped-handler dedupe round-trips), `managementFinishGate` (5 — proposal-not-assertion, M4-managed vs M2-legacy branches), `managementAdapterPersistence` (6 — all 17 ports over real handlers, run-finished refusal, no-contract gate rejection, typed planning outcome). Historical evidence preserved: `canonicalM2` (75), `runLifecycle`, `objective`, `worker` — untouched and green. Targeted regression set at CP7: 160 pass. All tests run; none claimed unrun.

## 12. Type-check and build evidence

- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx tsc -p convex/tsconfig.json --noEmit`: clean.
- `convex/_generated/api.d.ts` was manually completed (codegen is offline-gated in this environment, 401 without deployment auth): the stub adds the `management` and `internal/workforce` module entries with the verified folder→path mapping (`internal.internal.workforce.*`, `internal.management.*`).

## 13. Commits and checkpoints

| Checkpoint | Commit(s) |
|---|---|
| CP1 domain kernels | `27128d6` (+ ledger `34a65cb`) |
| CP2 decision protocol | `51b1e13` (+ ledger `81825cc`) |
| CP3 workforce + reducer | `df4fdd5`, `dc3a9b7` |
| CP4 LangGraph loop | `76fedd5` (+ ledger `94da7ac`) |
| CP5 Cutoff 2 | `3e8479e` (+ ledger `572031c`) |
| CP6 external seam | `c120911` |
| CP7 runtime integration | `59f75f7` (+ ledger `e6af324`) |

All committed to `feat/m4-management-engine` and pushed to origin. Files were staged explicitly at every checkpoint; `git add .` was never used.

## 14. Known limitations (truthful)

- No production contract/requirement writer yet: `loadContract`/`loadRequirements` return empty until a founder-facing interpretation path creates Outcome Contract rows; the M2 WorkContract spine and the M4 OutcomeContract are deliberately distinct shapes.
- The recommendation seam defaults to a deterministic non-model recommender (returns null ⇒ typed refusal); the OpenAI-backed recommender is injected at the call site when enabled. `externalAuthority` defaults to `m3_unavailable`.
- Live registry discovery feeds the decision pass as data via the CP2 sourcing seam; the adapter's `grounding.discovered` is empty until that seam is wired to the pass.
- Grounded options and completion verdicts are stored inside `managerialDecisions.data` (JSON-encoded in `coarsePlanSummary` because the frozen validator is strict); functional and round-trip tested, but a validator widening would make them first-class fields.
- `ObjectiveRecord`'s TypeScript type does not yet declare `management` (the Convex validator accepts it); finishRun reads it through a documented cast.

## 15. Boundaries respected

No payment, provider, mainnet, or live-spend code was written or claimed; no M3 state machine was duplicated; M1/M2 historical rows and evidence were never rewritten (architectural note: superseded planning assumptions do not rewrite accepted history); LangGraph never became business truth; model output never granted permission, spend, tool, or completion authority; `submitted`/`settled`/`result`/`verified` were never equated.

## 16. Housekeeping performed

- Removed stale worktree `/data/workspace/worktrees/cp3-workforce` and branch `wp/cp3-workforce` after verification: branch fully merged into `feat/m4-management-engine`; every flagged uncommitted file was byte-identical to the branch or a superseded older draft; deleted at `81825cc`. Nothing unique was lost.
- `REPO_ARCHAEOLOGY_M4.md` remains intentionally untracked (working notes, not repo source).

## 17. Risks for R3 attention

- The JSON-in-`coarsePlanSummary` encoding (§14) is the most likely finding; classification anticipated: Investigate Now or Park for Later.
- The adapter's `eligibilityFacts` treat all governed resource classes as controlled — conservative and truthful, but R3 should confirm the intended fact source.
- Dual role-derivation helpers were consolidated to one authority in `lib/objective/planner.ts`; R3 should confirm no other keyword routing survived.
- The `runManagementPass` scheduler entry trusts wake dedupe for idempotency; a duplicate scheduling folds into one pass via the wake cursor, but concurrent schedulings of different reasons can each run a pass (bounded by budget ceilings, and coherent by the reducer).

## 18. What R3 will review

LangGraph ↔ Convex state ownership; economic decisions; requirement/completion semantics; staffing; dynamic capability safety; scenario coupling; resume/recovery; duplicate events; false completion; Cutoff 2 robustness. Every material finding to be classified: Act Now / Investigate Now / Park for Later / Ignore-Accept Risk.

## 19. Terminal status

**M4 MANAGEMENT ENGINE IMPLEMENTED — R3 REVIEW PENDING; PAYMENT-BACKED CUTOFF 1 PENDING M3/R2.**

R3 review target: `feat/m4-management-engine` @ `59f75f7`. No R3 tonight. Cutoff 1 (one causal live trace with integrated sandbox/X Layer Testnet payment) remains blocked on the M3/R2 lane's external blocker; when M3 is accepted, its buyer-rail contract integrates on this M4 branch to complete Cutoff 1 — still M4, not a new milestone.
