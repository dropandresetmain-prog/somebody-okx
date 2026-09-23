# Model Portability Implementation Plan

Status: **SSOT — APPROVED IMPLEMENTATION PLAN, NOT IMPLEMENTED**
Date: 22 September 2026 (Singapore)
Repository: `dropandresetmain-prog/somebody-okx`
Planning branch: `docs/model-portability-implementation-plan`
Base candidate: `refactor/m6-1-manager-execution-loop@122938b6ad6ed1b991a4757f243a4f1560261d76`

## 1. Mission

Make the Somebody M6.1 runtime reliably portable across multiple materially different competent low-cost models, including at least one OpenRouter free model, **without model-specific business logic** and without weakening product semantics, financial safeguards, evidence requirements, or the independent completion gate.

The target property is:

> Somebody should ask models to perform semantic judgment and bounded generation, while the deterministic runtime owns lifecycle truth, legal actions, validation, authority, recovery, idempotency, and completion bookkeeping.

This plan follows the read-only model-portability audit of the current M6.1 candidate. It is deliberately narrower than an architecture redesign.

## 2. Isolation / non-interference

This planning branch is isolated from the physical Engine Acceptance candidate.

Do not modify, reset, merge, or redeploy the physical-acceptance candidate while implementing this plan unless explicitly authorized after that separate acceptance effort is complete.

No production code is changed by this document.

The local implementation worktree should be created from this planning branch, not from a mutable founder worktree:

```bash
git fetch origin
git worktree add ../somebody-okx-model-portability -b build/model-portability origin/docs/model-portability-implementation-plan
```

Before implementation, verify the planning branch still descends from exact base `122938b6ad6ed1b991a4757f243a4f1560261d76` and reconcile any accepted post-audit candidate commits deliberately. Do not blindly reset over later physical-E2E fixes.

## 3. What is already correct and must be preserved

The audit did **not** find a need to replace the management architecture.

Keep:

- Convex as authoritative business truth.
- LangGraph as bounded orchestration / wake routing.
- Model-proposes / application-authorizes.
- Deterministic eligibility and authorization.
- One-current-action serial M6.1 behavior.
- M3 as the sole financial / transaction authority.
- Explicit acquisition verification and scoped evidence linkage.
- Leases, fencing, stable identities, idempotency, reconciliation.
- Independent Requirement satisfaction and Objective completion gates.
- Final semantic assessment as advisory semantic judgment, never completion authority.
- No model-specific MAKE/BUY rules or scenario scripts.

Do not weaken proof, authority, scope, stale-revision, payment, or completion checks merely to make a weaker model pass.

## 4. Findings register

Every audit finding is triaged here. This document is the SSOT for implementation scope.

| ID | Classification | Finding | Blocker for portability gate? | Primary affected seams |
| --- | --- | --- | --- | --- |
| F1 | **Act Now** | Resource-request refusals can be returned as prose and wrapped as `accepted` | **Yes** | `convex/objectiveRunner.ts::makeConvexPort.wrap`, `actCommand(request_resource)`; `lib/worker/runtime.ts` |
| F2 | **Act Now** | Unconfirmed / refused worker diagnostics can appear in manager context as `latestAcceptedWorkerOutput` | **Yes** | `convex/objectives.ts::submitResult`; `convex/internal/workforce.ts::readDecisionContext` |
| F3 | **Act Now** | `DELIVERED` can seal the terminal slot before deterministic action obligations are checked | **Yes** | `convex/objectives.ts::{submitResult,finishRun}`; `lib/worker/runtime.ts` |
| F4 | **Act Now** | Evidence-gap reporting exposes redundant legacy/new fields and competing affordances | **Yes** | `lib/worker/runtime.ts`; `convex/objectiveRunner.ts`; `convex/objectives.ts`; `lib/objective/inputDiagnosis.ts` |
| F5 | **Act Now** | Model retries are bounded but insufficiently corrective; provider/schema failure can consume substantive assessment allowance | **Yes** | `convex/objectiveRunner.ts`; `convex/management.ts`; `lib/management/{modelBoundary,proposals}.ts` |
| F6 | **Act Now** | Serialized JSON is sliced after serialization, risking malformed/incomplete manager context; final assessor can see only a prefix of the artifact | **Yes** | `convex/objectiveRunner.ts`; `convex/internal/workforce.ts` |
| F7 | **Act Now** | Model schemas require unnecessary identity reproduction and under-specify legal bounded values | No alone; high-value portability fix | `convex/objectiveRunner.ts`; `lib/management/proposals.ts` |
| F8 | **Act Now** | Final assessment silently defaults malformed evidence refs and conflates application observation provenance with content trust | **Yes** | `convex/objectiveRunner.ts::proposeFinalSemanticAssessment`; `convex/objectives.ts` |
| F9 | **Investigate Now** | Contract decomposition and cross-action context may be unnecessarily lossy / over-complex | Investigation required | `interpretWithOpenAI`; `lib/management/{interpretation,decisionPass}.ts`; `convex/internal/workforce.ts`; `convex/objectives.ts` |
| F10 | **Investigate Now** | Provider feature support and actual model-call accounting need production-path verification | **Yes, evidence prerequisite** | `lib/worker/modelSelection.ts`; `lib/worker/runtime.ts`; `lib/management/{modelBoundary,budget}.ts`; `convex/objectiveRunner.ts` |
| F11 | **Park for Later** | Manager decision count may still be reducible after correctness/recovery are fixed | No | strategy + recommendation split |
| F12 | **Ignore / Accept Risk** | Genuine semantic judgment remains a real model capability floor | No | interpretation, recommendation, worker semantics, final assessment |

