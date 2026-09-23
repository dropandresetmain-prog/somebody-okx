# Founder Live Run #1 — Evidence Package

Captured 2026-09-24 from the local Convex deployment (`local:local-dropandreset_main-somebody_okx`,
`http://127.0.0.1:3210`) via `npx convex run`. Read-only capture; the source Objective was **not**
mutated, repaired, or reset back to `completed`. No API keys, tokens, wallet credentials, or secret
env values are included below or in the accompanying JSON dumps — only application/business content
(a demo company profile, a demo launch brief, and public-web research excerpts).

## Identification

- **Objective key:** `obj_1790181742573_ohzr6j`
- **Exact founder request:** "We're launching our app this week and need to do social media
  marketing on TikTok, Instagram, Facebook and X. I need you to come up with a marketing plan based
  on the latest trends on these channels, preferably with some real evidence"
- **Created at:** `1790181742573` (epoch ms)
- **Final `updatedAt`:** `1790182254535` (epoch ms)
- Identified by exact-text match against `objectives:listObjectives`, not by guessing from
  screenshots or ID prefixes.

## Model identity

Every managed run in this Objective used:
- **Model:** `openai/gpt-5.6-luna`
- **Selection reason (recorded verbatim on each run):** "Operator-selected tool-capable model for
  bounded research execution"

Confirmed on all 4 runs: `run_080a8943c5a0a13c05500443`, `run_65bac0fc4de92c3dd0f1740f`,
`run_e019ff0006e5c579bb01be49`, `run_813ad481b76b6524f201c961`.

## Outcome Contract / Requirements

- **Contract:** `contract_interpret_obj_1790181742573_ohzr6j_a1`, revision 1,
  `executionProtocol: m61_serial_v1`
- **Requirements (final states, all `satisfied`, all strategy `MAKE`):** `req_01`, `req_02`,
  `req_03`, `req_04`

## Managerial decisions (selected strategies)

| Requirement | Decision | Option |
| --- | --- | --- |
| req_01 | authorized MAKE | `opt_1a84ee35021151fac0237451` |
| req_02 | first refused (no grounded option eligible), then authorized MAKE | `opt_d1347afb48b9fd9954b1b89e` |
| req_03 | authorized MAKE | `opt_0e908a9f2afd6af843da4b79` |
| req_04 | authorized MAKE | `opt_ebedcb2c5257929bc1632eb5` |

## Assignments / runs / worker accepted outputs

| Requirement | Assignment | Run | Terminal | Tool telemetry |
| --- | --- | --- | --- | --- |
| req_01 | `asg_19ba0d1fe4300cd4cb1894fa` | `run_080a8943c5a0a13c05500443` | DELIVERED, accepted | ok=4 fail=4 |
| req_02 | `asg_83a4e4d80e56bcf8237d4b62` | `run_65bac0fc4de92c3dd0f1740f` | DELIVERED, accepted | ok=6 fail=0 |
| req_03 | `asg_0a1d4228c74e44941bcc863e` | `run_e019ff0006e5c579bb01be49` | DELIVERED, accepted | ok=5 fail=0 |
| req_04 | `asg_74941a6b5abc6c7133593849` | `run_813ad481b76b6524f201c961` | DELIVERED, accepted | ok=5 fail=0 |

## Artifact — final governed deliverable

- **Artifact key:** `objective/deliverable`
- **Final accepted version:** 3 (of 3; v1 is the `seed/system` placeholder, v2 and v3 are real
  worker output)
- **Provenance of v3:** `run_813ad481b76b6524f201c961`
- Full version history (v1 seed → v2 → v3) and the complete v3 content are preserved verbatim in
  `objective-full-record.json` (`record.companyArtifacts[0]`).

## Final semantic assessment

