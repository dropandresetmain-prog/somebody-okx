# ACTIVE TASK — M5 Web Executive Mission Control

Updated: 20 September 2026. Status: M5 Web frontend FROZEN / ACCEPTED.

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
- CP6 pushed / HEAD before CP7: `4ea4080c7722f84695ff561e9b70185ca76db13d`.
- CP7 pushed: `fb0055fdcb18fc45ef5d56aac14f88baa8e52e7c` (final frontend candidate).
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
- [x] CP7 frontend acceptance candidate and final gate

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

## Founder acceptance (20 September 2026)
The founder visually reviewed the M5 Web frontend candidate on 20 September 2026
and accepted the visual/product direction for the current hackathon implementation.

Accepted candidate SHA: `fb0055fdcb18fc45ef5d56aac14f88baa8e52e7c`
Accepted surface: M5 Web Executive Mission Control
Coverage: fixture-driven Web experience only
Status: Accepted visual/product reference for later M5 backend integration

This acceptance does NOT mean the frontend is production-integrated. Backend
wiring is intentionally deferred. Mobile is intentionally deferred unless time
remains later.

## Next milestone: M5 BACKEND INTEGRATION
Backend integration MUST wait until the backend candidate is explicitly ready.

Expected integration sequence:
1. Backend finishes management-decision seam
2. Backend finishes external BUY → M3 integration
3. Accepted backend candidate / SHA is frozen
4. Create a fresh integration branch FROM THAT BACKEND CANDIDATE
5. Bring the accepted M5 Web frontend across
6. Implement a normalized backend → ObjectiveWorkspaceView adapter/read model
7. Replace fixtures with real reactive data
8. Wire founder commands / approvals
9. Wire truthful provider/payment lifecycle
10. Verify end-to-end demo flow

Architecture rule: BACKEND ADAPTS TO THE FRONTEND READ-MODEL BOUNDARY.
Do NOT plan to rewrite React components around raw Convex tables.

Accepted frontend seam:
  Backend domain truth
          ↓
  normalized Objective workspace read model
          ↓
  ObjectiveWorkspaceView
          ↓
  M5 Web UI

## Integration watch items
- `SomebodyNow` remains a normalized frontend/read-model concept
- `AttentionItem` / Needs You remains normalized from approval / ambiguity /
  blocked / recovery truth
- Mission Story richer causality requires explicit backend references
- No Requirement dependency edges should be invented
- Payment vocabulary remains: prepared → awaiting approval → approved →
  payment attempted → submitted → settled → result received → verified
- No product states called `signed` or `finalized`
- Worker completion != assignment verified != Requirement satisfied !=
  Objective completion
- MAKE / BUY / HYBRID autonomous decision runtime may still evolve
- External BUY → M3 wiring is not part of the accepted frontend branch
- REUSE / CREATE should remain behind the normalized read-model boundary

Technical watch item:
The frontend branch moved `ConvexClientProvider` from the root layout to the
legacy `/` page so `/m5` can stay fixture-only. This was valid for the isolated
frontend build. During future backend integration, deliberately reassess
provider scope rather than mechanically preserving or reverting that choice.

## Known cosmetic issues — Park for Later
Mascot image 404: pre-existing, does not block accepted frontend.
Revisit condition: if it is visible in the final integrated demo or affects
production presentation.

## CP7 evidence (final acceptance gate)
- Production build (`npm run build`): compiled successfully, TypeScript clean,
  all 5 routes generated. /m5 builds as a dynamic server-rendered route.
- Full test suite (`npm test`): 359/359 pass (includes the 18 M5 tests).
- `npx tsc --noEmit`: clean. `git diff --check`: clean.
- Delegated read-only audit (Grep/Read, no writes) over app/m5 + tests:
  all 8 acceptance criteria PASS —
  (1) no backend wiring: only `import type { PaymentState }` from
  lib/payment/types; zero convex/fetch/env reads in app/m5.
  (2) fixture honesty: no Math.random/Date.now; numeric epoch-ms via Date.UTC;
  stable string IDs; fixture labels rendered.
  (3) payment vocabulary: exactly the 8 allowed states; zero signed/finalized.
  (4) no invented causality: no requirement→requirement edges; explicit
  "Order does not imply causality" disclaimer; structural X-ray labels only.
  (5) worker done / assignment verified / requirement satisfied / objective
  completed kept distinct across snapshots.
  (6) launch 16 moments, partner 7, supplier 1 blocked; blocked supplier has
  action=null — no fake retry/approval.
  (7) mobile scope: only CSS media queries, no separate mobile components/routes.
  (8) no dead code: zero TODO/FIXME/console.log; all exports consumed.
- Live /m5 re-verified over dev server (0.0.0.0:3000): renders "Fixture
  workspace · not live", "Somebody now", "System X-ray · secondary inspection",
  "MAKE / BUY / HYBRID", "Mission Story". Preview surfaced earlier at CP2.
- CP7 introduced no code changes; this checkpoint records the gate results only.
- One pre-existing mascot image 404 observed at runtime (cosmetic, present since
  before CP6, does not affect layout, build, or tests). Left unchanged to avoid
  unrelated scope.

## Final state
All checkpoints CP0–CP7 complete and pushed to `qoder/general-session-yeqje6`.
Desktop-first, fixture-only Executive Mission Control with System X-ray delivered.
No Convex wiring, no live spend/provider calls, no mobile scope creep.

M5 Web frontend FROZEN / ACCEPTED on 20 September 2026.
Accepted visual/product reference for later M5 backend integration.
Next milestone: M5 BACKEND INTEGRATION (waits for backend candidate).

## Risks
- Design reference is provisional, not runtime end-to-end evidence.
- Live selection/economics and BUY→M3 remain explicitly unwired.
- Brand fonts may need network access at build; report actual evidence.
- No permitted blocking agent tool is available; primary performs focused work.
