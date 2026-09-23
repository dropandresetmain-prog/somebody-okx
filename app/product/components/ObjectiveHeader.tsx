import { Mascot } from "../../somebody/Mascot";
import type { CurrentWorkView, ObjectiveView, SomebodyNowView } from "../contracts";
import { OBJECTIVE_STATUS_LABEL, objectiveStatusTone, somebodyByline, somebodyNowPose } from "../presentation";

// Top of main (DESIGN.md §3): Objective title + founder request, then ONE
// Somebody update card. Current work is supporting meta inside that card —
// not a second hero block. Copy is rendered exactly as supplied.
export function ObjectiveHeader({
  objective,
  somebodyNow,
  currentWork,
}: {
  objective: ObjectiveView;
  somebodyNow: SomebodyNowView;
  currentWork?: CurrentWorkView | null;
}) {
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
          <h2 className="v6-somebody-headline">{somebodyNow.headline}</h2>
          <p className="v6-somebody-detail">{somebodyNow.detail}</p>
          <div className="v6-manager-meta">
            {currentWork ? <span>Working now: {currentWork.title}</span> : null}
            {currentWork ? <span aria-hidden="true">•</span> : null}
            <span>{ballLabel(somebodyNow.state)}</span>
          </div>
        </div>
        <div className="v6-manager-visual">
          <Mascot pose={somebodyNowPose(somebodyNow.state)} size="lg" live={false} />
        </div>
      </section>
    </header>
  );
}

function ballLabel(state: SomebodyNowView["state"]): string {
  if (state === "needs_you" || state === "waiting") return "Ball with you";
  if (state === "completed") return "Outcome with Somebody";
  return "Ball with Somebody";
}
