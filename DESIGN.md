# Somebody × OKX — Design System & Product Experience

Status: **CURRENT — V6 VISUAL DIRECTION APPROVED**  
Updated: **22 September 2026**  
Primary product surface: desktop / laptop web demo and ongoing product UI

> This file is the current visual/product design source of truth. Older M5 design notes are historical context only where they conflict with this document.

## 1. Product feeling

Somebody is the accountable AI manager for the One Person Company.

The interface should make this feel true within seconds:

> Give Somebody an Objective. Somebody manages the work, assembles the help it needs, keeps the founder informed, asks only when authority or judgment is required, and stays accountable until the required outcome is verified.

The product must **not** feel like:
- ChatGPT with business tools;
- Cursor with a different skin;
- an agent marketplace;
- a workflow builder;
- a raw event log;
- a crypto wallet;
- a project-management dashboard with AI pasted onto it.

The founder should feel that a small company is visibly moving around an Objective.

## 2. Current approved information architecture — V6

The V6 layout is the locked visual direction for production-integration planning.

### Left rail — Objectives

Persistent navigation with clear visual separation between sections:

1. Somebody wordmark / brand;
2. strong primary CTA: **Start a new objective**;
3. **In progress** Objectives;
4. **Needs you** Objectives;
5. **Done** Objectives;
6. founder/workspace identity at the bottom.

Rules:
- section boundaries must be visually obvious;
- the selected Objective is highlighted;
- do not turn the rail into a dense task manager;
- primary CTA uses **dark ink**, not a giant orange fill;
- orange may accent the plus/current state, but is not the background for the whole CTA.

### Main header — Objective

Shows:
- Objective label;
- human-readable title;
- original founder request;
- lightweight overflow/actions only when needed.

The Objective is the main work object. Backend implementation nouns are subordinate.

### Somebody update card

The top high-emphasis card answers:

> **What is Somebody doing now?**

It contains:
- Somebody state/label;
- one clear headline;
- concise explanation;
- current work / ownership context;
- Somebody mascot art.

Do **not** add a second large status card saying essentially the same thing.

### Main column — Activity

**Activity is the visual heart of the product.**

It is intentionally narrower than full page width so that the right rail remains visible.

Activity communicates meaningful business events, not raw machine events.

### Right rail — Deliverables + Checkpoints

Persistent secondary context:

**Deliverables**
- current/final deliverable;
- version;
- status;
- short summary;
- open/view affordance.

**Checkpoints**
- 2–5 founder-facing progress conditions;
- pending / current / complete / blocked;
- no fake percentage completion.

The right rail may surface a compact **Needs you** interrupt when founder authority is required.

## 3. /start state

Starting a new Objective is a dedicated product state, not a modal form.

The center should feel conversational without making the entire product a chat application.

Core composition:
- small branded hero moment;
- heading: **Give Somebody an objective**;
- large objective composer;
- optional context/files/voice controls;
- advanced controls hidden by default;
- tasteful empty Activity and Deliverable areas.

### Approved mascot treatment

Use the transparent-background **Somebody + Intern working duo** above/beside the start heading.

This visually says:

> You are handing an outcome to a tiny company, not opening another generic AI chat.

Preferred asset:
- `docs/design/prototypes/assets/somebody-intern-duo-assets-approved.zip`
- inside: `duo-working-transparent.webp`

Avoid:
- white-image rectangles against the warm product background;
- giant hero illustrations that overwhelm the composer;
- chat bubbles as the dominant page metaphor.

## 4. Character system

### Somebody

Role: accountable manager.

Personality:
- mildly annoyed, never angry;
- extremely competent;
- calm under mess;
- dependable;
- quietly accustomed to doing work nobody else wants to handle.

Visual cues:
- pale warm body;
- compact rounded silhouette;
- dark twin head tufts;
- half-lidded eyes;
- restrained expressions;
- minimal office props;
- premium soft 3D render.

Canonical guide:
- `brand/SOMEBODY_BRAND.md`
- assets: `brand/assets/`

### Intern

**Product name: Intern.**  
Do not use **That Guy** in founder-facing product UI.

Role: bounded internal worker managed by Somebody.

Personality is deliberately the opposite of Somebody:
- wide-eyed;
- eager;
- optimistic;
- visibly happy to take work;
- sometimes slightly too eager;
- competent but clearly subordinate to Somebody.

Visual cues:
- same universe/form factor as Somebody;
- pale beige rounded body;
- dark hand/foot accents;
- two soft head tufts;
- huge glossy eyes;
- restrained rosy cheeks;
- dark lanyard / Intern badge where practical;
- premium soft 3D render.

Canonical direction and pose references:
- `docs/design/INTERN_ASSET_SET.md`

Approved poses include:
- neutral / eager;
- avatar / head;
- working on laptop;
- receiving assignment;
- presenting a finding;
- waiting / needs input;
- proud / done.