### Historical failures that must not be rediscovered as current defects

Keep regression coverage for these, but do not re-open them as new architecture work:

- stale `lastDeliveryFailureClass=INPUT_BLOCKED` poisoning a resumed worker;
- stopped `waiting_for_resource` assignment remaining falsely `running`;
- pre-serial compulsory HYBRID choreography;
- older missing input-discovery affordances;
- dead worker tool-call telemetry counter;
- old 24-turn worker behavior;
- interpretation fence/casing issues already covered by current normalization.

Historical model failures are evidence for the portability problem, not permission to reintroduce old fixes or increase budgets blindly.

## 5. Implementation shape — three milestones

The audit findings are intentionally collapsed into **three** implementation milestones. Do not split each finding into its own patch train.

---

# Milestone 1 — Make runtime truth machine-readable and worker handoff forgiving

## Goal

Remove situations where a model has to reverse-engineer lifecycle truth from prose or perfectly sequence deterministic bookkeeping.

This milestone resolves **F1, F2, F3, F4** and the worker-facing portion of **F7**.

## 1A. Typed tool outcomes everywhere

Affected:

- `convex/objectiveRunner.ts::makeConvexPort`
- `convex/objectiveRunner.ts::actCommand`
- `lib/worker/runtime.ts::{trackActionOutcome,parseTypedStatus,act,actRead}`
- `lib/worker/toolStatus.ts`

Required behavior:

- Every serial material tool result has an explicit machine-readable status from the canonical status vocabulary.
- A refusal must never be wrapped as `accepted` merely because its implementation returned plain prose.
- Duplicate/no-progress accounting consumes the typed result, never English substring inference on the serial path.
- Legacy non-serial behavior remains compatibility-only; do not enlarge legacy string heuristics.

Smallest implementation preference:

1. normalize tool-command returns at the port boundary into one serial result envelope;
2. convert all resource-request refusal branches to that envelope;
3. keep the application mutation/kernel as the authority for whether the request was valid.

Acceptance:

- A rejected `request_resource` is observed as `status=refused`.
- Runtime telemetry counts it as a failed action.
- Two identical refused actions hit the existing bounded duplicate-failure stop.
- No authoritative ResourceNeed/BUY is created by the wrapper.

## 1B. Separate accepted action output from diagnostics

Affected:

- `convex/objectives.ts::submitResult`
- `convex/internal/workforce.ts::readDecisionContext`
- result-package types in `lib/management/decisionPass.ts`

Required behavior:

- `latestAcceptedWorkerOutput` is derived only from a matching application-accepted terminal/delivery identity.
- Refused `NEEDS_INPUT`, unconfirmed diagnostics, stale writes, and failed runs may remain visible, but under an explicit diagnostic/failed-action field.
- The manager should never need to infer “accepted vs merely stored” from prose.

Do not delete diagnostic persistence. Correct the label and state projection.

Acceptance:

- A refused/unconfirmed `NEEDS_INPUT` cannot populate `latestAcceptedWorkerOutput`.
- The same diagnostic can still be inspected under an explicit non-authoritative field.
- A genuinely accepted `DELIVERED` still appears once, with exact run/action identity.

