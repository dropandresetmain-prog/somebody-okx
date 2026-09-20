# Agent Model Selection

## Import provenance

- **Source repository:** `dropandresetmain-prog/resume-copilot`
- **Source path:** `docs/agent/AGENT_MODEL_SELECTION.md`
- **Source SHA:** `78d147716cf314b766aaed91d9fcde23959ea690` (branch `main`, commit `docs(agent): refine model routing and arsenal`, 2026-09-13)
- **Imported:** 17 September 2026
- **Purpose in Somebody-OKX:** default operational model/harness/effort routing and subagent-delegation guidance for this repository.

### Reading notes for Somebody-OKX

**"Folio" is the originating project** (Resume Copilot) whose verified outcomes produced this routing. The name is preserved deliberately so that observed-evidence claims stay attributed to their real source rather than being misread as Somebody-OKX history. Somebody-OKX adopts the routing and the evidence discipline, not the claim of having run the routes itself.

The reference to `docs/work/ACTIVE_TASK.md` resolves natively: Somebody-OKX maintains that file at the same path.

## Somebody-OKX operating overrides

These overrides sit **above** the routing tables below and are not superseded by them.

The following stay with the primary model and are never delegated to a subagent or cheaper route:

- architecture;
- integration decisions;
- wallet, signing and payment work;
- security-sensitive code;
- final verification.

Bounded, independent, low-risk work may be delegated according to the routing guidance in this document.

Somebody-OKX additions to the Critical class: **any OKX/X Layer payment, spend authorization, wallet credential or settlement path is Critical by default**, regardless of how small the change looks. The project rule that submission is not completion applies to model routing too — a delegated route may not be the thing that declares an external payment or provider result verified.

---

Lean routing guidance for choosing an AI harness, model class and effort level for Folio engineering work.

For volatile model-specific evidence, current roster notes, sentiment, fallbacks and research links, see [`MODEL_ARSENAL.md`](MODEL_ARSENAL.md). Routine work should not load that deeper file unless routing is genuinely unclear or needs reevaluation.

Last routing review: **2026-09-13**.

## Routing order

Choose in this order:

1. **Role** — Planner / Architect, Prompter, Implementer, Integrator, Reviewer, Promotion / Release.
2. **Harness** — use the surface that can actually access the required repo/worktree, terminal, browser, database, secrets or provider environment.
3. **Task shape / risk** — Bounded, Normal, Complex or Critical.
4. **Independence** — use a different model family/surface only when independent judgment materially reduces unresolved risk.
5. **Effort** — raise reasoning only when the task warrants it.

Model prestige is not a routing rule. Prefer the least costly/slow route that can safely complete and verify the assigned role.

## Task classes

| Class | Use for | Routing intent |
|---|---|---|
| **Bounded** | Scope, contracts, acceptance criteria and verification path are clear, even if implementation is difficult | Strong execution model; bounded does **not** mean trivial or cheap |
| **Normal** | Ordinary features, refactors, tests and API/UI work with some local judgment but no major unresolved architecture | Daily-driver model/router |
| **Complex** | Cross-contract work, hard debugging, long-horizon tasks, ambiguous integration or architecture ownership | Strong explicit model or intelligence router |
| **Critical** | Auth/RLS, migrations, destructive state, concurrency/CAS/idempotency, payments, rollback or security-sensitive irreversible seams | Strong primary, required execution evidence, and independent review when it materially reduces unresolved risk |

Risk reflects failure cost and ambiguity, not milestone importance. A hard implementation can still be Bounded when the destination and verification are already clear.

## Harness map

