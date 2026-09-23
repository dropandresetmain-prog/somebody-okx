import { InternArt } from "../characters";
import type { CurrentWorkView } from "../contracts";
import { APPROACH_LABEL, CURRENT_WORK_STATUS_LABEL, internPresentation } from "../presentation";

// Current Work / Intern (contract §14–17). Intern "done" is rendered exactly
// as the bounded-assignment claim it is — never promoted to Objective done.
// The V6 shell no longer mounts this as a dominant block above Activity;
// the component remains for supporting/test use.
export function CurrentWork({ currentWork }: { currentWork: CurrentWorkView | null }) {
  if (!currentWork) return null;
  return (
    <section className="v6-current-work" aria-label="Current work" data-current-work-status={currentWork.status}>
      <div className="v6-current-work-head">
        <p className="kicker">Current work</p>
        {currentWork.approach ? <span className="pill tone-somebody">{APPROACH_LABEL[currentWork.approach]}</span> : null}
        <span className="v6-current-work-status muted">{CURRENT_WORK_STATUS_LABEL[currentWork.status]}</span>
      </div>
      <p className="v6-current-work-title">{currentWork.title}</p>
      {currentWork.summary ? <p className="v6-current-work-summary muted">{currentWork.summary}</p> : null}
      {currentWork.intern ? <InternChip intern={currentWork.intern} /> : null}
    </section>
  );
}

function InternChip({ intern }: { intern: CurrentWorkView["intern"] }) {
  if (!intern) return null;
  const { label } = internPresentation(intern.state);
  return (
    <div className="v6-intern-chip" data-intern-id={intern.id} data-intern-state={intern.state}>
      <InternFrameCompact />
      <div>
        <p className="v6-intern-chip-label">{intern.label}</p>
        {intern.specialty ? <p className="muted v6-intern-chip-specialty">{intern.specialty}</p> : null}
        <p className="muted v6-intern-chip-state">{label}</p>
      </div>
    </div>
  );
}

function InternFrameCompact() {
  return (
    <div className="v6-intern-frame v6-intern-frame--chip" aria-hidden="true">
      <InternArt className="v6-intern-source" alt="" />
    </div>
  );
}