## 1C. Pre-terminal deterministic validation for `DELIVERED`

Affected:

- `convex/objectives.ts::{submitResult,readWorkerObservation,finishRun}`
- `lib/worker/runtime.ts::submit_result`
- existing completion/proof helpers; do not invent a second completion kernel.

Problem to remove:

A worker can submit `DELIVERED`, seal its terminal slot, then have deterministic action proof rejected at finish. That turns a small procedural omission into a whole new managerial/action attempt.

Required behavior:

- Before an accepted `DELIVERED` closes the worker terminal slot, run the deterministic checks that are knowable at that moment for **this action**.
- If known obligations remain, return `refused` with a bounded structured list of exact unmet obligations.
- The same run remains able to perform the missing legal action and resubmit.
- Objective completion still belongs exclusively to the independent management completion gate.

Do **not** make the worker decide whether proof is satisfied.
Do **not** accept advice-only completion for a required artifact mutation.
Do **not** turn application proof refusal into semantic acceptance.

Worker budget behavior:

- Surface the remaining actionable obligations and remaining turn budget in the observable/control envelope.
- Preserve the current overall turn ceiling unless evidence proves a different bound is needed.
- Ensure the runner leaves a bounded path for terminal correction rather than spending every turn on repeated successful inspection.

Acceptance:

- Premature `DELIVERED` receives a deterministic refusal and exact unmet obligations.
- The worker can satisfy them and resubmit in the same authoritative run.
- Accepted `DELIVERED` still cannot independently complete the Objective.
- Stale/superseded runs remain fenced.

## 1D. One canonical evidence-gap submission shape

Affected:

- `lib/worker/runtime.ts::submit_result`
- `convex/objectiveRunner.ts::actCommand(submit_result/request_resource)`
- `convex/objectives.ts::{submitResult,reportMissingInput}`
- `lib/objective/inputDiagnosis.ts`

Target model-facing shape for semantic inadequacy should be conceptually small:

- resource class;
- unanswered question;
- evidence IDs inspected;
- why current evidence is insufficient;
- how additional information could change the result.

The application may derive/map legacy `purpose`, `reasonOwnedInsufficient`, `supportingEvidenceIds`, and accepted obligation identity internally.

Literal access scarcity remains separate:

- `check_input_availability` answers availability;
- semantic insufficiency does not need to manufacture `NOT_AVAILABLE`;
- an already-linked verified acquisition does not automatically satisfy a distinct question;
- optional residual uncertainty does not create another mandatory acquisition.

Compatibility:

- historical/legacy callers may retain adapter support;
- the new serial model-facing schema must expose one preferred representation, not two competing representations.

Acceptance:

- A semantically correct gap cannot be rejected merely because the model omitted redundant legacy aliases that the application already knows how to derive.
- Validation still rejects foreign evidence, unknown resource classes, stale revisions, unread owned inputs, already-covered obligations, and unsupported new mandatory conditions.

## Milestone 1 focused evidence

Run only directly affected tests first.

Add/adjust focused tests covering:

- production serial port: resource refusal → `refused`, not `accepted`;
- identical refused action → duplicate no-progress guard;
- refused diagnostic excluded from accepted manager output;
- accepted output identity projected correctly;
- premature `DELIVERED` → same-run deterministic correction;
- corrected resubmission succeeds without creating a new assignment;
- semantic-gap canonicalization happy path;
- foreign/stale/unlinked evidence remains refused;
- literal scarcity vs semantic adequacy remain distinct.

Likely existing suites to extend rather than duplicate:

- `tests/m61Pass2Closure.test.ts`
- `tests/m61InputDiagnosis.test.ts`
- `tests/m61ZeroProgress.test.ts`
- `tests/m61ConsistencyRepair.test.ts`
- `tests/m61AssignmentRealizability.test.ts`

Checkpoint commit only after focused evidence passes.

---

# Milestone 2 — Make structured model calls repairable, context-safe, and capability-bounded

## Goal

Make occasional imperfect structured responses recover locally instead of becoming whole-run failure, and guarantee the model receives complete decision-critical objects.

This milestone resolves **F5, F6, F7, F8** and investigates/fixes the concrete parts of **F9/F10** that affect the current path.

## 2A. Shared bounded structured-output repair

Affected:

- `lib/management/modelBoundary.ts`
- management model calls in `convex/objectiveRunner.ts`
- parsers in `lib/management/proposals.ts`
- interpretation / decision / final-assessment attempt accounting in `convex/management.ts`

