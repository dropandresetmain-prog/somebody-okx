# Somebody × OKX — Frontend Contract

The frontend consumes one product projection of authoritative Somebody state.

React renders that projection. It does not infer business lifecycle from raw database rows.

## Product states

Objectives are presented as:

- starting;
- working;
- waiting;
- needs you;
- verifying;
- completed;
- blocked.

## Objective workspace

The workspace contains:

- Objective;
- Somebody's current update;
- current work;
- Activity;
- Deliverables;
- Checkpoints;
- external acquisitions;
- Needs You;
- available founder actions.

## Product language

- **Somebody** — accountable AI manager.
- **Intern** — bounded internal worker.
- **Objective** — founder-requested outcome.
- **Activity** — meaningful business events.
- **Deliverable** — founder-facing output.
- **Checkpoint** — progress condition derived from current required work.
- **Needs You** — founder action or authority currently required.
- **External provider** — resource or service outside the company.

## Truth ownership

Convex owns objective, requirement, worker, decision, approval, acquisition, transaction, artifact and completion state.

The product projection converts that state into founder-facing language.

React owns layout, typography, animation, imagery and interaction presentation.

## Key distinctions

The UI keeps these states separate:

```text
worker finished
≠ requirement satisfied
≠ objective completed

transaction submitted
≠ transaction settled
≠ provider result verified

artifact changed
≠ final deliverable verified
```

## Sidebar

Objectives are grouped into:

- In progress
- Needs you
- Done

The grouping comes from the backend product projection.

## Somebody now

The primary status card answers:

> What is Somebody doing now?

It uses the same underlying product state as the rest of the workspace.

## Checkpoints

Checkpoints are derived from current required work.

They use:

- pending;
- active;
- complete;
- blocked.

The interface does not invent percentage completion.

## Current work

Current work presents the active bounded action:

- MAKE;
- BUY;
- WAIT;
- ASK.

For internal work, the card may include the active Intern.

For external work, the card may include the acquisition/provider state.

## Activity

Activity is a deterministic projection of durable business events such as:

- objective interpreted;
- Intern assigned;
- work started;
- finding added;
- resource gap identified;
- managerial decision;
- founder approval requested;
- acquisition started;
- transaction submitted;
- result received;
- result verified;
- work resumed;
- artifact changed;
- verification completed;
- objective completed.

Causal connectors are shown only when the backend has an explicit relationship between the events.

## Deliverables

A deliverable is backed by a governed artifact.

The final deliverable is the terminal founder-facing output selected from the current requirement graph.

A deliverable is marked verified only when the current artifact version passes final assessment and the objective completion decision accepts it.

## Needs You

Needs You appears only when the backend exposes a legal founder action.

The current working action is bounded spend approval for paid external acquisition.

The UI submits that action through the product command surface and then follows the updated backend projection.

## Acquisitions

Acquisition presentation can include:

- provider;
- resource;
- amount;
- transaction state;
- result state;
- verification state.

The UI receives these as projected product facts rather than reconstructing the payment lifecycle itself.

## Start

The start surface creates a new objective through the product command API.

The founder supplies the objective in natural language. Current product creation is intentionally simple; advanced controls can be added through the same capability-advertised command surface.

## Source files

- Product types: `app/product/contracts.ts`
- Product projection: `lib/product/frontendProjection.ts`
- Convex read surface: `convex/productWorkspace.ts`
- Product commands: `convex/productCommands.ts`
- Product UI: `app/product/`
