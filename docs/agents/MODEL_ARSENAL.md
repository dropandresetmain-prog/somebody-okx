# Models Arsenal

## Import provenance

- **Source repository:** `dropandresetmain-prog/resume-copilot`
- **Source path:** `docs/agent/MODELS_ARSENAL.md`
- **Source SHA:** `78d147716cf314b766aaed91d9fcde23959ea690` (branch `main`, commit `docs(agent): refine model routing and arsenal`, 2026-09-13)
- **Imported:** 17 September 2026
- **Purpose in Somebody-OKX:** canonical model/harness reference behind the project's default model and subagent selection guidance. Read it when changing a route, not for routine work.

### Reading notes for Somebody-OKX

**"Folio" is the originating project** (Resume Copilot) whose verified outcomes produced this guidance. The name is preserved deliberately: the observed-evidence claims belong to that project's history and must not be relabelled as Somebody-OKX experience. Read "Folio routing" as "the routing guidance this project has adopted", and read "Folio/cross-project evidence" as prior evidence from the originating project.

Somebody-OKX adopts the routing rules and the evidence discipline. It does not inherit the claim of having run these routes itself.

**Somebody-OKX retains a stricter delegation boundary than this document alone implies.** Architecture, integration decisions, wallet/signing/payment work, security-sensitive code and final verification stay with the primary model. See the operating overrides in [`AGENT_MODEL_SELECTION.md`](AGENT_MODEL_SELECTION.md).

---

Deeper reference for the AI models and harnesses available for Folio engineering work.

This file supports [`AGENT_MODEL_SELECTION.md`](AGENT_MODEL_SELECTION.md). The routing file is the operational source of truth; this document stores more volatile model-specific evidence, observed constraints, sentiment and fallback logic so routine agents do not need to load it.

Research review: **2026-09-13**.

## How to use this file

Read this file when:

- adding or removing a model/harness;
- reconsidering a route in `AGENT_MODEL_SELECTION.md`;
- a model has produced repeated Folio rework;
- a provider changes pricing, context, privacy or availability materially;
- an unfamiliar model is being proposed for Complex/Critical work.

Do not turn benchmark rank into architecture authority. Model performance is harness-sensitive and changes quickly. Community reports are directional evidence, not controlled experiments. Folio/cross-project verified outcomes outrank benchmark prestige.

The current routing distinction is also **not a price ladder**. "Bounded" means the destination, contracts, acceptance criteria and verification path are sufficiently defined. A bounded task can be technically difficult and can justify high reasoning effort.

## Current roster

| Family / surface | Current role in Folio routing | Status |
|---|---|---|
| Cursor Auto Balance | Daily-driver ordinary implementation | Primary |
| Cursor Auto Intelligence | Harder reversible implementation/integration | Primary Complex |
| Cursor Auto Cost | Well-defined bounded work | Bounded |
| Cursor Composer 2.5 | General hands-on implementation and fast write/run/fix | Primary |
| Cursor Grok 4.6 | Complex implementation, investigation, debugging | Primary / Complex |
| GPT-5.6 Luna High | Serious bounded implementation | Bounded primary |
| GPT-5.6 Luna xHigh | Difficult bounded multi-file execution | Bounded high-compute |
| GPT-5.6 Luna Max | Sustained hard bounded execution | Bounded ceiling |
| GPT-5.6 Terra | General engineering workhorse | Primary |
| GPT-5.6 Sol | Critical work and high-stakes review | Critical |
| GPT-6 Astra | Complex/Critical architecture, investigation and hardest end-to-end work | Complex / Critical |
| Anthropic Sonnet | General and cross-contract implementation | Primary |
| Anthropic Opus | Critical work and independent review | Critical |
| Qwen3.8-Flash | Bounded/Normal-defined Qoder implementation | Primary Qoder |
| Qwen3.8-Max | Complex Qoder implementation/planning | Complex Qoder |
| Qwen3.7-Plus | Stable older-generation fallback | Fallback |
| Qwen3.7-Max | Older flagship fallback when needed | Fallback |
| GLM-5.3-Flash | Bounded/Normal-defined implementation and delegated work | Primary alternative |
| GLM-5.3 | Complex coding, debugging and independent review | Complex / Reviewer |
| GLM-5.2-free | Free long-context reasoning when route works | Opportunistic |
| Kimi K3 | Complex planning, long-horizon coding, alternative family | Complex / Experimental-primary |
| Nex-N2.5 Mini | Agentic browser/computer-use specialist via OpenRouter | Specialist / Experimental |
| Nex-N2.5 Pro | Stronger agentic browser/computer-use specialist via OpenRouter | Specialist / Experimental |
| NVIDIA Nemotron 3 Ultra | Long-context synthesis, specialist challenger | Specialist |
| NVIDIA Nemotron 3.5 Lightning | High-throughput bounded extraction/execution | Bounded specialist |