Implement one small shared repair policy for management structured outputs.

Required principles:

- Distinguish **provider/transport failure**, **structural/schema rejection**, and **substantive semantic negative decision**.
- A structural repair prompt must state:
  - exact rejected field(s);
  - exact validation reason(s);
  - legal enum/ID choices where known;
  - instruction to preserve the intended business judgment and correct only the invalid structure.
- Bound repair tightly. Default target: **one corrective structural re-ask per logical call** unless evidence justifies otherwise.
- Total Objective model/time ceilings remain authoritative.
- Never replay or duplicate material side effects as part of JSON repair.
- Provider retry behavior remains separate from semantic repair.

Attempt accounting:

- Provider timeout/429/schema transport failure must not consume the same allowance intended for a meaningful final semantic critique + one correction.
- Keep a finite global ceiling; do not create an unlimited retry side channel.
- If current budget accounting counts one managerial decision as one model call even though strategy + recommendation are two calls, verify and correct the accounting to reflect actual production calls.

Interpretation:

- Preserve existing safe canonicalization (fence stripping, known level/bar remap).
- Do not invent missing requirements, evidence, authority, or business choices during repair.

Recommendation:

- A stale or invalid option ID receives the current legal option IDs in the corrective prompt.
- Application still revalidates fresh truth after repair.

Final assessment:

- Missing/invalid evidence refs are corrected by the model or rejected.
- Do **not** auto-fill every available evidence ID as though the model selected it.

## 2B. Structure-aware context budgeting

Affected:

- `convex/internal/workforce.ts::readDecisionContext`
- `convex/objectiveRunner.ts::{proposeStrategyWithModel,recommendWithModel,proposeFinalSemanticAssessment}`
- worker loaded-input package as needed.

Remove raw `JSON.stringify(...).slice(...)` for decision-critical objects.

Required behavior:

- Bound each field/list before serialization.
- Never cut a JSON object mid-string.
- Preserve all legal current option IDs.
- Put critical lifecycle fields ahead of optional prose.
- Make every truncation explicit in the data shape.
- Keep provider/source text bounded and untrusted.

Final deliverable assessment:

- The assessor must receive the complete governed deliverable up to an explicit safe bound sufficient for the supported artifact size.
- If a supported artifact can exceed the assessor payload, provide deterministic section/chunk retrieval or refuse to assess until the full governed content has been inspected.
- Never silently assess only the first prefix while presenting it as the full artifact.

## 2C. Stop asking the model to echo known identities

Affected:

- interpretation/recommendation/final-assessment schemas in `convex/objectiveRunner.ts`
- `lib/management/proposals.ts`

Remove model-authored fields that the application already owns when they provide no semantic value.

Candidates:

- interpretation `order` if order is array position and application renumbers it;
- recommendation `requirementKey` / `contractRevision` as model-authored content;
- final assessment artifact key/version echoes when begin already bound the target.

Preserve stale-revision and identity checks in the **application envelope**. Removing a copied model field must not remove the authoritative freshness check.

Where the application knows a small legal set, constrain generation to it:

- strategy enum;
- capability keys;
- eligible option IDs;
- bounded resource classes where applicable.

If a provider cannot dynamically enforce an enum, keep deterministic parsing/validation and include the exact legal list in the corrective prompt. Do not add provider-specific business rules.

## 2D. Final-assessment provenance/trust cleanup

Affected:

- `convex/objectives.ts::listOwnedObservationsForAssessment`
- `convex/objectiveRunner.ts::proposeFinalSemanticAssessment`
- `convex/objectives.ts::submitFinalSemanticAssessment`

Separate:

1. who/what persisted the observation;
2. the origin/provenance of the underlying content;
3. whether the content is trusted as instructions;
4. whether the model cites it as supporting evidence.

Application-fetched external text remains untrusted **content**, even though the application owns the observation record.

Preserve live/simulation/recorded-replay provenance where relevant rather than collapsing all verified acquisitions into an indistinguishable semantic label.

Acceptance:

- malformed assessment attribution does not get auto-populated into a valid-looking citation set;
- a model can only cite IDs actually supplied;
- the application validates those IDs;
- positive semantic assessment still cannot bypass completion recomputation.

## 2E. F9 / F10 investigations inside the milestone

Do not start a separate architecture project. Answer two bounded questions with production-shaped tests/probes.

### F9 — contract/context sufficiency