- `assessedAt: 1790182038280`
- `meetsMinimumBar: true`
- `contractRevision: 1`
- Rationale (verbatim): "The deliverable meets the locked marketing_plan_complete bar. It provides
  a coherent plan for TikTok, Instagram, Facebook, and X; identifies the audience and
  evidence-grounded positioning; assigns channel-specific roles; specifies content direction,
  launch-week sequencing, prioritization, measurement definitions, and decision rules; and clearly
  distinguishes evidence from assumptions. It is appropriately framed as a review draft and does not
  claim unsupported results or authorize publishing. It does not meet the higher
  evidence_set_complete or launch_ready_marketing_plan levels because current dated channel-trend
  evidence and several operational details remain missing."

## Completion verdict (accepted terminal)

- `acceptedTerminal.outcome: "accepted"`, `terminal: "DELIVERED"`, `acceptedAt: 1790182028706`,
  `runId: run_813ad481b76b6524f201c961`

## Control-state ordering — the completed → blocked defect, exactly as it happened

This is the critical evidence for Incident #1, taken verbatim from `record.management.controlNotes`:

1. `1790181768013` — `contract_interpreted`, revision 1
2. `1790181829625` / `1790181879297` / `1790181943164` / `1790182028820` — four
   `completion_proposed` control notes, one per run, each `spineVerdict: "complete"`
3. **`1790182191680` — `control_state: "completed"`**, summary: "gate accepted completion;
   disclosed 0 pending supporting item(s)" — **the accepted completion.**
4. **`1790182254535` — `control_state: "escalated"`**, summary: "budget limit
   maxNoProgressCycles: 3 consecutive cycles produced no materially new observation" — **the
   defective post-completion transition.**

Gap between (3) and (4): **62,855 ms (~63 s)**.

`record.management.lastManagementPassCompletedAt` is `1790182254535` — identical to the escalation
timestamp — confirming a **later management pass ran after the gate had already accepted
completion**, evaluated a no-progress budget guard (`maxNoProgressCycles: 3`), and overwrote the
Objective's persisted `state` field from `completed` to `escalated`. This is preserved on the
top-level record: `record.state === "escalated"`, `record.activity ===
"budget limit maxNoProgressCycles: 3 consecutive cycles produced no materially new observation"`.

This is exactly the architecture flaw anticipated before evidence was pulled: a stale/late
management pass was able to run after accepted completion and write a new non-completed state,
because the budget/no-progress guard is evaluated without first checking for an already-accepted
terminal completion.

Note on terminology: the application's control-state name for this non-terminal, attention-needed
state is `escalated`, not literally `blocked`. Product-facing copy may render `escalated` as
"blocked" / "needs you" — that mapping should be confirmed against the frontend, but the underlying
defect (completion is not monotonic) is unambiguous from the raw state transition above.

## Activity / events

Full ordered event log (23 events, `system` → `decision` → `agent` → `evidence` → `result` →
... → final `decision` "Final semantic assessment stored (meetsMinimumBar=true)") is preserved
verbatim in `objective-full-record.json` (`events[]`).

## Product workspace projection

The founder-facing product projection (`productWorkspace:getObjectiveWorkspaceV1`) as of capture
time — including the `activity` feed the founder actually saw (objective_interpreted,
manager_decision, intern_assigned, finding_added, etc.) — is preserved verbatim in
`product-workspace-v1-projection.json`.

## Final raw state after the later escalation

`objectives:getObjectiveStatus` at capture time:

```json
{
  "key": "obj_1790181742573_ohzr6j",
  "requirements": [
    { "requirementKey": "req_01", "state": "satisfied", "strategy": "MAKE" },
    { "requirementKey": "req_02", "state": "satisfied", "strategy": "MAKE" },
    { "requirementKey": "req_03", "state": "satisfied", "strategy": "MAKE" },
    { "requirementKey": "req_04", "state": "satisfied", "strategy": "MAKE" }
  ],
  "state": "escalated",
  "updatedAt": 1790182254535
}
```

All four requirements remain `satisfied`; only the top-level control state regressed.

## Explicit non-actions

- The historical Objective `obj_1790181742573_ohzr6j` was **not** mutated, repaired, or manually
  set back to `completed`. Its current persisted state remains `escalated`, exactly as the live run
  left it.
- No new Founder E2E was run to produce this evidence; all data was read from the existing local
  Convex deployment that was already running from the live session.
