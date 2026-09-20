# M6.1 — Manager–execution mini-refactor

Date: 21 September 2026 (Singapore)
Status: **APPROVED DIRECTION / IMPLEMENTATION PLAN — NOT IMPLEMENTED OR ACCEPTED**
Repository: `dropandresetmain-prog/somebody-okx`
Code base: `fix/m6-1-causal-pipeline@07230355c0000d294be32aa6bf08a2200631d3e2`
Planning branch: `docs/m6-1-manager-execution-plan`
Suggested implementation branch: `refactor/m6-1-manager-execution-loop`

## 1. Mission and authority

Implement the smallest coherent production loop that demonstrates Somebody deciding what to MAKE or BUY, executing that action, interpreting the result, and continuing until it delivers a saved, evidence-backed recommendation. Do not ship another isolated fix or introduce a scripted demo engine.

The founder requested this bounded redesign after repeated M6.1 failures. This plan is a narrow exception to the 20 September architecture freeze. Its explicit supersessions below govern the new execution path; unchanged security, payment, provenance and release decisions remain binding. It describes intended implementation, not existing behavior or proof of acceptance.

**Immediate assignment: finish Gate 1.** Gate 2 describes the subsequent release path; it does not authorize a live acquisition or silently enlarge this implementation assignment.

### Verified starting state

- Remote recovery head was `07230355c0000d294be32aa6bf08a2200631d3e2`; parent `9ca33ea3a79a12686802202218a97bad7a295b9b`.
- Remote `main` was `2bc3e06a60e32fe5e987b1dced35627f7dae2827`. Recovery was 32 commits ahead, zero behind; merge base was that exact main SHA. Do not start from main and lose the recovery work.
- `0723035` already maps document drafting to the materializable artifact tool and checks unrealizable grants. Do not repeat that repair.
- M3/M4 integration and M5 acceptance establish their recorded subsystem scope, not a successful complete M6.1.
- The preserved recovery ledger records a free-model run reaching simulated acquisition and dependent dispatch, then failing to consume the result. A later paid-model STOP A1 failure is reported in the planning conversation; its complete transcript was not independently re-read for this plan. Neither establishes M6.1 acceptance or a controlled model comparison.
- This planning pass inspected remote code/docs. No local founder worktree, stash, deployed environment, live test or payment was verified. The implementer must inspect those locally without printing secrets.

Read first: `docs/work/ACTIVE_TASK.md`, this plan, and the latest entry in `DECISIONS_LOG.md`. Then inspect the files in section 6 and the relevant sections of `ARCHITECTURE.md` / `MASTER_PLAN.md`. Consult `docs/work/M6_1_PRE_REFACTOR_RECOVERY_HISTORY.md` for a specific historical incident, not as the next-action runbook.

## 2. Lock the outcome; let the route adapt

Retain the canonical founder objective in `lib/objective/seedData.ts`: diagnose weak launch messaging and prepare a better relaunch within an approved limit.

The minimum deliverable is one persisted relaunch recommendation containing:

- a diagnosis supported by the actual available evidence;
- usable revised headline/message, with a substantive versioned artifact change;
- why that direction was chosen and which observations informed it;
- material assumptions, unresolved questions and the recommended next action.

No public posting, purchase #2, proven conversion improvement or fabricated private analytics is required. Unknowns can be disclosed when they do not defeat the agreed deliverable; they must not be silently invented away.

The intended demonstration is internal assessment → useful acquisition when justified → evidence-informed internal revision → final recommendation. This is an acceptance example, **not a route encoded in the runtime**. A different defensible order is valid if both branches do real work and the acquired result causally informs the delivered recommendation. A supplied-evidence variant must be able to finish without an unnecessary purchase.

```text
Objective + accepted output criteria + company facts + authority
    → Somebody proposes the next bounded action
    → application grounds options and authorizes one
    → MAKE assignment OR BUY intent
    → persisted output / input request / classified failure
    → Somebody reassesses fresh state
    → another bounded action OR completion proposal
    → application checks delivery, evidence and unresolved obligations
```

The finish line is stable. Revising the plan does not authorize downgrading the minimum outcome, silently waiving a required criterion, or changing financial scope.

## 3. Target contracts and explicit design changes

### A. Separate outcome criteria from action receipts

Keep `OutcomeContract` and a small set of genuine output requirements as the founder-facing acceptance contract. For this scenario, diagnosis, revised message and evidence/limitations are enough; planning substeps should not each become mandatory mini-projects.

