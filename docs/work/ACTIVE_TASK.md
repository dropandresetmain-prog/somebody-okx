# ACTIVE TASK — M6.1 manager–execution mini-refactor

Updated: 21 September 2026 (Singapore)
Status: **PLAN READY / IMPLEMENTATION NOT STARTED / M6.1 NOT ACCEPTED**

## Goal

Somebody chooses one bounded MAKE or BUY action, receives its actual result,
reassesses, and continues until it delivers a persisted, evidence-backed
relaunch recommendation. Keep the payment/authority controls; simplify the
management–worker protocol. No scripted demo engine or more isolated retries.

## Read first

1. `docs/work/M6_1_MANAGER_EXECUTION_REFACTOR_PLAN.md` — scope, contracts,
   implementation map, two acceptance gates and final reporting requirements.
2. Latest 21 September entry in `DECISIONS_LOG.md` — narrow freeze exception.
3. Relevant implementation files named in the plan; re-read current code.

The plan supersedes conflicting earlier planning only for the explicitly
changed M6.1 execution semantics. Existing safety and M3 authority remain.
`ARCHITECTURE.md` / `MASTER_PLAN.md` describe the previous baseline and must
be reconciled to actual implementation at the next verified milestone.

## Branch / base

- Planning branch: `docs/m6-1-manager-execution-plan` (docs only).
- Recovery code base: `fix/m6-1-causal-pipeline` at
  `07230355c0000d294be32aa6bf08a2200631d3e2`.
- Last verified `main`: `2bc3e06a60e32fe5e987b1dced35627f7dae2827`.
- Recovery was 32 commits ahead of main, zero behind; main was the merge base.
- Create `refactor/m6-1-manager-execution-loop` from this documentation tip.
- Recheck remote refs, local HEAD/worktrees and dirty/stashed work first.
  Do not reset later work or pop historical model experiments blindly.
- Planning used remote GitHub reads/writes, not the founder's local checkout.
  No local stash, runtime configuration or deployment was verified here.

## Current truth

- Latest recovery already fixed the unrealizable document-drafting grant.
- M3/M4 and M5 subsystem acceptance does not establish complete product E2E.
- M6.1 is NOT physically accepted. Do not carry a PASS from old seam tests.
- This commit changes documentation only; no implementation/model/payment run.
- All earlier ACTIVE_TASK content is preserved byte-for-byte in
  `docs/work/M6_1_PRE_REFACTOR_RECOVERY_HISTORY.md`.
  It is history, not instructions to resume the old STOP-A1/B retry sequence.

## Execution checklist — internal working memory, not founder checkpoints

- [ ] Verify base/local state and trace the production loop.
- [ ] Record the small chosen contract/lifecycle changes; implement together.
- [ ] Prove changed behavior and real production seams with focused tests.
- [ ] Review changed authority, completion and concurrency boundaries; fix blockers.
- [ ] Gate 1: two fresh live-model runs, only acquisition boundary simulated,
      on the same candidate/configuration, without manual state rescue.
- [ ] Reconcile docs/evidence; commit exact files and push; report Gate 1 result.

Current checkpoint: implementation plan prepared; no application checks run.
Next action: implement Gate 1 from the plan, starting with the shared contract.
Do not stop after returning another broad plan or send each seam to a new fixer.

## Critical constraints

- Lock the outcome; planning substeps are not all mandatory outcome requirements.
- LLM owns semantic assessment and eligible-option recommendation; application
  owns facts, authority, effects, identities and completion acceptance.
- One current action; one worker result surface; no compound HYBRID for new runs.
- Keep historical HYBRID records readable; do not resume/rewrite failed objectives.
- Preserve Convex, LangGraph, worker runtime, M3 rail and accepted M5 layout.
- Acquisition evidence must cross the next-action boundary under explicit scope
  and materially inform the final artifact; a receipt/version bump is not enough.
- No fabricated scarcity, source reads, authorizations, prices or completion.
- No secret-bearing logs, silent model fallback, budget reset or live payment.
- Revalidate any existing model approval and spending bounds before live calls.
- No broad suite/build/typecheck after each edit; focused evidence first.
- Gate 2 (genuine acquisition → transparent replay → recording/freeze) is later
  and requires its own explicit live-execution scope. It is not this handoff's
  automatic next action or a new authorization to spend.

## Completion / handoff

Keep this file about 50–150 lines. Check items only after evidence passes.
Report PASS/PARTIAL/FAIL, changed files/behavior, exact checks and physical
runs, all findings triaged, risks, docs, branch/SHA/push/deployment state and
one next step. A missing environment means PARTIAL, never invented evidence.
