# ACTIVE TASK — M5 Web Executive Mission Control

Updated: 19 September 2026. Status: CP0 complete; implementation not started.

## Goal and recovery
Build a desktop-first, fixture-only executive management surface. The Objective
creates demand; Somebody assembles the company required to satisfy it.
Resume from this ledger and the latest pushed checkpoint, not historical chat.

## Git truth
- Repository: dropandresetmain-prog/somebody-okx
- Implementation/publication branch: `qoder/general-session-yeqje6`
- Platform-authorized source: `main`
- Base / HEAD before CP0: `37afaa5a7cd0aa82a30c63ce6795c48d34f04d07`
- Main's live remote SHA confirmed equal to the base on 19 September.
- Outcome branch created cleanly from main; suggested feat branch not used
  because this session's authorized destination is the outcome branch above.
- Exact CP0 pushed SHA: recorded by the next checkpoint note after push.
- Each commit updates this ledger; each checkpoint MUST be pushed before work
  continues. Record the just-pushed SHA in the next note (no self-referential SHA).
- M3 historical ledger remains in git at the base above; M3 stays frozen.

## Authoritative references and precedence
- `docs/design/M5_WEB_DESIGN_DIRECTION.md`
- `docs/design/M5_WEB_SURFACE_BRIEF.md`
- `docs/design/assets/m5-web/{mission-control,system-xray}.png`
- Those web-only assets are copied verbatim from the current accepted reference:
  `design/m5-web-mobile-direction@d194be85e8f1ca2cc42c558adc05e28f9ac5a0fb`.
- M4 inspected at live remote `feat/m4-management-engine`:
  `7723c096f58067c79a59782792ec4346184df1f4` (review target `59f75f7`).
- Inspected M4 `lib/management/types.ts`, `intents.ts`, completion report.
- No separate M5 frontend/backend contract is committed in those references.
- Main has M3 but not the M4 engine. Do NOT merge unpromoted backend code.
- M4 domain reference: Requirement priorities required/supporting; states
  active/satisfied/blocked/superseded/waived; strategies MAKE/BUY/HYBRID/WAIT/
  ASK_FOUNDER/BLOCK. Worker identity, assignment, result and satisfaction differ.
- M4 acquisition intents are authorization-only; real M3 integration is unwired.
- `lib/payment/types.ts` is the existing M3 payment vocabulary authority.
- User's current truth restrictions override older dependency/ASK wording in
  the design docs. No dependency graph or backend ASK enum will be invented.

## Non-negotiables
- One provisional ObjectiveWorkspaceView boundary; no Convex in new components.
- SomebodyNow, AttentionItem, MissionStoryEvent, SystemXrayFixture are normalized
  frontend abstractions, not claims about backend tables/enums.
- Stable fixture IDs and numeric epoch-ms timestamps; label all data as fixtures.
- No inferred causality, requirement dependency edges, fabricated concurrency,
  model recommendations represented as live, or unsupported REUSE.
- Worker done != assignment verified != Requirement satisfied != Objective done.
- Payment: prepared → awaiting_approval → approved → payment_attempted →
  submitted → settled → result_received → verified. No signed/finalized states.
- Warm paper, dark ink, orange Somebody; reuse fonts/mascot, semantic motion only.
- Desktop Web only; no separate mobile product; no real spend/provider calls.
- Exact staging, checkpoint commits + pushes; never merge; never force-push.

## Checkpoints
- [x] CP0 truth + recovery ledger + preserved web references
- [ ] CP1 frontend contract + deterministic fixtures + invariant tests
- [ ] CP2 mission-control shell and Outcome/Somebody Now hierarchy
- [ ] CP3 workers, grounded decisions, providers, Needs You
- [ ] CP4 evidence, story, payments, independent completion
- [ ] CP5 optional supported-relationship System X-ray
- [ ] CP6 responsive/accessibility/visual polish
- [ ] CP7 frontend acceptance candidate and final gate

## Completed evidence
- Clean source worktree; HEAD, branches, recent M3/M4/design commits inspected.
- Remote main/design/M4 heads queried and reference commits fetched.
- Existing app, UI tests, package scripts, fonts/mascot, payment types inspected.
- No AGENTS.md tracked. No frontend lint/browser script is configured.
- Canonical scripts: typecheck, test (tsx/node:test), build (Next).
- Dependencies are not installed in this fresh sandbox.
- Delegation unavailable: no permitted blocking child-agent tool is exposed.

## Current checkpoint / next action
CP1: create fixture contract and tests under `app/m5/` and `tests/m5*.test.ts`.
Use `/m5` for isolated preview; leave existing production workspace intact.
Root Convex provider currently blocks all routes without env: when adding /m5,
move existing provider wrapping to existing root page without changing backend.
Install existing lockfile dependencies, then focused tests only until final gate.

## Risks / active files
- Design reference is provisional, not runtime end-to-end evidence.
- Generic live selection/economic grounding and BUY→M3 are not frontend claims.
- Brand fonts may need network access at Next build; report actual evidence.
- CP0 files: this ledger, two web design documents, two reference screenshots.
- No backend, app behavior, payments or mobile files changed in CP0.
