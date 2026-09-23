# Gate evidence — integration/okx-final-convergence

Frozen candidate tip at gate body: `a60690358d8cadaf17d880490f809b5db082178d` (plus api.d.ts/docs checkpoint following)
Base start: `51bb7c605f220ae8b1b010e6ebabf594a70f3042`
Exclusion: `tests/m3GateInterpretationCeilingEscalates.test.ts` (known hang; same as V7)

## Suite (excluded-hang methodology)

| | files | tests | pass | fail |
| --- | --- | --- | --- | --- |
| V7 baseline `ac1c64e` vs `451e879` | 105/106 | 1074/1077 | 1064/1067 | 10 |
| integration candidate | ~115 | **1168** | **1158** | **10** |

Failing-name set: **identical** to `docs/work/gate-evidence/ac1c64e/baseline-fail-names-clean.txt`.
Added passing tests from FE / Business Seed V2 / Jev transplant + seam.

## Typecheck / build

| step | result |
| --- | --- |
| root `tsc --noEmit` | **74 lines** (matches V7 baseline after `api.d.ts` productCommands registration) |
| convex `tsc -p convex/tsconfig.json --noEmit` | **EXIT=0** |
| `next build` | Compiled, then Failed to type check on inherited root debt (same class as V7) |

## Notes

- `convex/_generated/api.d.ts` manually registered `productCommands` (codegen requires CONVEX_DEPLOYMENT; runtime `api.js` already uses `anyApi`).
- No live payments / M3 provider / live Objectives run.

