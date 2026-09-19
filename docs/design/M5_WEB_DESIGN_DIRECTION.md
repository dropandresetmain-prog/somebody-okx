# M5 Web Design Direction — Somebody Demo Surface

Status: **PROVISIONALLY ACCEPTED — founder review 19 September 2026**; design direction only, not production integration  
Date: 19 September 2026  
Reference repo: `dropandresetmain-prog/somebody-okx`  
Reference SHAs: `main@37afaa5a7cd0aa82a30c63ce6795c48d34f04d07`; `feat/m4-management-engine@7723c096f58067c79a59782792ec4346184df1f4` (code review target inside M4 completion material remains `59f75f7`)

## 1. Design objective

The demo surface must make one proposition obvious within seconds:

> Somebody is the accountable AI manager. The company assembles itself around the founder's Objective, Somebody makes bounded managerial decisions, internal workers do work, external capability is bought only when needed, evidence changes subsequent action, and the Objective resolves only when outcomes are verified.

The surface therefore has two jobs at once:

1. **Operator clarity:** what is the Objective, what counts as done, what is happening now, what needs the founder, what changed, and what remains uncertain.
2. **Theatrical observability:** workers/resources visibly assemble and causal state visibly propagates without turning the product into a debugger or giant graph.

The default surface is founder-facing. A deeper observability view is secondary.

## 2. Current Somebody surface assessment

### Keep

The existing product identity is worth preserving rather than replacing:

- warm paper/surface palette (`#f4f1ea`, `#fffdf9`);
- orange as Somebody-presence/action (`#e4602a`);
- strong dark ink typography;
- state colours used semantically rather than decoratively;
- wordmark + mascot presence;
- “who has the ball?” concept;
- founder-friendly labels such as **Somebody**, **That Guy**, **Mission**, **Evidence** and **Result**;
- progressive disclosure instead of raw runtime internals.

### Change

The current workspace is structurally too close to a stacked SaaS detail page for the M4 product truth. It over-emphasises sections/cards and under-expresses causal management.

Main problems to solve:

- stacked sections make the experience read as a report rather than a live company being managed;
- important causal transitions (evidence arrives -> worker reacts -> new need emerges) are visually weak;
- resource needs and sourcing can become list-like implementation detail;
- persistent worker identity/reuse is not prominent enough;
- approvals do not yet become the dominant human-attention moment;
- the current page can expose technical vocabulary too readily;
- there is no compact system-world representation that shows internal vs external capability boundaries.

The new direction should preserve the visual language while changing the information architecture.

## 3. Mobbin findings

Mobbin is used here for production interaction patterns, not visual copying.

### Linear — record detail + focused context