Use existing `ManagerialDecision`, `Assignment`, `WorkContract` and `ExecutionIntent` records for the next authorized action. Reuse those storage seams rather than add an `actions` database or another orchestration framework. Add only fields that the concrete boundary needs, with validators and documented compatibility.

Outcome proof follows the accepted deliverable. Action proof follows the operation actually authorized. Neither is inferred solely from possession of a permission or the chosen MAKE/BUY label.

An analysis assignment can deliver a persisted analysis. A drafting assignment must deliver its specified saved artifact. A verified BUY closes an acquisition action; it cannot by itself satisfy a relaunch-recommendation requirement. An explicit input-only requirement may be resolved by an appropriately scoped, relevant verified acquisition, but the output requirement remains open.

Remove the assumption that selecting another strategy rebuilds the meaning of the founder's success criteria. Do not blindly generate proof obligations from whichever capabilities the model chose. Preserve fresh-proof recomputation at completion, adapted to the new output contract rather than disabled.

### B. Give semantic judgment to Somebody, not to string heuristics

Somebody assesses relevance, evidence adequacy, the value of additional research, the strongest eligible alternative and whether the deliverable meets the outcome. Persist concise decision summaries and evidence references, not private chain-of-thought.

The application establishes source existence/access, provenance, provider compatibility, permission, price/term provenance, current approval, budget, revision, identities and concrete effects. It validates model proposals against those facts.

Separate **access/availability** from **adequacy for the question**. Source counts, text length and keywords cannot prove a business diagnosis. `NOT_AVAILABLE`, `UNREAD`, invalid reference, provider failure and a model's evidence-linked uncertainty are distinct. A timeout or worker failure never manufactures scarcity.

A structured evidence-gap proposal should identify the unanswered question, relevant observed sources, why they are insufficient and how new information could change the result. Application validation checks real references, scope and compatible ways to answer it. It must not accept arbitrary model prose as acquisition authority or require the model to manufacture an application `NOT_AVAILABLE` token for a semantic gap.

BUY can be recommended for justified quality/time/value advantage even when MAKE is feasible. It need not wait for a failed worker. Conversely, a listed provider does not force BUY. Compare grounded options through the existing authorization kernel, retain unknown costs as unknown, and never invent comparative prices or quality guarantees.

Supply factual grant limits/scope as needed rather than hiding the bound and then resolving arbitrary money questions by keyword matching. A present grant does not resolve an unrelated material ambiguity or widen permitted spend. Keep every effect subject to the current grant recheck.

### C. One worker submission surface; automatic bookkeeping

Build a bounded input package from permitted company records, the current target artifact, accepted prior action outputs and explicitly linked verified acquisitions. Include source IDs, versions, provenance and truncation indicators. Application-loaded context is an application read, not a fictional worker tool call. Treat all source/provider content as untrusted data.

The worker gets one assignment, concrete expected output, actual permitted tools and limits. Do not make it repeatedly list/read known context, create a mandatory note after every observation, or invoke `request_completion` after it has already delivered its result.

Evolve the existing `submit_result` boundary into one tagged terminal submission (names below are illustrative; align actual fields with existing types):

| Result | Meaning | Application consequence |
| --- | --- | --- |
| `DELIVERED` | Persisted analysis or specified artifact output, evidence refs and uncertainties | Validate concrete output, finish this action, wake Somebody; do not complete the Objective |
| `NEEDS_INPUT` | Evidence-linked unanswered question/resource request | Persist the proposal, yield the action, wake Somebody; do not auto-BUY |
| `EXECUTION_ERROR` | Execution could not finish | Application classifies failure/retryability; persist one bounded recovery outcome |

Do not let the model classify its own spend authority or guarantee retry safety. Existing `request_resource` / `request_completion` callers may delegate to the same application-owned implementation for compatibility; they must not remain additional mandatory steps or competing completion authorities on the new path.

Reading tools persist observations automatically. Optional notes are not proof. Empty risk/unknown lists are valid when warranted; do not require invented filler. Writing is mandatory only for a writing assignment. Resolve the exact permitted artifact target from the action contract, not the first artifact in an array.

Tool outcomes must be typed (`accepted`, `refused`, `unavailable`, `stale`, `transient_error`, or equivalent). Never detect success/repeated failure by searching error prose. Prevent further material actions after a terminal result/yield. Identical refusals must reach the bounded stop, including `Completion refused` cases.

Reserve room for delivery in the worker budget. After nonterminal tool work is exhausted, either obtain the bounded terminal report within the existing limit or record a truthful execution failure. Do not manufacture a result, silently switch models, increase ceilings merely to pass, or cycle on forced tool use. Demonstrate that the supported happy path fits its limits.