Nex-N2.5 Max exists upstream but is **not an operational Folio route** because current hosted access available to this workflow is Mini/Pro through OpenRouter. Do not make agents deliberate over unavailable routes.

Fable/other frontier models may remain useful benchmark or ceiling references when available, but they do not need a standing route unless an accessible harness makes them operationally relevant.

## Harness realities

Model quality without a usable harness is irrelevant.

### Cursor

Current default local execution surface for time-sensitive work because it supports repository editing, terminal/test loops, browser integrations and fast iteration.

Cursor Auto is first-class routing, not a fallback for indecision:

- **Auto Balance:** normal implementation default;
- **Auto Intelligence:** materially harder reversible work;
- **Auto Cost:** well-specified bounded work that is cheap to verify.

Select a named model when independence, repeatability, benchmarking or a known family strength/failure mode matters.

OpenRouter models may also be usable through Cursor depending on current provider configuration/support. Treat that as operational state to verify, not a permanent assumption.

### Qoder

Current Qoder arsenal includes:

- Qwen3.8-Max;
- Qwen3.8-Flash;
- Qwen3.7-Max;
- Qwen3.7-Plus;
- GLM-5.3;
- GLM-5.3-Flash;
- Kimi K3;
- other models exposed by the current Qoder catalogue.

Qoder's current model selector explicitly exposes GLM-5.3-Flash and Qwen3.8-Flash with configurable thinking effort. That makes the user's positive observed results on those routes operationally relevant, not hypothetical.

Reference:

- https://docs.qoder.com/qoder/model-selector

**Observed local constraint:** Qoder is slow on the user's ARM64 computer. This is a harness/hardware latency issue, not evidence that the underlying models are weak.

Routing implication:

- use Qwen3.8-Flash confidently for well-defined work where fewer iterations can offset slower local interaction;
- use Qwen3.8-Max/Kimi when model fit justifies the latency;
- avoid Qoder when rapid terminal write/run/fix iteration dominates wall-clock time;
- prefer Cursor, Codex or Claude Code when local iteration speed is the main constraint.

Current Folio/cross-project experience with Qwen3.8-Flash on Qoder is positive enough that it should not be relegated to "cheap subagent" status.

### Kilo + OpenRouter

Kilo is the preferred explicit OpenRouter harness for free/cheap and alternative-family models, including Nex-N2.5 and NVIDIA routes.

Useful for:

- bounded delegated work;
- specialist browser/computer-use models;
- independent opinions;
- alternative-family static review;
- large-context reading/synthesis;
- experiments that do not justify premium quota.

OpenRouter routing can vary by provider, so model identity alone does not guarantee identical latency, privacy, tool support or reliability.

Do **not** let a free endpoint become a critical dependency merely because the token price is zero.

References:

- https://kilo.ai/docs/ai-providers/openrouter
- https://kilo.ai/docs/code-with-ai/platforms/vscode
- https://openrouter.ai/blog/tutorials/kilo-code-openrouter/

### ChatGPT + GitHub

Strong for repository reasoning, planning, prompt generation and static review. It can inspect the repo but static inspection is not execution evidence. Use an execution harness for tests/builds/browser/DB checks when required.

### Codex / Claude Code

