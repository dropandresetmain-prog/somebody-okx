# ACTIVE TASK — Luna V6 Demo Replay Verification

Updated: 23 September 2026 (Singapore)
Status: **READY FOR FOUNDER REPLAY**

## Goal

Verify the successful historical Luna run through the current V6 Demo Replay UI
and leave it ready for founder manual inspection.

## Current source

| Field | Value |
|---|---|
| Release tip | `release/okx-final-candidate` @ `46d2af76271b259a25d52ae1e72666f540d47303` |
| Working worktree | `C:\Dev\somebody-okx-luna-v6-replay` |
| Fix branch (if any) | `demo/luna-v6-replay-check` |
| Dirty release worktree (preserved, unused) | `C:\Dev\somebody-okx-okx-final-candidate` |
| Merged main | NO |

## Authoritative replay scenario

| Field | Value |
|---|---|
| Scenario ID | `luna-relaunch-recovery` |
| Label | Luna — Relaunch Recovery |
| Objective | `obj_1790046504201_vporlj` |
| Model | `openai/gpt-5.6-luna` |
| Candidate | `8f53da0` |
| Evidence | `docs/work/gate-evidence/8f53da0/run-luna-5-obj_1790046504201_vporlj.json` |
| Provenance | `simulation` (historical truth — do not relabel) |
| Original duration | 141000 ms |
| Demo sequence | 26000 ms |
| Source module | `lib/demo/scenarios/lunaRelaunch.ts` |

## Out of scope

- real E2E
- fresh Objective execution
- model calls
- provider calls
- backend debugging
- payment
- final release gate
- production deployment

## Checklist

- [x] local Git state reconciled
- [x] Demo Console available
- [x] successful Luna scenario source verified
- [x] focused demo tests pass
- [x] current V6 starts locally
- [x] 26s demo replay completes
- [x] 141s original replay completes
- [x] pause/resume/restart/reset work
- [x] reset restores live UI
- [x] replay causes zero Product Command mutations
- [x] founder receives exact manual run instructions

## Critical constraints

- Do NOT run real E2E or the release/promotion gate.
- Do NOT modify live manager/runtime to make a run pass.
- Do NOT regenerate the Luna scenario from a different run.
- Do NOT fabricate Needs You / approvals / live provenance.
- Fix only real replay/UI blockers; no general design polish.
- Wait for the separate backend-fix lane before any real E2E/release gate.
