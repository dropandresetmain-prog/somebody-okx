# ACTIVE TASK — Founder live runtime liveness repair

Updated: 23 September 2026 (Singapore)
Branch: `fix/founder-live-runtime-liveness` from `origin/main` @ `7e6dcf4`

## Phases

| Phase | Focus | Status |
| --- | --- | --- |
| A | Management pass timeout + recovery | in progress |
| B | V6 read-query performance | in progress |
| C | Liveness projection + UI | in progress |
| D | Generic objective seed separation | in progress |

## Incident

- Objective `obj_1790169699655_st8i4h` (founder Share Society) — first `runManagementPass` ~1s local timeout, no decision follow-on.

## Findings (open)

- **Act Now:** management pass budget, V6 read timeouts under cohort data, liveness UX, canonical artifact on generic create
- **Investigate Now:** scheduler retry on mutation timeout; local vs cloud limits

## Non-claims

- No deploy, M3, payment, Jev, or model changes in this lane