Both remain strong execution surfaces when local terminal work, independent model-family behavior or sustained coding context makes them a better fit than Cursor.

### Astra is not a harness

GPT-6 Astra is a model. The earlier routing doc incorrectly listed Astra alongside execution surfaces. Route it through the actual surface that supports the required tools/repo environment.

## OpenAI family

### GPT-5.6 Luna

Position: **effort-sensitive bounded executor**, not merely an "economy model."

Official model facts as of this review:

- 1.05M context;
- 128K max output;
- reasoning efforts `none`, `low`, `medium`, `high`, `xhigh`, `max`;
- API list price: $0.20/M input, $1.20/M output before long-context multipliers/tool fees.

Official reference:

- https://developers.openai.com/api/docs/models/gpt-5.6-luna

#### Why the routing changed

The old Folio description ("bounded/economical worker") materially understated Luna at high reasoning effort.

Artificial Analysis' current independent results show meaningful capability scaling with effort:

- **High:** Intelligence Index 32;
- **xHigh:** 35;
- **Max:** 38.

Their July 2026 GPT-5.6 evaluation also found Luna Max very competitive in the Coding Agent Index while costing materially less per task than Sol, and placed Luna/Sol on the intelligence-vs-cost Pareto frontier across reasoning levels. These numbers are evidence that Luna can be a serious engineering executor; they are not a permanent guarantee that Max wins every coding task.

References:

- https://artificialanalysis.ai/models/gpt-5-6-luna-high
- https://artificialanalysis.ai/models/gpt-5-6-luna-xhigh
- https://artificialanalysis.ai/articles/gpt-5-6-has-landed

#### Folio effort ladder

| Effort | Folio use |
|---|---|
| **Medium** | Small defined edits, tests, fixtures, transformations, isolated slices |
| **High** | Default serious bounded implementation with clear contracts and verification |
| **xHigh** | Difficult multi-file bounded engineering where architecture/contracts are already understood |
| **Max** | Sustained hard bounded execution where extra reasoning is useful and quota/wall-clock burn is acceptable |

The key distinction is **destination clarity**. Luna can spend a lot of compute executing against a known target. It is not the default model for discovering architecture, reconciling ambiguous system contracts or deciding irreversible seams.

Do not route by the phrase "small model." At High/xHigh/Max, Luna deserves direct consideration against much more expensive routes.

#### Trade-off

Higher Luna effort also increases token use and task duration. A Max route can be excellent on API-dollar economics while still being the wrong choice for subscription quota or wall-clock latency.

Preferred escalation pattern:

1. High for serious defined work;
2. xHigh when the bounded task is materially difficult;
3. Max when sustained reasoning is actually useful;
4. switch model family/tier when the problem is ambiguity/architecture rather than execution difficulty.

### GPT-5.6 Terra

Position: **general engineering workhorse**.

Use Medium for focused work and High for larger reversible features, difficult debugging, broader integration or several interacting contracts. Terra is a peer option, not a mandatory escalation above Composer/Grok/Auto.

### GPT-5.6 Sol

Position: **Critical/high-stakes route**.

Officially supports `none` through `max` and shares the 1.05M context/128K max-output envelope of the GPT-5.6 family.

Use when there is a concrete reason: unresolved high-cost architecture, RLS/auth/migrations/destructive state/concurrency/payments, independent high-stakes review or repeated rework from normal-tier models.

Reference:

- https://developers.openai.com/api/docs/models/gpt-5.6-sol

### GPT-6 Astra

Position: **Complex/Critical architecture, investigation and hardest end-to-end work. No Normal route.**

Official model facts as of this review:

- OpenAI describes it as the most capable model for the hardest end-to-end work;
- 1.05M context;
- 128K max output;
- `low`, `medium`, `high`, `xhigh`, `max` reasoning;
- supports complex reasoning, coding, computer use, research and document creation;
- API list price: $10/M input and $50/M output before long-context multipliers/tool fees.

References:

- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/guides/latest-model

#### Folio effort ladder

