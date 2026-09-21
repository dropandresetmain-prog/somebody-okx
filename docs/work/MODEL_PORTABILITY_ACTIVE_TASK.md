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