### D. One current action, then return to Somebody

For newly created refactor objectives, allow at most one in-flight internal assignment or external intent per Objective. Recheck and reserve that fact atomically at dispatch; duplicate/concurrent wakes cannot authorize duplicate work. Reuse existing leases, fencing, stable identities and reservations.

Do not offer HYBRID as a compound execution option on this new path. A hybrid plan becomes a BUY and a separately reassessed MAKE (or the reverse), each with its own authorization. Do not relabel a model-selected HYBRID as MAKE or BUY after recommendation. Retain historical HYBRID schemas, receipts and read support; do not rewrite old intents or retrofit failed live objectives to the new protocol. Before deployment, account for old scheduled/in-flight work through existing pause/isolation mechanisms. Use a minimal version discriminator if needed to reject incompatible legacy dispatch; do not reset or discard ambiguous M3 attempts, which remain subject to reconciliation.

Select current execution by Objective, accepted revision and authorized decision/attempt identity. Previous assignment states and `lastDeliveryFailureClass` are historical facts, not current blockers. Persist result/close-or-yield/wake consistently through the existing transactional/scheduler boundary. A duplicate terminal submission is idempotent; a stale run cannot write current output.

A verified acquisition returns to Somebody, not directly to a forced worker/next strategy. The next MAKE action may explicitly consume that earlier acquisition. Validate the dependency across action/requirement keys: same Objective, compatible current contract scope, actual verified intent/result, relevant request/purpose and exact evidence ID. Merely sharing a broad resource class is insufficient, and a new action ID must not make legitimate prior evidence disappear.

Do not buy an already-covered request again. Distinguish that from a different legitimate question in the same resource class. Failed/ambiguous financial attempts are reconciled by M3, never retried under a fresh ID to bypass uncertainty.

Keep waits quiescent. A timer is not semantic progress or an invitation to re-run the model. Material accepted results refresh relevant continuation state before evaluating no-progress; no budget reset or historical counter laundering. Persist compact action/model/tool outcomes and the final reason so the next failure is diagnosable without private reasoning or secret-bearing logs.

### E. Final assessment and M5 visibility

Somebody makes a bounded semantic assessment against the locked deliverable. Store its conclusion and references to the exact final artifact version. The application independently checks current contract/version, output existence, valid evidence references, genuine mutation, required resolutions and absence of unresolved mandatory effects/resources.

A receipt alone, source count alone, irrelevant version bump, stale result, model assertion or forged satisfied row cannot pass. One bounded revision after a specific critique is reasonable; unlimited reviewer/worker debate is not. Any bound must remain within Objective budgets and be recorded by the implementer.

For the canonical acquisition test, prove that a specific returned finding materially informs the final message. Reference validation proves identity, not semantic causality; capture the before/after content and a brief explanation of the actual change. Do not require every future artifact to cite every acquisition simply because acquisitions exist.

Keep the accepted M5 visual layout. Adapt only its read model/labels as needed to show decision/alternative, action, useful output, acquisition provenance, resumed work and readable final recommendation. SIMULATION and RECORDED REPLAY remain explicit. No simulated or replayed event may render a new live payment.

## 4. What stays fixed and what is parked

**Keep:** Convex business truth; LangGraph routing; bounded worker execution; persistent That Guy identities and existing REUSE/CREATE discipline; current authorization/eligibility kernel; M3 as sole financial authority; current provider adapters; provenance; stale-revision checks; leases; idempotency; accepted M5.

**Park:** compound HYBRID execution for new objectives, parallel assignments, elaborate optional outcome levels, broader dynamic capability generation, provider breadth, public posting, purchase #2, mobile and UI redesign. Revisit only after repeatable Gate 1 / release evidence, or a specific demo blocker.

**Never cut:** permissions, input validation, effect identity, financial limits, independent transaction reconciliation, real artifact delivery, truthful unknowns and source attribution. Unsigned intent → prepared → signed → submitted → confirmed/finalized (or failed/reverted) remains M3-owned; provider delivery and semantic usefulness remain separate facts.

Do not rewrite the payment stack or introduce a second policy engine. No dependency/framework upgrades, broad database redesign or generic workflow DSL. Unsupported objectives must stop safely; universal business competence is not required.

## 5. Execution as one integrated assignment

Before editing, inspect `git status`, branch/worktrees, HEAD, remote refs and ancestry. Branch from this documentation tip so it includes the verified recovery code. Preserve local/stashed model experiments; do not pop or delete them without identifying ownership. Reconcile any later commits by behavior, not by blindly resetting to this snapshot.

