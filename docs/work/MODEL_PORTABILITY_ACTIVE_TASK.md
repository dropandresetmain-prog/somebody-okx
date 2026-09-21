# Model Portability — Active Task Ledger (working memory, not a design doc)

Does NOT replace `docs/work/ACTIVE_TASK.md` (physical-E2E purpose). SSOT: `docs/work/MODEL_PORTABILITY_IMPLEMENTATION_PLAN.md`.

## Milestone 1 — runtime truth machine-readable, worker handoff forgiving

- Branch: `build/model-portability-milestone-1`
- Worktree: `../somebody-okx-model-portability`
- Base: planning commit `1115e0db29ef565064b9e3d824b75206c855d0c5` (contains audited candidate `122938b6…`)
- Physical candidate has since advanced (`aa11031`, management decision-retry only:
  `convex/management.ts`, `lib/management/{decision,graph,reducer}.ts`) — not in any M1 seam; NOT rebased.

## Checklist

- [x] F1 typed refusals at the serial port (`request_resource` refusal branches → `refused`)
- [x] F2 accepted output vs diagnostic (`projectWorkerOutput`; `latestWorkerDiagnostic`)
- [x] F3 pre-terminal DELIVERED gate (`computeActionObligations`, shared with `readWorkerObservation`)
- [x] F3 budget guidance (`control.{unmetObligations,turnsRemaining,maxTurns}` on every serial tool result)
- [x] F4 canonical gap (`normalizeGapSubmission`; serial zod schema exposes one shape)
- [x] Focused tests (Pass2Closure, InputDiagnosis, ZeroProgress, SemanticGapWorkerSchema, ActNowTerminalAndChain)
- [x] Level-2 seam run (34 files importing touched modules)
- [ ] Scoped review triage (see completion report)

## Directly affected files

`convex/{objectiveRunner,objectives,objectiveValidators}.ts`, `convex/internal/workforce.ts`,
`lib/worker/{runtime,port}.ts`, `lib/management/decisionPass.ts`, `lib/objective/{inputDiagnosis,types}.ts`,
tests: `m61Pass2Closure`, `m61InputDiagnosis`, `m61ZeroProgress`, `m61SemanticGapWorkerSchema`, `m61ActNowTerminalAndChain`.

## Acceptance evidence

- Focused + seam suites green except failures that ALSO fail on the base commit (verified via stash):
  `m2LegacyObligations` (4), `m61CausalPipelineCp4` (1), `m61ConsistencyRepair` (1),
  `m61DiagnosisToExternalIntent` (1), `managementFinishGate` (2), `managementProductionLoop` (1).
- Non-test `tsc` + `convex/tsconfig` clean.

## Next action

Milestone 2 (structured-output repair, context budgeting, identity echo, final-assessment provenance, F9/F10) —
separate task; do not start here.

## Critical non-goals

No model-specific logic, no budget increase (`MAX_TURNS` stays 8), no second completion kernel,
no payment/provider changes, no physical-E2E worktree changes, no promotion gate yet.


---

## Milestone 2 — structured calls repairable, context-safe, capability-bounded

- Branch: `build/model-portability-milestone-2` · worktree `../somebody-okx-model-portability-m2`
- Started from M1 checkpoint `56b3073` (untouched). Checkpoint A = `d757cf7`: clean cherry-pick of `aa11031`
  (empty-option decision-refusal retry until `BEGIN_DECISION_CEILING`) — no conflicts, no disagreement with the SSOT;
  its retry semantics are preserved and decision refusals (incl. provider failures) still burn `decisionRefusalAttempts`.
- Checkpoint A evidence: 121 tests green (retry grounding, adapter persistence, cutoff2, graph, production loop, reducer)
  + M1 seam (Pass2Closure/ZeroProgress/InputDiagnosis/ActNow…). `managementProductionLoop` N10 now passes (fixed by `aa11031`).

### Checklist

