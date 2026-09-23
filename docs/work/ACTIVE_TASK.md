# ACTIVE TASK — OKX Final Convergence (Primary Integrator)

Updated: 23 September 2026 (Singapore)
Status: **CP7 COMPLETE — READY FOR FINAL PROMOTION REVIEW** (not merged to main)

## Goal

Integrate four completed lanes into ONE verified final candidate.
No merge to main. No deploy. No live payments / signing / merchants / M3 / live Objectives.

## Integration branch

- Branch: `integration/okx-final-convergence`
- Worktree: `C:/Dev/somebody-okx-okx-final-convergence`
- Base SHA (exact start): `51bb7c605f220ae8b1b010e6ebabf594a70f3042`
- Frozen Reliability code: `ac1c64e381fec2d1874fc3ab0229f4b8d56de043`
- Final integrated candidate: see tip after docs/api checkpoint commit

## Source lane SHAs

| Lane | Branch | Head | Method |
| --- | --- | --- | --- |
| Reliability V7 | `fix/reliability-v7-scope-ownership` | `51bb7c6` / code `ac1c64e` | Base |
| Final frontend | `design/ui-v7-product-language` | `6bde197e4a04732e4d884e903315da0d2de4f214` | File-level transplant + surgical create/spend |
| Business Seed V2 | `chore/business-seed-v2` | `27cd2758fcecee703df4cf2878b4822dda673981` | Manual semantic merge |
| Jev selector | `build/jev-option-selector` | `4d9c704c86a9f4902637d26f2b2de35897ca8188` | Transplant + Stage-3 gate wire |

## Checkpoints

- [x] CP1 — branch from `51bb7c6` + inventory
- [x] CP2 — `46cc3eb` frontend transplant (kept V7 `OBJECTIVE_LIST_WINDOW`)
- [x] CP3 — `5f2fe4c` Business Seed V2 + V7 purpose policy
- [x] CP3b — `b0d1710` Needs You `optionId` on `approval_required`
- [x] CP4 — `e406555` Jev adapter + `ai@7.0.111`
- [x] CP5 — `3155a49` Stage-3 wire behind `JEV_OPTION_SELECTION_ENABLED`
- [x] CP6 — cross-lane doubles (134 focused tests pass)
- [x] CP7 — promotion gate (see `docs/work/gate-evidence/integration-okx-final-convergence/`)
- [ ] CP8 — docs + push final tip (in progress)

## Jev activation / failure semantics

- Env: `JEV_OPTION_SELECTION_ENABLED=true` (exact `true`; default off)
- Gate OFF: legacy unconstrained-among-eligible `recommendWithModel`
- Gate ON:
  - 0 eligible → no Jev call; null recommendation
  - 1 eligible → sole lock; no Jev call; rationale locked
  - N eligible → `selectEligibleOption` among eligible only; rationale locked
  - Jev unknown/malformed/unavailable → typed recommendation error envelope; **no** silent fallback
  - Rationale different `selectedOptionId` → typed refusal
- Stage-4 `applyDecision` unchanged (fresh truth + reauthorization)
- Secrets: `AI_GATEWAY_API_KEY` env only; never logged

## Promotion gate (CP7)

Exclusion: `tests/m3GateInterpretationCeilingEscalates.test.ts` (known hang)

| step | result |
| --- | --- |
| Suite | **1168** tests / **1158** pass / **10** fail |
| Fail names | **identical** to V7 `ac1c64e` baseline set |
| root `tsc --noEmit` | **74** lines (baseline match after productCommands api.d.ts) |
| convex typecheck | **EXIT=0** |
| `next build` | Compiled successfully; then Failed to type check on inherited debt |

## Findings

- **Investigate Now (inherited V7):** `setupCanonicalDemoObjective` accepts optional custom request while attaching canonical purpose policy.
- **Ignore / Accept Risk:** 10 inherited test failures (identical names); root tsc 74-line debt; Next typecheck fails after successful compile.
- **Park for Later:** hang file exclusion for `m3GateInterpretationCeilingEscalates`.
- **Act Now (resolved):** register `productCommands` in `convex/_generated/api.d.ts`.

## Non-claims

- No live M3 / payment / provider / signing success claimed.
- No merge to main. No deploy.
