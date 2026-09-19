# ACTIVE TASK — M5 Web Executive Mission Control

Updated: 19 September 2026. Status: CP6 complete; final acceptance gate next.

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
- CP0 pushed: `ad36d9b68da2152b06abc91827d58cb168a3da35`.
- CP1 pushed / HEAD before CP2: `615f10c973a4d893a9e55c394539627c93a31694`.
- CP2 pushed / HEAD before CP3: `ee6c2dbd3bf9b0fc9c59c71b7e741e7edbd878c2`.
- CP3 pushed / HEAD before CP4: `610b15ca421525cfae51721df106cc1afef13b37`.
- CP4 pushed / HEAD before CP5: `63280ff284650789702519da30e7d36db54560f5`.
- CP5 pushed / HEAD before CP6: `972ecb4c835da206f8d77402a7855ea9382962e7`.
- CP6 pushed SHA goes in the next checkpoint note.
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
- [x] CP1 frontend contract + deterministic fixtures + invariant tests
- [x] CP2 mission-control shell and Outcome/Somebody Now hierarchy
- [x] CP3 workers, grounded decisions, providers, Needs You
- [x] CP4 evidence, story, payments, independent completion
- [x] CP5 optional supported-relationship System X-ray
- [x] CP6 responsive/accessibility/visual polish
- [ ] CP7 frontend acceptance candidate and final gate

## Completed evidence
- Clean source worktree; HEAD, branches, recent M3/M4/design commits inspected.
- Remote main/design/M4 heads queried and reference commits fetched.
- Existing app, UI tests, package scripts, fonts/mascot, payment types inspected.
- No AGENTS.md tracked. No frontend lint/browser script is configured.
- Canonical scripts: typecheck, test (tsx/node:test), build (Next).
- Dependencies are not installed in this fresh sandbox.
- Delegation unavailable: no permitted blocking child-agent tool is exposed.

## CP1 evidence / current checkpoint
- `npm ci --silent --no-audit --no-fund`: passed, lockfile unchanged.
- `npx --no-install tsx --test tests/m5Fixtures.test.ts`: 8/8 passed.
- Focused tsc of workspace.ts + fixtures.ts: passed with --ignoreConfig --noEmit
  --strict --skipLibCheck --target ES2022 --module esnext --moduleResolution bundler.
- First tsc invocation needed TS7's --ignoreConfig; corrected, no code failure.
- 24 independent snapshots: 16 BUY/relaunch, 7 MAKE/partner, 1 blocked supplier.
- Outcome is a relaunch-ready pack, NOT public publication or claimed lift.
- Three paths have explicit IDs, times, references, proof and authority boundaries.
- CP1 files: app/m5/workspace.ts, app/m5/fixtures.ts, tests/m5Fixtures.test.ts.
- No component, backend, payment behavior or mobile changes.

## CP2 evidence
- /m5 shell: Objective rail, contract levels, Somebody Now, current Requirement,
  internal boundary, proof rows and deterministic fixture navigation.
- Component rendering tests: 4/4 passed (all 24 snapshots); focused component
  tsc passed; git diff --check passed. No production build/full suite run.
- Browser: 1440x900 Objective switching passed, zero page errors, no overflow.
- Browser uses globally available Playwright + /usr/bin/chromium; packaged
  Playwright browser is absent. localhost works; 127.0.0.1 HMR origin is blocked.
- /m5 HTTP 200 with expected content; server listening 0.0.0.0:3000; preview called.
  Gateway/phone reachability not established. Temporary screenshot /tmp/m5-cp2.png.
- Root provider wrapping moved to existing root page. Its behavior is preserved;
  new /m5 neither initializes nor calls Convex. Backend source unchanged.

## CP3 evidence
- CompanyField: persistent That Guys, CREATE/REUSE rationale, reservations,
  distinct assignment/result state; providers remain outside internal boundary.