**Do not regenerate Intern from text alone.** Use the approved canonical reference or character drift will occur.

## 5. Somebody + Intern chemistry

The pairing is now an important part of the visual identity.

The joke is simple:

> Somebody is doing the boring accountable manager work. Intern is a ball of energy around him.

Approved duo concepts:
- Somebody working; Intern excitedly bringing ideas;
- Somebody walking with purpose; Intern bouncing alongside;
- Somebody drinking coffee / waiting calmly; Intern still pitching ideas.

Approved bundle:
- `docs/design/prototypes/assets/somebody-intern-duo-assets-approved.zip`

Usage:
- **working duo** → /start hero / active-work moments;
- **walking duo** → short transition after Objective submission;
- **coffee duo** → waiting / reassessment / Needs You states.

Both background and transparent versions are preserved.

Inside the UI, prefer transparent versions so the illustration inherits the warm paper surface.

Do not scatter duo assets everywhere. They are state illustrations, not stickers.

## 6. Activity visual grammar

Activity should look like **consequential business events**, not chat messages.

Use different visual grammars for different event types.

### Managerial interpretation
Simple card:
- actor: Somebody;
- concise title;
- explanatory sentence;
- subtle managerial label.

### Delegation
Visually show:

`Somebody → Intern → bounded assignment`

Include:
- Somebody identity;
- Intern identity / specialty;
- exact assignment;
- scope / authority note when useful.

The handoff should feel like a real managerial act.

### Finding / evidence
Use a research/evidence card:
- one prominent finding;
- concise explanation;
- evidence/source chips where useful;
- Intern presenting-result pose.

### Managerial decision
Compact fork, e.g.:

`MAKE` vs `BUY`

Show:
- viable choices;
- selected choice;
- short rationale;
- strongest alternative where useful.

Do not render a giant flowchart.

### External acquisition
Receipt/business-event treatment:
- what was acquired;
- provider/resource;
- amount if relevant;
- truthful state;
- result status.

A payment/submission is **not** automatically a useful result.

### Artifact changed
Strong before/after treatment:
- old content;
- new content;
- short explanation of what new evidence caused the change.

This is one of Somebody's signature visual moments.

### Founder attention
Full-width or high-emphasis interrupt:
- what Somebody needs;
- why;
- legal actions available.

Phrase territory:
- **Somebody needs your say**
- not supervision.

### Verification / completion
Use a calm stamped/locked treatment:
- what was checked;
- what passed;
- remaining unknowns if any;
- required outcome verified.

No confetti.

## 7. Motion system

Motion communicates **state change**, not generic AI aliveness.

Approved V5/V6 motion language:

- Activity events enter sequentially;
- Somebody → Intern delegation has a short transfer motion;
- Intern arrives into an assignment;
- finding presentation gets a brief result-return moment;
- selected MAKE/BUY choice gets one restrained emphasis;
- evidence → artifact change receives a causal highlight;
- Needs You pulses briefly, not forever;
- active Intern work may use one subtle loop;
- completion stamps in once;
- Intern gets one small proud motion;
- /start submission may use the **walking duo** as a short transition.

### Motion rules

- movement must correspond to a meaningful product event;
- no perpetual mascot bouncing;
- no meaningless particles;
- no glowing AI orb;
- no infinite attention animation;
- no red flashing;
- no motion that implies backend truth the system does not know;
- support `prefers-reduced-motion: reduce`.

General easing:
- `cubic-bezier(0.2, 0.7, 0.2, 1)`

Typical state-transition duration:
- roughly 350–700 ms.

## 8. Colour system

### Surfaces

- Paper: `#f4f1ea`
- Sunk paper: `#ebe6db`
- Surface: `#fffdf9`
- Line: `#e3ddd1`
- Strong line: `#cec6b7`

### Ink

- Primary: `#1d1b18`
- Secondary: `#4f4a42`
- Muted: `#726c62`

### Somebody orange

- Brand: `#e4602a`
- Dark: `#b0451a`
- Wash: `#fde9de`

**Critical rule:** orange means Somebody / action / active causal emphasis.

Do not use orange as a generic large-button or decorative fill.

Primary CTA is generally dark ink on light surface, with orange reserved for a small accent or meaningful state.

### Semantic state colours

Use colour to describe the state of the world, not decorate cards.

- waiting blue: `#2f66b3`
- viable / success green: `#2e7d4f`
- ineligible / failure red: `#bf3f2f`
- changed purple: `#7048b8` — use sparingly;
- decision yellow: `#f5c518`
- verified green: `#1c6e45`
- neutral gray: `#a39d92`

The current approved UI intentionally uses mostly warm neutrals. Semantic colours should appear only when they add meaning.

## 9. Typography

Current product pairing:

### Display
**Bricolage Grotesque**

Use for:
- major headings;
- Objective titles;
- strong product statements.

### Text
**Inter**

Use for:
- body copy;
- controls;
- metadata;
- Activity descriptions.