Use three internal work blocks, not three founder approvals:

1. **Align the shared contract.** Trace interpret → grounded decision → dispatch → worker/BUY result → reassess → completion. Record the small chosen field/lifecycle changes and concrete file list in `ACTIVE_TASK.md`; then implement. Do not return another broad redesign proposal instead of code.
2. **Connect and test the whole path.** Implement the manager/worker/result/continuation changes together using production builders and storage. Change the M5 projection only where required. Run focused tests as each changed behavior becomes testable and resolve current-target blockers before a live run.
3. **Accept Gate 1 and hand off release evidence.** Perform one focused review of the changed authority, scope, completion and concurrency seams; fix blockers together. Run the pinned-model fresh-objective demo and an engineering-controlled repeat on the same candidate/configuration. Record exact evidence and stop expanding scope.

One primary owner retains architecture, shared contracts, integration, security-sensitive work and final verification. Cheaper subagents may take bounded independent tests or read-model checks after interfaces are settled; they return findings, affected files, recommended action and evidence only. Do not parallelize edits to unresolved shared contracts.

Keep `ACTIVE_TASK.md` about 50–150 lines, current at each material phase and after compaction. Commit exact files after meaningful verified milestones and push the implementation branch. Reuse valid evidence; do not rerun unrelated checks for reassurance. Continue in one implementation chat while its context is coherent; a new chat reads the ledger and the last evidence summary, not the entire historical archive.

## 6. Implementation map — inspect these seams, not a new subsystem

| Concern | Existing files to inspect/change only as needed |
| --- | --- |
| Stable outcome vs next-action proposal; option choice | `lib/management/{types,contract,interpretation,interpretationContext,proposals,decision,decisionPass}.ts`; `convex/objectiveRunner.ts` |
| Actual tools, worker inputs and one result path | `lib/workforce/{catalog,permissions,workers}.ts`; `lib/worker/{port,runtime}.ts`; `lib/objective/{types,contract,inputAvailability,inputDiagnosis,artifact}.ts`; `convex/objectives.ts` |
| Serial dispatch, current identities, yields/resume, completion | `lib/management/{dispatch,reducer,graph,requirements,completion}.ts`; `convex/{management,objectives}.ts`; `convex/internal/workforce.ts` |
| Storage boundary and compatibility | `convex/{schema,managementValidators,objectiveValidators}.ts`; use explicit migrations if a real migration is needed, never manual production edits |
| Existing BUY seam; linked content and scope | `convex/m3Driver.ts`; existing `lib/management` intent/authorization modules and market adapters; do not replace M3 |
| Scenario data, end-to-end runner and UI projection | `lib/objective/{seedData,policy}.ts`; `scripts/m61-physical-e2e.mjs`; `lib/m5/workspaceModel.ts`; `convex/m5Workspace.ts`; only necessary `app/m5/` bindings |

Existing focused suites include `m61AssignmentRealizability`, `m61InputDiagnosis`, `m61ZeroProgress`, `m61PostAcquisitionResume`, `m61ConsistencyRepair`, `m61FirstProductE2E`, `managementDecisionPass`, `managementDispatchPersistence`, `managementCompletionGate`, and `m4m3IntegrationSeam` (`tests/*.test.ts`). Select the directly affected cases, not this whole list by default.

Old STOP A1/B probes assume a particular failure/BUY trajectory. Replace their role as acceptance gates with the whole-loop runner; retain them as historical diagnostics if useful. Do not require a fake `INPUT_BLOCKED` event merely to satisfy an old probe.

Update superseded assertions only where this plan intentionally changes semantics. Document the replacement coverage. Do not delete valid safety tests or label a current-target failure historical to avoid fixing it.

## 7. Two acceptance gates

### Gate 1 — M6.1 product loop, external boundary simulated

**Automated evidence before live-model acceptance:**

- Full request → interpretation/proposal → production decision/authorization/builders → actual tool handlers/storage → result → reassessment → persisted recommendation → real completion gate. Model responses may be injected for deterministic testing; do not seed authorized decisions, satisfied requirements, fabricated observations or pre-completed results in the test that claims to prove that path.
- Canonical external-information case demonstrates both MAKE and BUY and subsequent use of the acquired content. Supplied-evidence variant finishes without an unnecessary BUY. No-offering/denied-budget/unsupported-operation variants end truthfully without fake fulfillment or authority expansion.
- Direct changed-risk coverage: duplicate/concurrent wakes and submissions; stale runs/revisions; historical INPUT_BLOCKED plus fresh valid input; refused completion/no-progress; wrong-scope or unverified acquisition; semantically different requests of the same class; forged satisfied state/missing final artifact. Focus the tests on these changed seams; do not exercise every DB/provider environment.