| Effort | Folio use |
|---|---|
| **Low** | Focused follow-up inside an already-understood Complex task; not a Normal default |
| **Medium** | Architecture reconstruction, implementation-plan synthesis, broad repo reasoning |
| **High** | Architecture closure, ambiguous cross-contract investigation, difficult high-value debugging/review |
| **xHigh** | Exception when High leaves material unresolved ambiguity or one-shot failure cost is unusually high |
| **Max** | Ceiling only: repeated failure below, extremely high-value deep investigation, or a genuinely nasty one-shot reasoning problem |

**Max is not "Critical mode."** Criticality does not automatically justify Max, and architecture importance does not automatically justify Astra.

Observed cross-project evidence: Northstar's September 2026 Astra pass was strong at repo reconstruction, ontology stress-testing, architecture closure and implementation-plan synthesis. That earns Astra a planning/investigation route, not a Normal implementation default.

The useful pattern is to separate **architecture closure** from **implementation ownership**: Astra can close the model of the system while another execution model implements against frozen contracts.

### Anthropic Sonnet / Opus

**Sonnet:** strong general implementation/reasoning peer for sustained cross-contract work and a family-independent alternative to OpenAI/Qwen/GLM.

**Opus:** Critical/high-stakes route and independent reviewer when concrete risk or independence justifies it.

## Cursor models

### Cursor Composer 2.5

Position: **general-purpose primary implementer**.

Good fits:

- complete bounded features;
- frontend/backend implementation;
- multi-file changes;
- API plumbing;
- UI behavior;
- tests/fixtures;
- refactors;
- fast iterative write/run/fix loops.

Do not demote Composer to mechanical edits. Its limitation on unresolved irreversible architecture is a role/risk boundary, not a claim of weak coding ability.

Reference:

- https://prod.cursor.com/en-US/composer

### Cursor Grok 4.6

Position: **frontier implementation/investigation option**.

Strong fits:

- difficult reversible features;
- multi-file/cross-service work;
- long-horizon agentic execution;
- hard debugging with multiple hypotheses;
- DevOps/terminal work that can be checked by execution;
- substantial codebase investigation.

Effort routing remains roughly:

- Medium for bounded/Normal reversible work;
- High for sustained reasoning or higher failure cost;
- xHigh only for a concrete need.

References:

- https://cursor.com/grok
- https://cursor.com/blog/grok-4-6
- https://cursor.com/docs/models/grok-4-6
- https://artificialanalysis.ai/articles/grok-4-6-benchmarks-and-analysis

## Qwen family — primarily through Qoder

### Qwen3.8-Max

Position: **Complex Qoder primary**.

Why it has a route:

- current flagship capability;
- long-context/codebase reasoning;
- multimodal support;
- long-horizon planning and implementation;
- useful family diversity from OpenAI/Anthropic/GLM.

Folio judgment: use for Complex reversible work when Qoder latency is acceptable. Do not route urgent write/run/fix loops to it on the current ARM64 machine when interaction latency dominates.

References:

- https://github.com/AlibabaCloud-Official/Qwen3.8-max
- https://artificialanalysis.ai/models/qwen3-8-max

### Qwen3.8-Flash

Position: **first-class Bounded/Normal-defined Qoder primary**.

The previous description leaned too heavily on "economical." Current Folio/cross-project evidence matters more: Qwen3.8-Flash has been producing good practical results through Qoder and deserves a real implementation route.

Good fits:

- well-scoped feature implementation;
- defined multi-file changes;
- tests/fixtures;
- refactors with known contracts;
- delegated slices with clear acceptance;
- Normal work where architecture is already stable.

The Qoder ARM64 latency penalty remains real, but it is a harness constraint. If the model completes a bounded task in fewer iterations, it can still win on total wall-clock time.

Folio judgment: treat as a capable defined-task implementer, not a "cheap subagent."

References:

- https://docs.qwencloud.com/developer-guides/getting-started/latest-model
- https://www.qwencloud.com/models/qwen3.8-flash

### Qwen3.7-Plus / Qwen3.7-Max