Typography should feel editorial and confident rather than dashboard-dense.

Use:
- strong dark headlines;
- small uppercase/kicker labels sparingly;
- concise copy;
- clear line-height.

Avoid:
- enormous marketing typography inside the operational product;
- technical monospace everywhere;
- all-caps overload.

## 10. Shape, spacing, depth

Current shape language:
- small radius: 6 px;
- medium: 10 px;
- large: 16 px;
- extra large: 24 px.

Cards:
- warm/off-white surfaces;
- light neutral borders;
- soft depth;
- restrained shadows.

The UI should feel like premium warm office paper, not glassmorphism and not neon Web3.

Whitespace is part of the design system. Do not fill every empty region with backend data.

## 11. Product states

Founder-facing states should remain simple:

- /start;
- starting / interpreting;
- working;
- waiting;
- Needs You;
- verifying;
- completed / verified;
- blocked.

Several engine states may collapse into one product-facing state.

The UI must not independently infer:
- Objective completion;
- payment confirmation;
- worker completion;
- acquisition usefulness;
- verification.

Backend/projected truth controls those meanings.

## 12. Deliverables and checkpoints

### Deliverables

Founder-facing output, not internal work records.

Show:
- title;
- version;
- status;
- summary/content;
- evidence/unknowns when useful;
- recommended next move where appropriate.

### Checkpoints

Founder-facing progress conditions.

Rules:
- 2–5 meaningful items;
- no fake percent complete;
- no raw Requirement table dump;
- completion/check marks must be backed by product contract truth.

## 13. Brand voice

Tone:
- calm;
- competent;
- concise;
- mildly dry;
- never grandiose;
- never overly cute despite the mascots.

Useful language territory:
- Your company, in motion.
- Somebody is on it.
- Somebody needs your say, not your supervision.
- You can stay out of the weeds.
- Meaningful moves. Not machine noise.
- The worker is done. The Objective is not.
- The proof.
- Required outcome. Verified.
- The Objective creates demand. Somebody assembles the company.

Do not force "Somebody" into every line.

## 14. Videomaker direction

The video should sell the product through **visible company motion**, not architecture diagrams.

### Visual hierarchy to show

1. founder gives Somebody an Objective;
2. Somebody becomes visibly accountable;
3. Somebody delegates bounded work to Intern;
4. Intern works / returns a finding;
5. Somebody makes a meaningful decision;
6. external input arrives when justified;
7. new evidence visibly changes the artifact;
8. founder is interrupted only when authority is genuinely needed;
9. Somebody verifies the required outcome;
10. completed deliverable remains visible with Activity as proof of what happened.

### Character contrast

Use the personality contrast for warmth:
- Somebody: mundane, focused, slightly tired, coffee/laptop/walking;
- Intern: eyes wide, bouncing with ideas, eager notebook energy.

Humour should come from the visual contrast, not jokes in captions.

### Video motion

Preferred:
- restrained camera moves;
- UI state transitions;
- handoff motion;
- evidence/result arrival;
- before/after artifact change;
- one verification lock/stamp.

Avoid:
- cyberpunk AI graphics;
- particle swarms;
- generic code rain;
- holographic blockchain visuals;
- overexcited mascot animation;
- character slapstick.

### Product screen composition to reproduce

Use V6:
- left Objective rail;
- Somebody update card top center;
- Activity main column;
- Deliverables + Checkpoints right rail.

Do not use the old M5 Mission Control / System X-ray layouts as the hero product surface.

## 15. Source assets and references

### Current approved visual checkpoint
- `docs/design/prototypes/SOMEBODY_OKX_V6_APPROVED.md`

### Intern
- `docs/design/INTERN_ASSET_SET.md`

### Somebody + Intern duo
- `docs/design/SOMEBODY_INTERN_DUO_ASSETS.md`
- `docs/design/prototypes/assets/somebody-intern-duo-assets-approved.zip`

### Somebody brand
- `brand/SOMEBODY_BRAND.md`
- `brand/assets/`

### Older design history
- `docs/design/M5_WEB_DESIGN_DIRECTION.md`
- `docs/design/M5_WEB_SURFACE_BRIEF.md`

Older documents are historical when they conflict with V6 or this file.

## 16. Explicitly do not do

- no default ChatGPT-style conversation stream;
- no raw backend/event-log feed;
- no chain-of-thought;
- no giant default graph;
- no generic AI SaaS dashboard;
- no glowing AI orb;
- no crypto-wallet-first presentation;
- no fake completion percentage;
- no frontend inference of completion;
- no giant orange UI controls;
- no off-brand saturated accents used decoratively;
- no mascot clutter;
- no character drift;
- no animation for animation's sake;
- no implication that simulated/replayed events are live;
- no implication that submission equals confirmation;
- no implication that worker completion equals Objective completion.

The sophistication should be felt through **what Somebody visibly does**, not through exposing the machinery underneath.