Construct:

- one two-requirement dependency case;
- one same-resource-class but genuinely distinct-question case.

Inspect the exact model payloads.

Pass if:

- prerequisite accepted evidence is present where needed;
- acquisition linkage is scoped correctly across allowed dependencies;
- an optional uncertainty is not elevated into mandatory work;
- a genuinely different question is not suppressed as “already covered”;
- interpretation does not require redundant planning mini-requirements merely because implementation steps exist.

If a concrete projection loss is found, fix the smallest projection. Do not redesign Outcome Contracts.

### F10 — provider and call-accounting verification

Probe the actual production paths, not toy schemas:

- interpretation strict structured output;
- strategy structured output;
- recommendation structured output;
- worker real tool call;
- final assessment structured output.

Record safe metadata:

- requested model;
- resolved provider/model identity where available;
- finish reason;
- latency;
- parse/validation result;
- structural-repair count;
- actual model-call count;
- timeout/rate-limit/provider classification.

If budget counters do not match actual calls, fix the accounting without changing financial/business semantics.

## Milestone 2 focused evidence

Add/adjust tests for:

- one malformed-but-repairable interpretation/recommendation/assessment;
- correction prompt includes exact error and legal values;
- second malformed response stops at the bounded repair ceiling;
- provider failure classified separately and does not consume semantic critique allowance;
- invalid option ID repair;
- invalid evidence ID repair;
- no automatic evidence-ref invention;
- context builders always emit parseable complete JSON;
- all legal option IDs survive context budgeting;
- long artifact assessment sees complete content or deterministically retrieves it;
- source record ownership does not mark external content as trusted instructions;
- actual model-call budget accounting path.

Do not run broad release suites until the exact implementation candidate is ready for promotion.

Checkpoint commit after direct seam evidence passes.

---

# Milestone 3 — Model Portability Acceptance Gate

## Goal

Prove portability empirically on the exact integrated candidate instead of inferring it from individual model runs.

This milestone closes **F9/F10 evidence**, validates Milestones 1–2, and defines the release-facing portability result.

## 3A. Freeze the candidate

Before the gate:

- exact branch/SHA;
- clean worktree;
- required changes committed;
- deployment identity captured;
- same prompts/schemas/code for every model;
- same Objective text and initial company/business state;
- same spend grant;
- same external acquisition simulation/replay mode;
- same runtime ceilings;
- no model-specific business logic;
- no hidden fallback model.

Use a fresh Objective per trial.

Do not reuse a partially completed Objective across models.

## 3B. Model cohort

Use at least three materially different model families.

Required cohort shape:

1. one known working low-cost baseline;
2. one materially different low-cost model;
3. at least one explicit OpenRouter free model that, **on gate day**, passes the production capability preflight for:
   - strict/usable structured output on the management path;
   - actual tool calling on the worker path.

Do not certify the generic `openrouter/free` router as an identified model. It may be exploratory evidence, but the gate should include an explicit free-model slug so the result is reproducible.

Free-model availability is operational state, not architecture. If an endpoint is unavailable/rate-limited, classify that separately.

## 3C. Capability preflight

Before burning full Objectives, each candidate must pass the real production boundary for:

- interpretation output;
- strategy output;
- recommendation selection;
- worker tool invocation and tool-result consumption;
- final assessment output.

Qualification tests the actual schemas/adapters after Milestones 1–2.

A model failing provider feature support is an **unsupported route**, not “weak intelligence.”

## 3D. Repeated physical runs

Initial acceptance sample:

- **5 fresh Objectives per qualified model**
- minimum **15 total** for the three-model cohort.

This is an engineering gate, not a statistical reliability guarantee.

Every run must:

- use the normal interpretation path;
- use normal deterministic grounding/authorization;
- execute real bounded MAKE work;
- use the same acquisition boundary configuration;
- reassess after material world changes;
- produce a real versioned artifact when the deliverable requires it;
- pass normal requirement verification and final completion gate;
- remain inside existing authority and budget ceilings;
- receive no manual database/state repair.

The acquisition boundary may use the same transparent simulation/replay mode across models for portability isolation. Do not call that a new live payment/acquisition proof.

Each model cohort must exercise at least one legitimate acquisition → reassessment → evidence-informed MAKE path.

If a run defensibly completes without a purchase, that may pass task completion but does **not** prove acquisition/resume portability for that model until a legitimate run exercises it. Never force a purchase merely to satisfy a demo script.