Fallbacks for continuity or route-specific reliability. Prefer the 3.8 generation for new work unless the current route is unavailable or behaving poorly.

References:

- https://www.alibabacloud.com/help/en/model-studio/qwen3-7-plus
- https://www.alibabacloud.com/help/en/model-studio/qwen3-7-max

## GLM family

### GLM-5.3

Position: **Complex implementation, debugging and independent reviewer/challenger**.

Good fits:

- complex reversible implementation;
- large-repo investigation;
- static review after a different-family implementer;
- multi-hypothesis debugging;
- challenger on architecture/integration decisions.

Its workflow value is not just raw capability but model-family independence.

References:

- https://openrouter.ai/z-ai
- https://huggingface.co/zai-org/GLM-5.3

### GLM-5.3-Flash

Position: **first-class Bounded/Normal-defined implementation route**.

Z.ai's current model card describes a 320B-total / 18B-active native multimodal model with hybrid sparse/linear attention, optimized for efficient coding and long-context agent tasks.

Why it matters:

- strong capability-per-cost;
- credible primary for defined implementation;
- attractive delegated-subagent model;
- useful different-family second opinion;
- native multimodal/agentic fit.

Current Folio/cross-project experience has been positive enough that "economy powerhouse" undersells its role. It is not reserved for cheap work.

Folio judgment: one of the strongest current routes for bounded or Normal-defined work through a supported harness. Primary-agent accountability and scoped verification still apply.

References:

- https://huggingface.co/zai-org/GLM-5.3-Flash
- https://openrouter.ai/provider/z-ai

### GLM-5.2-free

Position: **opportunistic free model only**.

Good for optional second opinions, summarization/context compression, bounded research and noncritical code reading. Do not put an unreliable free endpoint on a critical path.

Reference:

- https://openrouter.ai/z-ai/glm-5.2:free

## Nex-AGI N2.5 — OpenRouter specialist routes

Operational Folio routes: **Nex-N2.5 Mini and Nex-N2.5 Pro only.**

Nex officially describes N2.5 as an agentic family built for long-horizon tasks in real-world environments. Mini and Pro retain multimodal foundations with improvements in computer use, web browsing and visually grounded agentic behavior. Nex emphasizes continuous action and self-correction through visual feedback: operating computers/browsers, executing/testing programs, observing results, revising and testing again.

Official hosted access listed by Nex is OpenRouter for **Pro** and **Mini**. The provider page currently exposes two Nex-AGI models on OpenRouter: Mini and Pro.

References:

- https://github.com/nex-agi/Nex-N2.5
- https://openrouter.ai/provider/nex-agi

### Nex-N2.5 Mini

Position: **specialist/experimental bounded agentic worker**.

Good trial shapes:

- browser/computer-use automation;
- GUI QA;
- run-observe-fix loops;
- visually grounded verification;
- bounded tool-heavy workflows.

Do not promote it to generic Normal implementation merely because access is free.

### Nex-N2.5 Pro

Position: **stronger specialist/experimental agentic route**, not a Normal coding default.

Good trial shapes:

- longer autonomous browser/computer-use loops;
- tool-heavy implementation where success can be demonstrated in the environment;
- GUI-heavy validation;
- autonomous execution/retest loops;
- deep research or scientific workflows where environmental feedback matters.

Do not treat Pro as a generic replacement for Composer/Grok/Terra/Sonnet/GLM/Qwen. Its reason to exist in Folio routing is the **agentic visual feedback loop**, not benchmark prestige.

### N2.5 harness guidance

Use through OpenRouter with a supported editor/agent harness, likely Kilo and Cursor where configured/provider support is available.

Because current OpenRouter access is free, apply the same provider/privacy rule as other free routes: non-sensitive only unless the active provider policy is explicitly acceptable.

## Kimi family — through Qoder

### Kimi K3

Position: **Complex/long-horizon alternative**.

Why it has a route:

- strong long-context and knowledge-work capability;
- credible planning and complex coding performance;
- useful family diversity;
- multimodal support;
- potentially strong planner/implementer for broad tasks.