**Physical evidence:** use one explicitly approved pinned model/provider/configuration. Verify current authorization and model-call budget; a previous paid experiment is not an unlimited grant. No silent free/paid fallback or broad model tournament. Model calls and normal tools run for real; only the external acquisition edge is simulated and labelled.

A small harness may invoke the existing operator-gated simulation after the normal kernel creates the matching authorized intent. It must validate the fixture's request/purpose compatibility and exact Objective/intent, then let ordinary result/wake processing continue. It may not choose the strategy, patch state, inject completion or manually rescue continuation. Keep live M3 execution disabled.

Obtain two consecutive successful fresh-objective runs on the same code and relevant configuration, with no state patch, founder `continue` rescue, injected strategy or unrelated artifact bump. Do not simulate a payment. Do not spend the founder's time on another broad permutation pass.

Capture: exact SHA and deployment/config identity (no secrets); model; Objective; concise grounded decisions; assignment/intent/run identities; tool outcomes; acquisition request/result/provenance; linked evidence; substantive artifact diff; semantic final assessment; independent gate verdict; and readable M5 outcome. A failure is FAIL/PARTIAL with the precise boundary, not a reset until a lucky run appears.

### Gate 2 — subsequent release record/replay and freeze

After Gate 1, under separate explicit live-execution scope, follow M6.2–M6.4: one genuine useful OKX acquisition through M3; preserve safe immutable provider/service/normalized request, request fingerprint, result/hash/timestamps and real payment evidence; then replay only the matching external boundary while Somebody and workers execute live. No mainnet expansion is implied.

Replay does not generate a new payment or restore spend authority. A materially different request cannot consume the fixture. If compatibility is not established, report the boundary honestly rather than relabel simulation as a recording.

Record Backup Demo #1 immediately when this works. Freeze the exact release candidate and run the canonical promotion gate once, plus only justified risk-specific checks. The repository currently exposes `npm test`, `npm run typecheck`, `npm run typecheck:convex` and `npm run build`; confirm the release runbook and scripts at that time. These are not per-edit commands. Use `npx tsx --test tests/<focused-file>.test.ts` during implementation. This documentation pass ran none of those application checks.

## 8. Triage carried into implementation

| Finding | Classification | Action / blocker / revisit condition |
| --- | --- | --- |
| Output meaning coupled to selected strategy/permissions; excessive worker protocol | **Act Now** | Implement sections 3A–C; blocks Gate 1 |
| Availability confused with business sufficiency; spend-meta heuristic ambiguity | **Act Now** | Separate semantic proposals from application facts; preserve scope/grant checks; blocks Gate 1 on affected path |
| Stale continuation, duplicate effects, weak terminal failure classification | **Act Now** | Implement/test current-action state and typed results; blocks Gate 1 |
| Acquisition receipt without actual downstream use; fixture-heavy false E2E confidence | **Act Now** | Production-chain test plus physical artifact/evidence proof; blocks acceptance |
| Pinned-model behavior and provider compatibility | **Investigate Now** | Qualify the simplified protocol; Gate 1 blocks on model execution, not on live payment availability; genuine provider compatibility gates Gate 2 |
| Already repaired `draft_document` grant mismatch | **Ignore / Accept Risk** | Do not redo it; retain realizability coverage and revisit only if current evidence shows a regression |
| Compound HYBRID, parallelism, broad capability/marketplace expansion, public posting | **Park for Later** | Not needed for the core demo; revisit after release or on a concrete blocker |
| Universal correctness for arbitrary prompts | **Ignore / Accept Risk** | Accept limited competence, not unsafe effects, infinite loops or fabricated completion |

## 9. Completion report

Report PASS / PARTIAL / FAIL against **Gate 1**, not against a count of files or passing unit tests. Include starting/final branch and SHA, exact changed files/behavior, focused tests and observed physical runs, unresolved findings with the four triage labels, docs updated, push/deployment state, remaining risks and the next single step.

Reconcile `ARCHITECTURE.md`, `MASTER_PLAN.md`, `DECISIONS_LOG.md`, relevant runbook and `ACTIVE_TASK.md` to what is actually implemented at the verified milestone. Preserve historical evidence. Do not mark the mini-refactor or M6.1 complete before the physical acceptance evidence exists.
