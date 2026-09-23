# ACTIVE TASK — Founder E2E Readiness

Updated: 23 September 2026 (Singapore)
Status: **CANDIDATE READY FOR GATE** — `fix/founder-e2e-readiness`

## Base / source

| Item | SHA |
| --- | --- |
| Current main (J4 promoted) | `3608e2ccec875b2dfdd61e0233a27145bcc79208` |
| Source repair (useful material) | `42b98f31d72b4a2b6eadefd2343ae22fe9878f20` |
| Repair old base | `7e6dcf4b96145d6a88049438044092a4305fa5c7` |

## Constraints

- J4 present on main; **OFF by default** — `JEV_OPTION_SELECTION_ENABLED=false`
- Do **not** start J4.1 / turn Jev on
- Do **not** run Founder E2E Objective
- Do **not** merge to main / deploy / enable M3

## Phases

1. ~~Transplant safe parts of `42b98f3` onto current main~~
2. ~~Act Now #1 — graph-cache invocation-local deps + concurrency regression~~
3. ~~Act Now #2 — generic Objective deliverable artifact (scenario-neutral)~~
4. ~~Act Now #3 — truthful liveness (no pulse from bare `working`)~~
5. ~~Keep bounded management recovery + V6 bounded reads~~
6. ~~Focused / seam / risk tests~~
7. Freeze candidate; baseline vs gate vs `3608e2c`
8. One Convex + one Next; leave `/start` empty; STOP

## Checkpoint

- Cherry-picked `42b98f3` onto `3608e2c`; fixed three Act Now defects
- Graph deps via LangGraph `configurable` (invocation-local); concurrency test green
- Generic seed: `objective/deliverable` + `seed/system`; canonical demo unchanged
- Liveness: no `facts.status === "working"` forever-pulse; watch/pending/live assignment only
- `objectiveRunner.ts` untouched (J4 authoritative)

## Acceptance evidence (focused)

- `managementGraphConcurrency`, `managementPassRecovery`, `genericObjectiveArtifact`
- `createObjectiveCommand`, `frontendContractProjection` (incl. liveness), `v6ProductWorkspace`
- `managementGraph`, `demoPlaybackEngine`, `businessSeed`, `m61V6BoundedRetention`
- Totals sampled: 123 + 8 + 3 focused batches green

## Gate

_(fill after freeze)_
