# M5 Mobile Surface Brief

Status: **PROVISIONALLY ACCEPTED — 19 September 2026**  
Scope: design/implementation brief only; no mobile build is authorized by this document.  
Reference base for this branch: feat/m4-management-engine @ 7723c096f58067c79a59782792ec4346184df1f4.

## Product role

Somebody Mobile is the founder's **command remote**, not a small copy of the desktop Mission Control.

The founder should be able to:

- give Somebody an Objective;
- leave the app;
- reopen it and immediately see what is happening;
- receive only meaningful founder-attention requests;
- approve or decline bounded actions;
- inspect why Somebody chose an approach;
- review the causal mission story;
- see verified completion and remaining uncertainty.

## Required screens

1. **Home**
   - Objective composer;
   - Needs You summary;
   - active Objectives;
   - recently completed Objectives.

2. **Live Objective**
   - Objective;
   - current state;
   - Somebody Now;
   - Outcome Contract / Done means;
   - compact Company at work;
   - current step;
   - route to Mission Story and deeper detail.

3. **Needs You**
   - approval;
   - ASK;
   - BLOCK;
   - material ambiguity;
   - budget/authority exceptions.

4. **Approval / Managerial Decision**
   - requested action;
   - provider/resource;
   - maximum cost / authority boundary;
   - rationale;
   - alternatives considered;
   - deterministic decision context;
   - explicit approve / decline.

5. **Mission Story**
   - founder-meaningful causal events only;
   - filter or tabs for artifacts/evidence may be used if they remain subordinate to the story.

6. **Completed**
   - completion verdict;
   - what was achieved;
   - verified results;
   - what remains uncertain;
   - follow-up actions.

## Navigation

Recommended first-pass navigation:

Home / Objectives / Needs You / More

Keep Objective creation prominent.

Do not create top-level navigation for workers, providers, transactions or evidence unless later user research establishes a real founder workflow.

## Interaction principles

- Objective, not chat, is the primary object.
- Somebody should have a persistent managerial presence.
- Needs You is an authority/judgment queue, not notification noise.
- Approval screens must be structured and explicit.
- MAKE / BUY comparisons should be vertically scannable.
- The Mission Story should summarize causal changes, not dump runtime events.
- The deeper X-ray on mobile should be a vertical causal drill-down, not a full graph.

## Notification principles

Notify only when:

- founder authority is required;
- a material ambiguity needs judgment;
- a blocker requires founder action;
- an Objective reaches a meaningful terminal state.

Do not notify for ordinary internal progress.

Push copy must be grounded in authoritative application state.

## State vocabulary

Founder-facing state should clearly distinguish:

- working;
- waiting;
- needs approval;
- needs answer;
- blocked;
- external action pending;
- verification pending;
- resolved;
- failed safely.

Do not collapse submitted into verified, or worker completion into Objective completion.

## Production read-model needs

The mobile UI should consume normalized projections for:

- Objective summaries;
- Outcome Contract + levels;
- current manager action;
- worker assignments;
- external provider/acquisition state;
- founder-attention queue;
- grounded managerial decision + options;
- spend/authority verdict;
- evidence/effect verification;
- causal activity history;
- final completion verdict and uncertainty.

No UI animation or layout position may become a source of truth.

## Visual language

Preserve Somebody's warm paper/cream base, dark ink, orange manager/action accent and semantic status colors.

Mobile should feel more editorial and focused than dashboard-like.

Avoid card-grid syndrome. Use cards only where they represent a coherent decision, request or work object.

## Acceptance criteria

The mobile concept is ready for implementation planning when:

- Home is clearly delegation-first rather than chat-first;
- Live Objective answers “what is Somebody doing now?” above the fold;
- Needs You contains only founder-required interventions;
- an approval can be understood and acted on without opening developer detail;
- the causal story is inspectable without event spam;
- completion is evidence-backed and uncertainty remains visible;
- unrelated Objectives can use the same screen architecture;
- the UI does not imply stronger truth than the backend;
- the same product model can coexist with the richer web Mission Control.

## Reference screens

- [Home](./assets/m5-mobile/01-home.png)
- [Live Objective](./assets/m5-mobile/02-live-objective.png)
- [Needs You](./assets/m5-mobile/03-needs-you.png)
- [Approval](./assets/m5-mobile/04-approval.png)
- [Mission Story](./assets/m5-mobile/05-mission-story.png)
- [Completed](./assets/m5-mobile/06-completed.png)