Reference: [Linear issue/detail screen](https://mobbin.com/screens/62c94bcd-0559-4356-9d0e-bce71c021d88)

Pattern worth adapting: one primary work object with compact status/ownership metadata and detail-on-demand rather than a grid of equal-weight cards.

Why it matters: the Objective should be the dominant record. Requirements, workers, decisions and evidence are subordinate to it.

Do not copy: issue-tracker density or developer-oriented vocabulary as the primary experience.

### Stripe — transaction detail as a coherent lifecycle

Reference: [Stripe payment detail](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b)

Pattern worth adapting: a transaction is represented as one comprehensible object with status, amount/context and chronological activity, while deeper metadata is secondary.

Why it matters: Somebody’s external purchases need to read as governed business events, not raw blockchain mechanics.

Do not copy: payment-dashboard semantics as the whole product; payment is one boundary event inside a larger mission.

### Notion — primary content + contextual assistant layer

Reference: [Notion workspace/AI screen](https://mobbin.com/screens/ec1eddc9-37e7-45d3-bf7a-cbb30ab6b38b)

Pattern worth adapting: keep primary work content stable while contextual AI/supporting detail appears alongside it.

Why it matters: Somebody’s management layer should remain persistent without turning the whole product into chat.

Do not copy: document-centric IA where the Objective becomes merely a page body.

### Height / project-management detail

Reference: [Height project/task screen](https://mobbin.com/screens/6d955cd7-83eb-4b39-987c-65d3dd4196c9)

Pattern worth adapting: dense operational status can be scannable when hierarchy and progressive disclosure are disciplined.

Why it matters: Cutoff 2 requires WAIT / ASK / BLOCK / approval states to look intentional rather than broken.

Do not copy: generic task boards or card-grid project management as the primary metaphor.

## 4. NORTHSTAR transferable lessons

Source material inspected: `qoder-atlas` `docs/DESIGN.md`, `docs/MOTION_DESIGN.md`, `docs/FRONTEND_SEMANTIC_CONTRACT.md`, and accepted `docs/design/live-dependency-graph/README.md` (v5.6 visual contract).

Transfer these principles:

- **Operator surface first, system world second.** NORTHSTAR explicitly separates cockpit usability from richer system visualisation. Somebody should do the same.
- **Colour = semantic condition, motion = meaningful activity/state change.** Never use animation as generic “AI is alive” decoration.
- **Focus the first causal breakpoint, not every downstream consequence.** In Somebody, the focal object is the current managerial decision/blocked requirement, not every affected requirement.
- **State says what is true; renderer decides how truth is drawn.** Do not infer backend truth from coordinates, animation or visual proximity.
- **One strong focal object at a time.** A screen full of competing high-emphasis cards destroys operational hierarchy.
- **Semantic zoom/progressive disclosure.** The founder should see the mission; the X-ray view can reveal workers, requirements, evidence and dependencies.
- **Healthy/working states should still feel alive.** Motion does not belong only to errors.
- **No raw database graph.** The system map must answer product questions, not expose implementation nodes.

Do not transfer:

- travel-domain terminology;
- the NORTHSTAR graph as a default layout;
- backend “liveness” fields merely to drive animation;
- graph-specific ontology into Somebody’s product model;
- scenario-specific coordinates or hardcoded causal branches.

## 5. Web/reference findings

### Stripe

Stripe’s current design guidance emphasises keeping dynamic activity in the primary column and static metadata/context in a secondary column. This maps cleanly to mission activity vs Objective/Outcome context.

Source: https://support.stripe.com/questions/updates-to-the-customer-detail-page

### Ramp

Ramp’s spend workflows show the value of making approval a first-class interrupt: when human authority is required, the request, amount, policy context and action are placed together rather than buried in a timeline.

Sources:
- https://support.ramp.com/setting-up-spend-request-approvals
- https://support.ramp.com/policy-agent-overview

### Temporal

Temporal’s UI investment in workflow Event History reinforces that long-running processes need a comprehensible timeline/history, but the full event stream belongs in a deeper operational view rather than the executive surface.

Source: https://temporal.io/changelog/product-area/ui

### LangSmith

LangSmith demonstrates the usefulness of deep traces for diagnosis, but tracing is developer observability. Somebody should adapt the drill-down model, not the trace-first default.

Source: https://www.langchain.com/langsmith/observability

### Palantir operational applications

Palantir’s operational-app framing is relevant at the conceptual level: useful systems combine facts, decision logic and governed actions, then close the loop by observing results. Somebody should make that loop visible in founder language.

Sources:
- https://www.palantir.com/docs/foundry/platform-overview
- https://www.palantir.com/docs/foundry/app-building/operational-apps

## 6. Three visual directions

### Direction A — Living Company / Operations Map

**Mental model:** the company literally assembles around the Objective.

**Layout:** large spatial field with Objective at centre, Somebody as coordinating anchor, That Guys inside a company boundary, Somebody Else providers outside it, resources/evidence crossing the boundary.

**Main interaction:** select entities and watch the system reorganise as new requirements emerge.

**2–4 minute demo strength:** extremely theatrical; directly expresses “the company assembles itself.”

**Real-product strength:** useful for explaining who/what is engaged and how work crosses organizational boundaries.

**Risks:** becomes a giant graph; weak for reading rationale, approvals and outcome truth; layout gets difficult as unrelated objectives become more complex.

**Inspired by:** NORTHSTAR live dependency graph, command-centre/system maps, observability service maps.

### Direction B — Executive Mission Control

**Mental model:** one Objective is being actively managed. The founder sees mission truth, current managerial action, human interrupts and causal progress.

**Layout:**
- left: Objective + Outcome Contract + outcome levels;
- centre: live mission stream + compact “company field” showing assembled capacity;
- right: Somebody’s current decision, approvals/needs-you, evidence and inspector;
- deeper X-ray drawer: causal requirements/workers/providers/evidence graph.

**Main interaction:** follow the mission chronologically, act only when needed, inspect decisions/evidence on demand.

**2–4 minute demo strength:** strong because the story is legible without narration while still producing visible company-assembly moments.

**Real-product strength:** best operational hierarchy; scales to WAIT / ASK / BLOCK / approval-required states and unrelated objectives.

**Risks:** if under-designed, it can collapse back into a generic dashboard. The compact company field and causal motion must remain semantically meaningful.

**Inspired by:** Linear record hierarchy, Stripe lifecycle/detail, Ramp approval interrupts, NORTHSTAR focal-state discipline.

### Direction C — Causal Company Story

**Mental model:** the Objective is resolved through a sequence of decisions and effects.

**Layout:** one dominant horizontal/vertical causal timeline with large event beats: Objective -> decision -> worker -> purchase -> evidence -> effect -> verification.

**Main interaction:** scrub/select a causal moment and inspect detail.

**2–4 minute demo strength:** easiest story to understand and strongest “before/after” choreography.

**Real-product strength:** excellent audit/history view.

**Risks:** over-serialises work; weak representation of persistent workers, simultaneous requirements, waiting states and the company as an ongoing system.

**Inspired by:** transaction/event histories, Temporal timeline, audit trails.

## 7. Recommended direction

**Direction B — Executive Mission Control, with a deliberately small Living Company layer from Direction A.**

The default product should not ask the founder to operate a graph. The Objective and its Outcome Contract remain the visual anchor. A compact company field makes invisible managerial assembly visible: Somebody in the middle, persistent That Guys inside a clear company boundary, external providers outside it, and evidence/effects crossing that boundary.

The mission stream below/alongside the field tells the causal story in founder language. A secondary X-ray view expands into the deeper graph only when the user wants to inspect how requirements, workers, providers, evidence and decisions connect.

Core metaphor:

> **The Objective creates demand; Somebody assembles the company required to satisfy it.**

## 8. Information architecture

### Persistent Objective rail

Show:

- founder request;
- current high-level mission state;
- founder-friendly Outcome Contract;
- outcome levels as discrete proof bars: Achieved / Current / Pending / Not proven;
- remaining uncertainty.

Avoid fake percentage completion.

### Somebody / Now

Persistent current-state sentence:

- “Somebody is comparing ways to obtain social intelligence.”
- “Somebody needs your approval to spend up to $0.40.”
- “Somebody is verifying the relaunch post.”

This is the strongest answer to “what is happening right now?”

### Company field

Internal boundary contains:

- Somebody;
- persistent That Guys;
- active assignment state;
- reused/new distinction when relevant.

External providers stay visually outside the boundary. When bought evidence arrives, it visibly crosses the boundary and activates the receiving worker.

### Mission stream

Founder-language events only:

- requirement emerged;
- That Guy reused/created;
- artifact changed;
- decision made;
- approval requested;
- external resource purchased;
- evidence arrived;
- worker reacted;
- external effect executed;
- effect verified;
- Objective resolved.

### Human attention rail

Only appears prominently when needed:

- approval required;
- question/ASK;
- blocker;
- materially ambiguous decision;
- unsafe/unsupported external action.

### Inspector / progressive disclosure

Selecting a worker, decision, evidence item or provider opens detail without changing mission truth.

## 9. Observability model

Default = **operator surface**.

Secondary = **System X-ray**.

The X-ray can expose:

- Objective / Outcome Contract;
- requirements and dependency links;
- worker identities + assignments;
- managerial decisions;
- MAKE / BUY / HYBRID / WAIT / ASK / BLOCK states;
- provider boundaries;
- evidence arrivals;
- execution intents/effects;
- wake/replan events;
- verification state.

Do not expose LangGraph implementation nodes (`observe`, `reduce`, `decide`, `settle`) as product objects.

## 10. Animation semantics

Every animation must correspond to known presentation state.

- **Somebody working:** restrained orange breathing ring, 2.2–2.6s.
- **That Guy active:** short directional pulse on the assignment line; worker chip has subtle active shimmer/pulse.
- **Waiting:** slower motion, reduced amplitude; no spinner.
- **Approval required:** motion stops in the affected path and human-attention surface becomes visually dominant.
- **Blocked:** static, no pulse; clear textual reason.
- **External evidence arriving:** one directional packet moves from provider outside the company boundary to the receiving worker, then settles.
- **Artifact/effect changed:** brief 500–700ms state-colour wash/settle.
- **Verified:** state locks into green/check with no celebratory confetti.
- **Objective resolved:** company field calms, outcome bar locks, Somebody reports achieved/pending/uncertain.

`prefers-reduced-motion: reduce` disables all non-essential keyframes. Meaning remains visible without motion.

## 11. Demo choreography

Canonical deterministic prototype sequence:

1. Objective received: “Our launch isn’t working. Fix it and relaunch today.”
2. Outcome Contract appears: “Relaunch is live and independently verified.”
3. Somebody reuses/assembles Growth Operator (That Guy).
4. Internal artifact changes.
5. New requirement emerges: privileged social intelligence.
6. Decision expands: MAKE vs BUY; generic growth wrapper is rejected; Newsliquid is selected because the missing resource is external.
7. Founder approval becomes the primary interaction if spend authority is required.
8. Purchase lifecycle is shown in founder terms; raw Web3 detail stays in the inspector.
9. Verified external evidence crosses the company boundary and activates Growth Operator.
10. Artifact changes again because of the bought evidence.
11. Execution requirement emerges.
12. xbird is selected as external execution infrastructure.
13. Publish occurs.
14. Read-back verification succeeds.
15. Minimum completion level locks as achieved.
16. Somebody reports achieved, pending and uncertain items.

The prototype compresses some beats into grouped states for review but keeps the causal relationships visible.

## 12. Production adaptation considerations

Prototype visuals should eventually consume normalized read models, not raw Convex rows.

Suggested mapping:

- Objective header <- Objective + management state;
- Outcome rail <- Outcome Contract + Outcome Levels + completion gate;
- requirements <- governed Requirement projections;
- Somebody Now <- management reducer/control summary + current bounded action;
- That Guys <- Worker identities + assignments + lifecycle/reservation state;
- sourcing decision <- ManagerialDecision + grounded options + deterministic authorization verdict;
- external boundary <- AuthorizedExecutionIntent + selected approved provider path;
- approval card <- application-owned authority/spend verdict;
- evidence packets <- provider result / Evidence records with verification state;
- artifact change <- CompanyArtifact versions/effects;
- mission stream <- durable ActivityEvents / normalized management events;
- final status <- deterministic completion verdict + unresolved required/supporting requirements.

The renderer must not infer truth from motion, card position or visual adjacency.

## 13. Explicitly do not do

- no giant default graph;
- no LangGraph implementation-node UI;
- no chain-of-thought transcript;
- no fake percent complete;
- no persistent org chart;
- no raw wallet/payment mechanics in the primary flow;
- no “glowing AI orb” or meaningless particles;
- no perpetual red flashing;
- no card-grid where every backend record becomes a tile;
- no developer-console vocabulary in founder-facing copy;
- no hardcoded marketing/launch architecture in reusable components;
- no animation state that requires inventing backend “isLive/isPulsing” fields;
- no implication that prototype purchases/results are real.



## 14. Provisional acceptance assets

These screenshots capture the provisionally accepted web direction. They are design evidence, not claims about production runtime behavior.

### Executive Mission Control

![Executive Mission Control](./assets/m5-web/mission-control.png)

### Secondary System X-ray

![System X-ray](./assets/m5-web/system-xray.png)

The web direction remains provisional until production integration begins against the then-current M4/M3 contracts.