| Harness | Best use | Important constraint |
|---|---|---|
| **ChatGPT + GitHub** | Planning, prompt generation, repo reasoning, static review | Inspection is not execution evidence |
| **Cursor** | Default fast local implementation, terminal/test/browser loops | Prefer Auto unless a named-model reason exists |
| **Codex** | Local implementation, terminal/tests, sustained execution, migrations/debugging | Choose model/effort by task shape and risk |
| **Claude Code** | Local implementation, long-context work, independent implementation/review | Useful family independence from OpenAI/Qwen/GLM |
| **Qoder** | Qwen/Kimi implementation and long-context alternatives | Observed slow on the user's ARM64 machine; latency matters most when rapid write/run/fix iteration dominates |
| **Kilo + OpenRouter** | Alternative-family bounded work, delegated tasks, specialist models and second opinions | Provider reliability/privacy/tool support varies; never expose secrets to unapproved/free routes |
| **Cursor + OpenRouter, where configured/supported** | Same OpenRouter model pool when the editor/provider path is available | Treat provider support as operational state, not a permanent assumption |

Astra is a **model**, not a harness. Route GPT-6 Astra through a surface that actually supports the required repo/tool execution.

When local latency matters, prefer Cursor/Codex/Claude Code over Qoder. For bounded tasks requiring fewer iterations, Qwen3.8-Flash or GLM-5.3-Flash can still be good total-time choices despite Qoder's slower local loop.

## Default routing

| Task shape | Strong defaults | Notes |
|---|---|---|
| Planner / architecture, Normal | ChatGPT Medium; Terra High; Sonnet; GLM-5.3; Qwen3.8-Max | Do not use Astra merely because the task is planning |
| Architecture closure / implementation-plan synthesis | GPT-6 Astra Medium/High; Sol High; Opus High; GLM-5.3 or Qwen3.8-Max as alternatives | Independent challenge only when material uncertainty or irreversible architecture remains |
| Planner / architecture, Critical | Astra High; Sol High; Opus High | Use one independent challenge when it meaningfully reduces unresolved risk |
| Prompter from approved plan | ChatGPT Medium | Convert the plan; do not re-plan/review it |
| Bounded implementation | Luna High; GLM-5.3-Flash; Qwen3.8-Flash; Cursor Auto Cost/Balance; Composer 2.5 | Defined task with clear acceptance and verification |
| Hard bounded implementation | Luna xHigh/Max; Cursor Auto Intelligence; Grok 4.6 High; Qwen3.8-Max; GLM-5.3 | Difficulty alone does not make a task Complex |
| Normal implementation | Cursor Auto Balance; Composer 2.5; Grok 4.6 Medium; Terra; Sonnet; GLM-5.3-Flash; Qwen3.8-Flash | Astra and N2.5 are not Normal defaults |
| Complex reversible implementation | Cursor Auto Intelligence; Grok 4.6 High; Terra High; Sonnet High; GLM-5.3; Qwen3.8-Max; Kimi K3 | Harness stability matters as much as model capability |
| Long-horizon agent task | Auto Intelligence; Grok 4.6 High; GLM-5.3; Qwen3.8-Max; Kimi K3 | Use `ACTIVE_TASK.md`; preserve checkpoint evidence across compaction |
| Hard debugging / DevOps | Grok 4.6 High; Terra High; Sol High; GLM-5.3; Astra High when hypothesis-space ambiguity is the hard part | Prefer terminal-capable fast harness |
| Normal integration | Auto Balance; Composer; Grok; Terra; Sonnet; GLM-5.3-Flash | Test new seams/conflicts, not every historical lane |
| Complex integration | Auto Intelligence; Grok High; Terra High; Sonnet High; GLM-5.3 | Escalate only for concrete risk or ambiguity |
| Routine static review | ChatGPT Medium/High; GLM-5.3; Grok; Terra; Sonnet; Qwen3.8-Max | A review should answer a concrete question |
| High-risk review | Sol High; Opus High; Astra High; GLM-5.3 where Critical-capable for the question | Runtime/DB/browser evidence remains authoritative |
| Specialist browser/computer-use experiment | Nex-N2.5 Pro or Mini via OpenRouter + supported harness | Specialist/experimental route, not a Normal default |
| High-throughput bounded extraction/transformation | Nemotron 3.5 Lightning; Luna Medium; GLM-5.3-Flash | Not a final verifier for Critical work |

