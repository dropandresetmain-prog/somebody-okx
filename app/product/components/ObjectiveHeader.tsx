import { Mascot } from "../../somebody/Mascot";
import type { ObjectiveView, SomebodyNowView } from "../contracts";
import { objectiveStatusTone, OBJECTIVE_STATUS_LABEL, somebodyNowPose } from "../presentation";

// Top of main (DESIGN.md §3): Objective title + founder request, then ONE
// Somebody update card. Copy is rendered exactly as supplied — no derivation
// from CurrentWork/Activity here.
export function ObjectiveHeader({ objective, somebodyNow }: { objective: ObjectiveView; somebodyNow: SomebodyNowView }) {
  return (
    <header className="v6-objective-header">
      <p className="kicker">Objective</p>
      <h1 className="v6-objective-title">{objective.title}</h1>
      <blockquote className="v6-objective-request">{objective.request}</blockquote>
      <span className={`pill tone-${objectiveStatusTone(objective.status)}`} data-objective-status={objective.status}>
        {OBJECTIVE_STATUS_LABEL[objective.status]}
      </span>

      <div className="v6-somebody-card" data-somebody-state={somebodyNow.state}>
        <Mascot pose={somebodyNowPose(somebodyNow.state)} size="lg" live={somebodyNow.state === "working" || somebodyNow.state === "verifying"} />
        <div className="v6-somebody-card-copy">
          <p className="eyebrow">Somebody</p>
          <p className="v6-somebody-headline">{somebodyNow.headline}</p>
          <p className="v6-somebody-detail muted">{somebodyNow.detail}</p>
        </div>
      </div>
    </header>
  );
}