Folio judgment: retain as a Complex alternative rather than universal default. The Qoder-on-ARM64 latency penalty also makes it a poor urgent-loop choice regardless of model quality.

References:

- https://www.kimi.com/en/blog/kimi-k3
- https://www.kimi.com/en/help/agent/agent-overview

## NVIDIA Nemotron family — mainly through Kilo/OpenRouter

### NVIDIA Nemotron 3 Ultra

Position: **specialist/challenger, not default primary coder**.

Why keep it:

- strong long-context/agentic architecture;
- useful family-independent synthesis or second opinion;
- potentially valuable for large-volume reading/reasoning;
- free/OpenRouter availability can make it useful for non-sensitive work.

Folio judgment: use for non-sensitive long-context synthesis, research, challenger reasoning or when free access has real value. Promote only if organic Folio evidence earns it.

References:

- https://research.nvidia.com/labs/nemotron/Nemotron-3-Ultra/
- https://developer.nvidia.com/topics/ai/nemotron

### NVIDIA Nemotron 3.5 Lightning

Position: **high-throughput bounded worker**.

Good fits:

- file/data extraction;
- classification;
- structured transformations;
- summarization;
- repetitive subagent work;
- routing/screening with deterministic verification.

Bad fits:

- unresolved architecture;
- primary ownership of a complex feature;
- final Critical verification;
- migrations/RLS/auth/security/concurrency.

Folio judgment: speed is the feature. Use it like a specialist, not like a frontier architecture owner.

References:

- https://developer.nvidia.com/blog/nvidia-nemotron-3-5-lightning-delivers-fast-accurate-specialized-task-execution-for-long-running-agents/
- https://blogs.nvidia.com/blog/nemotron-lightning-switchyard-rtx-dgx/

## Review evidence and independence

Do not turn the larger arsenal into an AI committee.

**Verification is risk-driven. Model review is uncertainty-driven.**

- Bounded/Normal work does not need a reviewer by default.
- Complex work gets review only for a concrete unresolved question, material cross-contract risk or an expensive seam.
- Critical work normally justifies one independent reviewer plus required runtime/DB/browser evidence. One reviewer is already the challenger.
- A third model is justified only by material disagreement or unresolved uncertainty.
- Reviewer-requested fixes get scoped verification; they do not automatically restart the entire review cycle.
- Promotion is an evidence gate on the exact candidate, not another model-review stage.

Independence still matters when review is warranted: prefer a different model family or surface when practical to reduce correlated blind spots.

## Privacy and provider policy

Do not confuse OpenRouter's platform policy with the policy of every upstream provider.

Rules for Folio:

1. Never send secrets or `.env` contents to any model.
2. For proprietary code, verify the active provider's data policy when using OpenRouter; use data-collection/provider restrictions where supported.
3. Treat free routes as **non-sensitive-only unless current provider terms explicitly establish an acceptable route**.
4. A free endpoint's uptime, tool support, context limit, provider order and privacy terms can change independently of the model weights.
5. If a free route fails or rate-limits, fall back. Do not spend engineering time stabilizing a route whose main value is being free.

References:

- https://openrouter.ai/docs/guides/privacy/data-collection
- https://openrouter.ai/providers/
- https://openrouter.ai/blog/tutorials/kilo-code-openrouter/

## How to update the arsenal

Do not run formal bakeoffs unless explicitly requested.

Promote/demote models from normal Folio work using:

- first-pass correctness;
- review findings requiring repair;
- test/verification quality;
- scope creep;
- wall-clock completion time, including harness latency;
- token/quota/cost burn;
- human steering required;
- endpoint reliability;
- privacy suitability.

A model can be objectively stronger and still be the wrong route because its harness is slow, its endpoint is unreliable or a different family gives more useful review independence.

A cheaper model can also be the correct primary when the task is clearly bounded and its verification is strong. Do not equate price with role.

When the practical route changes, update [`AGENT_MODEL_SELECTION.md`](AGENT_MODEL_SELECTION.md) first. Update this file when the underlying rationale/evidence changes enough that future routing decisions would otherwise be misleading.