## 3E. Recovery battery

Run controlled imperfections through the same production interfaces:

| Condition | Expected behavior |
| --- | --- |
| Recoverable schema/structure mistake | One precise bounded repair; no authority/effect granted from invalid output |
| Invalid option/evidence ID | Refusal + exact legal choices; no invented substitution |
| Premature `DELIVERED` | Same-run unmet-obligation feedback; terminal remains open |
| Refused resource request | Machine-readable `refused` |
| Repeated identical refusal | Bounded no-progress stop |
| Empty response / timeout / 429 | Provider/transport classification distinct from semantic model judgment |
| Duplicate wake / terminal replay | Idempotent |
| Negative final semantic assessment | One bounded substantive correction path, then accept or explicit stop |
| Long deliverable beyond old prefix cutoff | Full assessment or deterministic retrieval before verdict |

## 3F. Quality rubric

Portability PASS is not “the state machine reached completed.”

Use one fixed external rubric for all models to confirm:

- contract fidelity to the founder Objective;
- substantive diagnosis;
- evidence relevance;
- meaningful use of acquired evidence when used;
- real artifact improvement;
- truthful assumptions/unknowns;
- useful final recommendation.

Do not let the same model’s own `meetsMinimumBar=true` be the sole quality judge.

## 3G. Gate verdicts

### PASS

- exact same deployed engine/configuration except model identity;
- at least three materially different qualified models;
- at least one explicit OpenRouter free model;
- all required recovery cases pass;
- no model-specific business logic;
- no manual state rescue;
- each model completes 5/5 fresh canonical trials;
- each model demonstrates acquisition/resume coverage;
- quality rubric passes;
- deterministic safety/authority invariants hold.

This certifies the tested cohort/configuration, **not every free model**.

### PARTIAL

Use when useful portability is demonstrated but a required element remains incomplete, for example:

- successful runs but inconsistent repeats;
- no qualifying free route available;
- acquisition/resume not exercised for one model;
- provider instability prevents attribution;
- recovery battery has unresolved failures;
- diagnostics/call accounting still insufficient.

Report task success and provider availability separately.

### UNSUPPORTED MODEL / ROUTE

Classify only after a healthy, correctly configured route receives the same bounded repair opportunity.

Use one of:

- `unsupported_route` — provider lacks required structured/tool feature;
- `below_capability_floor` — model repeatedly fails the bounded semantic/tool task under a sound interface;
- `engine_failure` — runtime supplied contradictory state, omitted required information, or mishandled a valid response;
- `undetermined` — evidence cannot separate model/provider/runtime.

Never call an engine/provider defect “unsupported model” because another model happened to get further.

## 6. Files expected to change

This is the likely implementation surface, not permission to edit all of it.

Primary:

- `convex/objectiveRunner.ts`
- `convex/objectives.ts`
- `convex/management.ts`
- `convex/internal/workforce.ts`
- `lib/worker/runtime.ts`
- `lib/worker/toolStatus.ts`
- `lib/management/modelBoundary.ts`
- `lib/management/proposals.ts`
- `lib/management/decisionPass.ts`
- `lib/management/budget.ts`
- `lib/objective/inputDiagnosis.ts`

Focused tests, preferably by extending current suites:

- `tests/m61Pass2Closure.test.ts`
- `tests/m61InputDiagnosis.test.ts`
- `tests/m61ZeroProgress.test.ts`
- `tests/m61ConsistencyRepair.test.ts`
- `tests/m61PostAcquisitionResume.test.ts`
- `tests/m61AssignmentRealizability.test.ts`
- management decision/completion tests directly affected by schema changes.

Do not modify M5/frontend unless a changed truth shape requires a minimal read-model compatibility update. Portability work is a backend/runtime concern.

## 7. Test hierarchy

Follow the repository's risk-based hierarchy.

### Level 1 — focused changed behavior

For each edit, run only the narrow tests proving the changed port/parser/terminal/recovery behavior.

### Level 2 — direct seams

After Milestone 1:
- worker port ↔ Convex result/status;
- terminal ↔ proof validation;
- semantic gap ↔ ResourceNeed validation.

After Milestone 2:
- manager action ↔ parser/repair;
- context projection ↔ structured model boundary;
- final assessment ↔ application validation;
- call accounting ↔ persisted budget.

### Level 3 — risk-specific subsystem

