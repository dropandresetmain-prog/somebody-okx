# ACTIVE TASK — OKX Final Convergence (Primary Integrator)

Updated: 23 September 2026 (Singapore)
Status: **CP4 IN PROGRESS — Jev adapter transplant**

## Goal

Integrate four completed lanes into ONE verified final candidate.
No merge to main. No deploy. No live payments / signing / merchants / M3 / live Objectives.

## Integration branch

- Branch: `integration/okx-final-convergence`
- Worktree: `C:/Dev/somebody-okx-okx-final-convergence`
- Base SHA (exact start): `51bb7c605f220ae8b1b010e6ebabf594a70f3042`
- Frozen Reliability code: `ac1c64e381fec2d1874fc3ab0229f4b8d56de043`

## Source lane SHAs

| Lane | Branch | Head |
| --- | --- | --- |
| Reliability V7 | `fix/reliability-v7-scope-ownership` | `51bb7c6` / code `ac1c64e` |
| Final frontend | `design/ui-v7-product-language` | `6bde197e4a04732e4d884e903315da0d2de4f214` |
| Business Seed V2 | `chore/business-seed-v2` | `27cd2758fcecee703df4cf2878b4822dda673981` |
| Jev selector | `build/jev-option-selector` | `4d9c704c86a9f4902637d26f2b2de35897ca8188` |

## Checkpoints

- [x] **CP1** — branch from `51bb7c6` + lane inventory
- [x] **CP2** — `46cc3eb` frontend transplant (presentation from `6bde197`; keep V7 `productWorkspace` list window; create/spend commands; `submitObjective` → `createReceivedObjective`)
- [x] **CP3** — `5f2fe4c` Business Seed V2 semantic merge (PROFILE/BRIEF/artifact/research + `CANONICAL_AUTHORIZED_PURPOSE_POLICY`)
- [ ] **CP3b** — Needs You `optionId` surfacing on approval_required (decision.ts) — pending commit
- [ ] **CP4** — Jev adapter transplant + isolated tests
- [ ] **CP5** — Jev Stage-3 seam + gate + focused seam tests
- [ ] **CP6** — cross-lane canonical demo (doubles)
- [ ] **CP7** — promotion gate once
- [ ] **CP8** — docs + push (no main merge)

## Integration methods used

| Lane | Method |
| --- | --- |
| Frontend | File-level transplant from `6bde197` + surgical create/spend adapters; **kept** V7 `convex/productWorkspace.ts` (OBJECTIVE_LIST_WINDOW); **kept** V7 management/runtime |
| Business Seed | Manual semantic merge of `27cd275` 3-file delta into V7 seed/policy |
| Jev | Transplant module from `4d9c704` + reconcile `ai@7.0.111` (in progress) |

## Focused evidence

### CP2
- `tests/founderLanguage.test.ts` — 16 pass
- Combined FE suite (founderLanguage, v6ProductWorkspace, frontendContract*, create, spend, demo*) — 149 pass (earlier run)
- `tests/founderSpendApproval.test.ts` — 12 pass (re-verified after seed)
- Note: createObjective convex-test can emit scheduled-interpretation noise; timer mock added in CP2 commit

### CP3
- `tests/businessSeed.test.ts` — 5 pass
- `tests/v7ReviewR4ScopeOwnership|Origin|PurposeScope` — 21 pass
- `tests/m61ProductionWholeChain.test.ts` — 2 pass

## Carried findings

- **Investigate Now (inherited V7):** `setupCanonicalDemoObjective` accepts optional custom request while attaching canonical purpose policy.
- **Park for Later:** Windows `node_modules` install flakiness in this worktree; currently junctioned to purpose-origin modules for test execution until Jev `ai` dep forces a real local install.
- **Act Now (CP3b):** decision.ts must surface `recommendation.selectedOptionId` when authorization is `approval_required` (FE Needs You); R4 `authorizedPurposeKinds` must remain.

## Ownership reminders

- Reliability V7: runtime/authority
- Frontend: presentation
- Business Seed: business wording only
- Jev: Stage-3 eligible ID selection only; Stage-4 `applyDecision` unchanged
