# ACTIVE TASK — OKX Final Convergence (Primary Integrator)

Updated: 23 September 2026 (Singapore)
Status: **CP7 COMPLETE — READY FOR FINAL PROMOTION REVIEW**

## Goal

Integrate four completed lanes into ONE verified final candidate on Reliability V7
runtime truth, without merge to main, deploy, or live payments/M3/Objectives.

## Integration branch

- Branch: `integration/okx-final-convergence`
- Worktree: `C:/Dev/somebody-okx-okx-final-convergence`
- Base SHA (exact start): `51bb7c605f220ae8b1b010e6ebabf594a70f3042`
- Frozen approved Reliability code: `ac1c64e381fec2d1874fc3ab0229f4b8d56de043`

## Source lane SHAs

| Lane | Branch | Head |
| --- | --- | --- |
| Reliability V7 | `fix/reliability-v7-scope-ownership` | `51bb7c6` / code `ac1c64e` |
| Final frontend | `design/ui-v7-product-language` | `6bde197e4a04732e4d884e903315da0d2de4f214` |
| Business Seed V2 | `chore/business-seed-v2` | `27cd2758fcecee703df4cf2878b4822dda673981` |
| Jev selector | `build/jev-option-selector` | `4d9c704c86a9f4902637d26f2b2de35897ca8188` |

## Integration methods (done)

| Lane | Method |
| --- | --- |
| Frontend | File-level transplant of presentation-owned paths + product command adapters from `6bde197`; kept V7 `convex/productWorkspace.ts` bounded list; adapted create-command tests for V7 interpretation scheduling |
| Business Seed | Manual semantic merge of `27cd275` into V7 `seedData.ts`/`policy.ts` — founder copy + `CANONICAL_AUTHORIZED_PURPOSE_POLICY` |
| Jev adapter | File transplant of `4d9c704` + `ai@7.0.111` (lock reconciled; engines already `>=22.6.0`) |
| Jev live seam | New `lib/management/jevStage3.ts` + wire in `proposeDecision` recommend callback behind `JEV_OPTION_SELECTION_ENABLED`; Stage-4 `applyDecision` unchanged |

## Checkpoints

| CP | Status | SHA / evidence |
| --- | --- | --- |
| CP1 | done | branch at `51bb7c6` |
| CP2 | done | `46cc3eb` — FE focused 149 pass |
| CP3 | done | `5f2fe4c` — businessSeed + R4 scope 26 pass |
| CP4 | done | `e406555` — jevOptionSelector 8 pass |
| CP5 | done | `3155a49` — jevRecommendationSeam 11 pass; gate OFF by default |
| CP6 | in progress | cross-lane demo (doubles only) |
| CP7 | pending | promotion gate once |
| CP8 | pending | docs + push (no main merge) |

## Conflicts resolved

1. **`lib/objective/seedData.ts`** — Seed V2 business content + V7 purpose-scope policy (manual).
2. **FE vs V7 `productWorkspace` list** — kept V7 `OBJECTIVE_LIST_WINDOW` (FE `.collect()` rejected).
3. **FE runtime contamination** — did not take FE convex/management/payment/objectiveRunner.
4. **createObjectiveCommand hang** — mock timers + register `objectiveRunner` (V7 schedules interpretation).
5. **`decision.optionId` on approval_required** — `b0d1710` keeps selected option for Needs You (FE product truth; authorization still parks).

## Jev activation / failure semantics

- Env: `JEV_OPTION_SELECTION_ENABLED=true` (default/off = prior recommendation path).
- Gate ON, 0 eligible → no Jev; null recommendation.
- Gate ON, 1 eligible → sole lock; no Jev call; rationale constrained.
- Gate ON, >1 eligible → `selectEligibleOption`; then rationale model on locked option only.
- Jev unknown/malformed/unavailable OR rationale escape → typed error envelope; **no** silent legacy fallback.
- Secrets: `AI_GATEWAY_API_KEY` via env only; never logged.
- Integration tests use injected doubles only.

## Carried V7 findings

- **Investigate Now:** `setupCanonicalDemoObjective` accepts optional custom request while attaching canonical purpose policy — tighten before general production entrypoint.
- **Park for Later:** Windows `npm ci` full extract flaky in this worktree; tests used junction to a healthy `node_modules` + lockfile reconciled for `ai@7.0.111`.

## Remaining risks / non-claims

- No live payments, signing, merchants, M3 execution, or live Objectives in this lane.
- No claim of live Jev gateway success from integration tests.
- Do not self-merge to main; do not deploy.

## Next action

CP6 cross-lane canonical demo with doubles → CP7 promotion gate → CP8 docs + push.


## CP7 promotion gate (frozen candidate)

- Candidate tip: see git rev-parse HEAD after this commit
- Suite: **1158 pass / 10 fail** — fail names match docs/work/gate-evidence/ac1c64e/candidate-fail-names-clean.txt
- Convex 	sc -p convex/tsconfig.json --noEmit: **clean**
- Root 	sc --noEmit: inherited debt (63 errors observed; same class as V7 historical debt)
- Next build: Turbopack rejects worktree 
ode_modules junction (environment); V7 evidence recorded same class of symlink limitation
- Cross-lane: business seed + founder language + Jev seams + whole-chain simulation **green**
- Hang test m3GateInterpretationCeilingEscalates **absent** on this tip (not reproduced)

