import { Mascot } from "../../somebody/Mascot";
import type { CurrentWorkView, DeliverableView, ObjectiveView, SomebodyNowView } from "../contracts";
import { presentSomebodyNow } from "../humanize";
import { OBJECTIVE_STATUS_LABEL, objectiveStatusTone, somebodyByline, somebodyNowPose } from "../presentation";

// Top of main (DESIGN.md §3): Objective title + founder request, then ONE
// Somebody update card. Current work is supporting meta inside that card —
// not a second hero block. The founder request renders exactly as supplied;
// Somebody's status copy goes through presentSomebodyNow.
export function ObjectiveHeader({
  objective,
  somebodyNow,
  currentWork,
  deliverables = [],
}: {
  objective: ObjectiveView;
  somebodyNow: SomebodyNowView;
  currentWork?: CurrentWorkView | null;
  deliverables?: DeliverableView[];
}) {
  const display = presentSomebodyNow(somebodyNow, deliverables);
  // "Working on X" already names the current work; don't repeat it as meta.
  const showWorkingNow = Boolean(currentWork && !display.headline.includes(currentWork.title));
  const ball = ballLabel(somebodyNow.state);
  return (
    <header className="v6-objective-header">
      <div className="v6-objective-head">
        <div>
          <p className="v6-objective-kicker">Objective</p>
          <h1 className="v6-objective-title">{objective.title}</h1>
          <blockquote className="v6-objective-request">“{objective.request}”</blockquote>
        </div>
        <span className={`pill tone-${objectiveStatusTone(objective.status)}`} data-objective-status={objective.status}>
          {OBJECTIVE_STATUS_LABEL[objective.status]}
        </span>
      </div>

      <section
        className="v6-somebody-card"
        data-somebody-state={somebodyNow.state}
        data-objective-status={objective.status}
      >
        <div className="v6-somebody-card-copy">
          <p className="v6-manager-byline">
            <i
              className={`dot tone-${objective.status === "completed" ? "verified" : "somebody"}`}
              aria-hidden="true"
            />
            {somebodyByline(somebodyNow.state)}
          </p>
          <h2 className="v6-somebody-headline">{display.headline}</h2>
          {display.detail ? <p className="v6-somebody-detail">{display.detail}</p> : null}
          {showWorkingNow || ball ? (
            <div className="v6-manager-meta">
              {showWorkingNow && currentWork ? <span>Working now: {currentWork.title}</span> : null}
              {showWorkingNow && ball ? <span aria-hidden="true">•</span> : null}
              {ball ? <span>{ball}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="v6-manager-visual">
          <Mascot pose={somebodyNowPose(somebodyNow.state)} size="lg" live={false} />
        </div>
      </section>
    </header>
  );
}

function ballLabel(state: SomebodyNowView["state"]): string | null {
  if (state === "needs_you") return "Ball with you";
  // Waiting may be on an outside provider, not the founder — the headline says which.
  // Completion is final; the card already says so.
  if (state === "waiting" || state === "completed") return null;
  return "Ball with Somebody";
}