## Family shortcuts

- **Cursor:** Auto Balance for Normal; Auto Intelligence for Complex; Auto Cost for well-defined bounded work. Choose Composer/Grok/Terra/Sonnet explicitly for repeatability, family diversity or known strengths.
- **OpenAI Luna:** effort-sensitive bounded executor. High for solid defined implementation; xHigh for difficult bounded engineering; Max for sustained hard bounded execution when extra reasoning is justified. Do not assume "small tier" means low capability.
- **OpenAI Terra:** general engineering workhorse for broader Normal/Complex work.
- **OpenAI Sol:** Critical/high-stakes work when ambiguity or failure cost justifies it.
- **GPT-6 Astra:** Complex/Critical architecture, investigation and end-to-end work where the hard part is unresolved reasoning, not routine implementation. No Normal route.
- **Anthropic:** Sonnet for general/cross-contract implementation; Opus for Critical work and independent review.
- **Qwen on Qoder:** Qwen3.8-Flash for Bounded/Normal-defined work; Qwen3.8-Max for Complex. Qwen3.7 routes are fallbacks.
- **GLM:** GLM-5.3-Flash for Bounded/Normal-defined implementation; GLM-5.3 for Complex implementation/debugging/review.
- **Nex-AGI N2.5:** only Mini and Pro are operational Folio routes through OpenRouter. Use as specialist/experimental agentic browser/computer-use routes, not Normal defaults.
- **Kimi:** Kimi K3 is a Complex/long-horizon alternative, not a universal default.
- **NVIDIA Nemotron:** specialist/challenger for non-sensitive bounded work; 3.5 Lightning is not promoted to primary coding based on speed alone. For Somebody × OKX M6 free OpenRouter runs, prefer catalog-flagged structured+tools slugs (see `MODEL_ARSENAL.md` — Somebody × OKX free list); avoid content-safety and Ultra free unless re-checked.

See [`MODEL_ARSENAL.md`](MODEL_ARSENAL.md) before changing the roster or model-specific claims.

## Named-model rules that remain important

- **Composer 2.5** is a legitimate general-purpose primary implementer, not just a mechanical editor.
- **Grok 4.6** is a legitimate Normal/Complex implementation and investigation model. Medium is a practical bounded/Normal default; High for sustained reasoning or higher failure cost.
- **Luna High/xHigh/Max** are serious implementation routes for defined work. Escalate effort with task difficulty, not model prestige.
- **GLM-5.3-Flash** and **Qwen3.8-Flash** have earned first-class Bounded/Normal-defined routes from current Folio/cross-project use.
- **Astra** is not a Normal implementation default.
- **Nex-N2.5 Pro/Mini** are specialist/experimental routes, not default coders.
- **Sol / Opus / Astra** are explicit higher-ceiling choices for concrete risk, ambiguity or independence reasons, not ceremonial escalation.

## Luna effort guidance

Luna supports `none`, `low`, `medium`, `high`, `xhigh` and `max`. For Folio engineering:

- **Medium:** small defined edits, tests, transformations and isolated slices.
- **High:** default serious bounded implementation with clear contracts and verification.
- **xHigh:** difficult multi-file bounded engineering where architecture is already understood.
- **Max:** sustained hard bounded execution when extra reasoning is useful and quota/wall-clock cost is acceptable.
- If the hard part is discovering the architecture, reconciling ambiguous contracts or deciding an irreversible seam, move to a broader/stronger planner rather than blindly increasing Luna effort.

Current external evaluations show meaningful High → xHigh → Max capability scaling, but also materially higher token use and wall-clock time. Treat that as routing evidence, not a permanent benchmark ranking.

## Three-option planning standard