Escalate only if uncertainty remains in:
- stale/replay/idempotency behavior;
- acquisition evidence scoping;
- completion proof recomputation;
- decision/assessment ceilings.

### Level 4 — promotion gate

Once, on the exact final portability candidate:
- canonical typecheck/build/test promotion checks;
- then physical portability gate.

Do not repeatedly blast the whole suite after every patch.

## 8. Implementation order and commits

Recommended implementation sequence:

1. **Milestone 1** — truth/status + accepted-output projection + pre-terminal proof + canonical gap.
2. Commit and push a verified checkpoint.
3. **Milestone 2** — bounded repair + safe context + schema simplification + final-assessment truth + F9/F10 bounded investigations.
4. Commit and push a verified checkpoint.
5. Integrate/rebase only if the physical-acceptance branch has accepted fixes that the portability branch must inherit.
6. Run the promotion gate once on the exact candidate.
7. **Milestone 3** — physical multi-model portability gate; documentation/evidence only unless a demonstrated blocker requires a scoped fix.

If a physical-gate defect requires code:
- classify it first;
- fix only current-target blockers;
- rerun the invalidated seam, not every prior test;
- produce a new exact candidate SHA before continuing comparisons.

## 9. Risks and boundaries

### Do not optimize for one model

No:
- model-name conditionals;
- special prompt branches for Luna/Qwen/Gemma/Nemotron/DeepSeek;
- hidden premium fallback after a free model fails;
- per-model business semantics;
- model-specific proof relaxation.

Provider adapters may handle transport capability differences, but business behavior must remain common.

### Do not over-normalize semantic mistakes

Safe repair:
- strip fences;
- parse a JSON string containing the expected object;
- remap a declared level label to its declared key;
- return exact validation errors and legal IDs.

Unsafe repair:
- choose an option for the model;
- invent missing evidence;
- invent a ResourceNeed;
- infer spend authority;
- mark work complete;
- turn optional uncertainty into or out of a required gate.

### Do not widen budgets to hide interface defects

The current bounded-turn / lease model is a safety feature.

Change a ceiling only if:
1. the supported happy path is structurally minimal after Milestones 1–2;
2. telemetry proves the remaining bound is insufficient;
3. the new bound is explicitly reviewed and remains finite.

### Do not confuse provider reliability with model capability

A 429, missing structured-output endpoint, ignored tool choice, timeout, or router mismatch is provider/runtime evidence until proven otherwise.

## 10. Parked work

### F11 — reducing managerial call count

Park until the three-milestone plan is complete.

After portability evidence exists, inspect whether strategy/capability proposal adds enough value to justify a separate model call before recommendation. Any future reduction must preserve deterministic grounding and application authorization.

Revisit condition:

- current interface/recovery fixes pass;
- telemetry shows decision-call multiplication is a dominant remaining failure source.

### Broader capability / provider architecture

Also parked:

- provider marketplace breadth;
- generic workflow DSL;
- automatic model routing;
- model ensembles;
- per-task dynamic model switching;
- second purchase/public-posting expansion.

None is needed to establish portability.

## 11. Accepted risk / capability floor

F12 is intentionally not “fixed.”

Somebody still requires a model capable of:

- understanding a bounded business objective;
- making a coherent semantic strategy recommendation;
- using evidence rather than fabricating it;
- operating tools within a constrained assignment;
- identifying a genuine evidence gap;
- producing a useful deliverable;
- evaluating whether that deliverable meets stated semantic criteria.

The runtime should tolerate imperfect formatting and procedural reliability.

It should **not** compensate for a model that cannot perform those semantic tasks.

The correct outcome for such a model is a truthful `below_capability_floor` result, not more model-specific orchestration.

## 12. Definition of done

This model-portability implementation is complete only when:

- Milestone 1 acceptance passes;
- Milestone 2 acceptance passes;
- F9/F10 are resolved with evidence;
- every Act Now finding is either fixed or explicitly re-triaged with new evidence;
- no model-specific business logic was introduced;
- canonical product semantics and financial/authority invariants remain intact;
- exact integration candidate passes the repository promotion gate;
- Milestone 3 produces PASS, PARTIAL, or unsupported classifications with enough evidence to attribute failures;
- docs record exact branch/SHA/deployment/model cohort and remaining risks.

Do not report “portable” merely because Luna passes or because one free model reaches further than before.

The success condition is a runtime whose deterministic layer carries deterministic responsibility, leaving model quality to be judged on the semantic work Somebody actually needs.