- Decisions: explicit selected strategy, authority, grounded fact provenance;
  rejected MAKE/BUY/HYBRID alternatives and historical decisions in disclosures.
- Needs You: bounded amount + resource + authority; only explicit simulation
  approves. Blocked fixture offers guidance, no fake retry or automatic action.
- Component tests 6/6 passed; focused component tsc and diff check passed.
- Browser: alternatives disclose; single approval button advances to approved.

## CP4 evidence
- Evidence inspection, explicit source refs, artifact v1/v2 history, verified
  vs received proof, separate completion verdict and pending supporting work.
- Mission Story shows supplied related records only; chronology is not causality.
- All eight payment stages displayed; unreached stages cannot look recorded.
- M5 component + fixture tests 16/16; focused tsc and diff checks passed.
- No provider APIs, payment reducers, backend writes or automatic playback added.

## CP5 evidence
- X-ray is built by a pure `buildXray(view)` function (app/m5/xray.ts) from
  explicit reference fields only: defines, requires, assigned_to, addresses,
  selects, authorizes, provided_by, proof_for, accepts. No dependency edges,
  no inferred causality, no LangGraph-style nodes.
- Secondary inspection lives behind a `<details>` disclosure in the right rail;
  collapsed by default so it never competes with the primary mission view.
- Rendered tables: nodes (kind badge, label, stable ID, detail), relationships
  (from → label → to, both ends must resolve to known node IDs), runtime facts.
- Runtime facts state "No live backend — fixture data only"; note states
  "explicit references only · no inferred causality".
- Two delegated subagents produced xray.ts, SystemXray.tsx, xray.css; primary
  integrated into FixtureWorkspace, page.tsx CSS import, and tests.
- M5 tests 18/18 passed (8 fixture invariants + 10 component/X-ray). Full tsc
  --noEmit passed.
- Browser (1440x900, /usr/bin/chromium): toggle opens, 23 relationship/node
  rows + 3 runtime facts rendered, zero page errors. Initial horizontal
  overflow (scrollWidth 1499) traced to X-ray fact grid and fixed with
  minmax(0,·) columns + word wrapping; re-verified scrollWidth 1440, no
  element extends past viewport. Screenshot /tmp/m5-cp5-xray.png (temporary).

## CP6 evidence
- Delegated to one subagent (CSS-first polish, no copy/component text changes).
  Result: 2 files, +9/-2 lines, all CSS. No global theme tokens redefined.
- mission-control.css: `:focus-visible` outline (orange, 55% mix) on summary/
  button/a/select; `overflow-wrap: break-word` on `.mc-layout`; `prefers-reduced-motion`
  kill-switch scoped to `.mc-root` (matches xray.css pattern).
- xray.css: `.mc-xray-count` color ink-3 → ink-2 for small-text AA contrast.
- Viewport audit 1920/1440/1280/1100 (Playwright + /usr/bin/chromium): zero
  horizontal overflow at every width, zero page errors, X-ray toggle closed by
  default at all widths. Keyboard-Tab test confirmed the focus-visible outline
  actually renders (3px solid orange) — not just a declared rule.
- Independent verification by primary: M5 tests 18/18, tsc --noEmit clean,
  git diff --check clean, browser re-audit at all 4 widths.
- Deliberately unchanged: existing `@media (max-width:680px)` rules (no mobile
  scope creep), app/globals.css, all visible copy, no new animations.
- Known pre-existing issue: one 404 on a mascot image asset at runtime (not
  introduced here; does not affect layout or tests).

## Next action / active files
CP7 final gate: typecheck, full test suite, production build, fixture scenario
review, confirm no backend wiring, no mobile scope creep. Then final report.

## Risks
- Design reference is provisional, not runtime end-to-end evidence.
- Live selection/economics and BUY→M3 remain explicitly unwired.
- Brand fonts may need network access at build; report actual evidence.
- No permitted blocking agent tool is available; primary performs focused work.