When a Folio implementation plan assigns models to milestones/reviews, prefer **three viable model + harness routes** instead of one hard-coded model.

The three should normally represent:

1. strongest/default fit for the task's failure mode;
2. credible different-family/harness alternative;
3. cost/availability-conscious option that is still safe for the stated risk.

**These are alternatives. Choose one route. Do not execute all three.**

For Critical work, the third route must still be Critical-capable. There is no obligation to offer an unsafe low-cost route.

The selected implementer determines which reviewer choices remain sufficiently independent.

## Review without review hell

**Verification is risk-driven. Model review is uncertainty-driven.**

- Bounded and Normal work do **not** get a reviewer by default.
- Complex work gets review only for material uncertainty, cross-contract risk or a seam whose failure would be expensive.
- Critical work normally justifies **one** independent reviewer plus the required execution evidence. That reviewer is already the challenger.
- Add a third model only when material disagreement or unresolved uncertainty remains after the primary and reviewer.
- A reviewer-requested fix gets verification of the fix and directly affected behavior; it does not automatically restart the full review cycle.
- Promotion runs the canonical evidence gate on the exact candidate. Promotion is not another AI-review stage.
- A different model never replaces required runtime, DB/RLS, browser or release evidence.

## Subagents

Implementation prompts should preserve:

> Delegate well-defined bounded tasks to cheaper subagents where useful. Keep architecture, integration decisions, high-risk changes and final verification with the primary model.

"Cheaper" refers to delegation economics, not a claim that bounded tasks are low-value or easy.

Good delegated work includes targeted research, extraction, fixtures/tests with stable contracts, repetitive transformations, isolated UI pieces and documentation cleanup.

Do not delegate ambiguous architecture or Critical persistence/security decisions merely because a free model is available.

## Long-horizon reliability

For work expected to exceed a normal coding session, maintain `docs/work/ACTIVE_TASK.md` (or the current project equivalent) with goal, branch/base SHA, checklist, checkpoint, next action and critical constraints. Re-read before major phases, after compaction/delegation and before completion. Close checklist items only with evidence.

## Privacy, reliability and free routes

- Never send secrets, credentials, `.env` contents, private keys or unnecessary personal data to a model.
- OpenRouter handling is provider-specific. Proprietary/sensitive code requires an acceptable provider/privacy route.
- Treat free routes as non-sensitive-only unless current provider policy is explicitly verified otherwise.
- Free availability, provider routing, limits, pricing, context windows and data policies change. Re-check them when material to the task.

## Cross-project evidence incorporated in this review

- Northstar's September 2026 Astra pass was effective at repo reconstruction, ontology stress-testing, architecture closure and producing an implementation-ready plan. Keep Astra for Complex/Critical planning/investigation rather than Normal implementation.
- The separation between **architecture closure** and **implementation ownership** is useful: one model can design/close architecture while another executes against frozen contracts, reducing self-justifying drift.
- Current work has produced good practical results from **GLM-5.3-Flash** and **Qwen3.8-Flash**, including through Qoder. They are legitimate defined-task implementers, not merely cheap subagents.
- Luna High/xHigh/Max deserves effort-aware routing: high reasoning effort can make Luna a strong bounded executor while remaining a poor substitute for architecture ownership when the destination itself is unclear.
- Nex-N2.5 Mini/Pro are available through OpenRouter and are worth specialist experimentation for browser/computer-use and run-observe-fix loops. N2.5 Max is not an operational Folio route.
- Qoder remains valuable for Qwen/Kimi despite the local ARM64 latency penalty; choose by total task shape, not local latency alone.

## How routing evolves

Do not run a formal bakeoff unless explicitly requested. Update routing from normal project evidence: first-pass correctness, rework, scope creep, verification quality, wall-clock time, quota/cost and required human steering.

A benchmark can justify trying a model. Verified Folio outcomes decide whether it keeps the slot.
