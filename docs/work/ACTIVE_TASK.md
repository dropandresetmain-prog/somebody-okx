# ACTIVE TASK — OKX Final Convergence (Primary Integrator)

Updated: 23 September 2026 (Singapore)
Status: **PROMOTED TO MAIN** — merge commit `14d64ee` via PR #1. **Not deployed.**

## Promotion

- PR: https://github.com/dropandresetmain-prog/somebody-okx/pull/1
- Merged: 23 September 2026
- `main` tip: `14d64eed23c45df8eeb9321b6684f9c2372896d6`
- Candidate tip included: `26685a2`
- Deploy: **not run** (ask explicitly if needed)

## Source lane SHAs (promoted)

| Lane | Head |
| --- | --- |
| Reliability V7 tip / start | `51bb7c6` (code `ac1c64e`) |
| Final frontend | `6bde197` |
| Business Seed V2 | `27cd275` |
| Jev selector | `4d9c704` |

## Gate (pre-merge)

- Suite excl. hang file: 1168 / 1158 pass / 10 fail (names = V7 baseline)
- Convex typecheck clean; root tsc 74-line inherited debt
- Next compiled, then inherited typecheck fail

## Jev

- `JEV_OPTION_SELECTION_ENABLED=true` to enable; default off
- Stage-4 `applyDecision` unchanged

## Findings carried

- **Investigate Now:** `setupCanonicalDemoObjective` optional custom request + canonical purpose policy
- **Ignore / Accept Risk:** 10 inherited fails; root tsc / Next typecheck debt

## Non-claims

- No live M3 / payment / provider success claimed
- No deploy in this promotion
