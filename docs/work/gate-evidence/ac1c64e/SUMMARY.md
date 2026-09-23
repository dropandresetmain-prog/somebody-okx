# Gate evidence — ac1c64e (scope-ownership)

Frozen candidate: `ac1c64e381fec2d1874fc3ab0229f4b8d56de043`
Baseline: `451e87979fb789914696eb70fcd22125b89fbb4f`
Exclusion (both): `tests/m3GateInterpretationCeilingEscalates.test.ts`

## Suite (excluded-hang methodology)

| | files | tests | pass | fail |
| --- | --- | --- | --- | --- |
| baseline | 105 | 1074 | 1064 | 10 |
| candidate | 106 | 1077 | 1067 | 10 |

Failing-name set: identical (see `*-fail-names-clean.txt`).
+3 candidate tests = `tests/v7ReviewR4ScopeOwnership.test.ts`.

## Typecheck / build

| step | baseline | candidate |
| --- | --- | --- |
| root `tsc --noEmit` | 74 lines | 74 lines (normalized set identical) |
| convex `tsc -p convex/tsconfig.json --noEmit` | EXIT=0 | EXIT=0 |
| `next build` | (not re-run; prior identical debt) | Compiled successfully, then Failed to type check (same inherited set) |

Full logs retained locally under this directory; not required for promotion decision beyond the summary above.