- [x] A shared bounded repair: `lib/management/modelBoundary.ts::runRepairableStructuredCall` (1 corrective re-ask; exact fields/reasons/legal values; ceilings authoritative via `canAffordCall`)
- [x] provider_failure / structural_rejection / semantic_negative separated (`classifyProviderFailure`, `StructuralOutputError`)
- [x] B final-assessment accounting: `clearPendingFinalAssessment(failureKind)` refunds provider/structural/config failures; separate `finalAssessmentProviderFailures`/`StructuralFailures` bounded by `BEGIN_FINAL_ASSESSMENT_NONSUBSTANTIVE_CEILING=4`; explicit BLOCKED gate when unobtainable; requestId unique across refunds
- [x] C model-call accounting: `trySpendDecision` counts decisions only; actions record actual logical calls (`recordManagementModelCalls`); repairs count
- [x] D structure-aware budgeting: `lib/management/contextBudget.ts` (no `JSON.stringify().slice()` on critical data; all option ids survive; explicit `truncations`)
- [x] E full artifact: payload budget 40k holds the 8000-char artifact cap whole; over-cap ⇒ refuse (`unassessable`), never a prefix
- [x] F identity echoes removed (interp `order`, rec `requirementKey/contractRevision` → application envelope, assessment key/version); freshness still checked in `applyDecision` against fresh truth
- [x] G runtime-derived enums in schemas (strategy, capability keys, option ids, evidence ids) + legal values in repair prompt
- [x] H provenance split (`recordedBy` / `contentOrigin{…provenance}` / `trustedAsInstructions:false`); evidenceRefs model-authored + validated; no auto-fill
- [x] I typed tool errors (`ToolStatusError` marker survives `runMutation`; `toolStatusOf`); 15 deterministic throw sites → `refused`
- [x] J `request_resource` fallback uses typed `recordRef` (`isNotAvailableCheckRecordRef`); "cite all findings" fallback removed
- [x] F9 investigation (see report): fixed one projection loss — manager `scopedVerifiedAcquisitions` now includes dependency requirements' acquisitions (same set the MAKE worker is linked to)
- [x] F10 live-adapter probe against a LOCAL OpenAI-compatible stub (`tests/m2LiveAdapterProbe.test.ts`: schema sent, fence strip, prose⇒structural+repair, empty/429⇒provider, SDK retry ≠ logical call). Real-provider probes NOT run (no approval for paid usage).
- [ ] Scoped review triage · [ ] promotion gate (once, on final candidate)

### Files

`lib/management/{modelBoundary,contextBudget,proposals,budget,decisionPass}.ts`, `lib/worker/{toolStatus,runtime}.ts`,
`lib/objective/{artifact,inputAvailability}.ts`, `convex/{objectiveRunner,management,objectives,objectiveValidators}.ts`,
`convex/internal/workforce.ts`; tests `m2StructuredRepair`, `m2ContextSufficiency` (new), `managementCutoff2`, `m61ConsistencyRepair` (stale expectation).

### Plan divergences

- Plan 2E said probe F10 live; deferred to explicit approval (paid usage). Worker-turn model calls are NOT counted in `modelCalls`
  (they never were; SDK-internal turns) — reported, not changed, to avoid starving the 60-call ceiling.
- Interpretation previously bypassed `runStructuredChat`; it now routes through it (double-testable), `kind: "interpretation"`.

### Inherited failures (identical on `d757cf7` base; not regressions)

`m2LegacyObligations`×4, `m61CausalPipelineCp4`×1, `m61DiagnosisToExternalIntent`×1, `managementFinishGate`×2,
`managementDecision`×2 (also fail on `56b3073`). `m61ConsistencyRepair` "already-covered" was a STALE expectation
(coverage is question/purpose-scoped by accepted design) — test updated, runtime untouched.

### Next action

Triage review findings → checkpoint B commit + push → promotion gate once → stop before Milestone 3.
