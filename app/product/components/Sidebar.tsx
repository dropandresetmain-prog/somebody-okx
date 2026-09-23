import type { ObjectiveListView, ObjectiveSummaryView } from "../contracts";
import { OBJECTIVE_STATUS_LABEL, objectiveStatusTone } from "../presentation";

// Left rail — V6 IA: wordmark, tagline, dark Start CTA with orange plus,
// physically separated In progress / Needs you / Done blocks (shown even when
// empty), selected treatment, founder workspace footer. Status grouping is
// exactly the backend arrays — no frontend reclassification.
export function Sidebar({
  list,
  selectedId,
  onSelect,
  onStartNew,
}: {
  list: ObjectiveListView;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStartNew: () => void;
}) {
  const allEmpty = list.needsYou.length === 0 && list.inProgress.length === 0 && list.done.length === 0;

  return (
    <nav className="v6-sidebar" aria-label="Objectives">
      <div className="v6-wordmark">
        somebody<b>.</b>
      </div>
      <p className="v6-tagline">Your company, in motion.</p>

      <button type="button" className="v6-start-cta" onClick={onStartNew}>
        <span>Start a new objective</span>
        <span aria-hidden="true">＋</span>
      </button>

      <div className="v6-sidebar-sections">
        <SidebarSection title="In progress" items={list.inProgress} selectedId={selectedId} onSelect={onSelect} />
        <SidebarSection title="Needs you" items={list.needsYou} selectedId={selectedId} onSelect={onSelect} />
        <SidebarSection title="Done" items={list.done} selectedId={selectedId} onSelect={onSelect} />
      </div>

      {allEmpty ? <p className="v6-sidebar-empty muted">No objectives yet.</p> : null}

      <div className="v6-side-foot">
        <div className="v6-profile">
          <div className="v6-profile-circle" aria-hidden="true">
            You
          </div>
          <div>
            <strong className="v6-profile-title">Founder workspace</strong>
            <p className="v6-profile-sub">Somebody manages the objective.</p>
          </div>
        </div>
      </div>
    </nav>
  );
}

function SidebarSection({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: ObjectiveSummaryView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="v6-sidebar-section" data-sidebar-section={title}>
      <div className="v6-side-heading">
        <span>{title}</span>
        <span className="v6-side-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="v6-empty-row">Nothing right now.</p>
      ) : (
        <ul className="v6-sidebar-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`v6-sidebar-item${item.id === selectedId ? " is-selected" : ""}`}
                data-objective-id={item.id}
                aria-current={item.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(item.id)}
              >
                <span className="v6-sidebar-item-title">{item.title}</span>
                <span className={`v6-nav-meta tone-${objectiveStatusTone(item.status)}`}>
                  <span className={`dot tone-${objectiveStatusTone(item.status)}`} aria-hidden="true" />
                  {item.statusLabel ?? OBJECTIVE_STATUS_LABEL[item.status]}
                  {item.hasAttention ? <span className="v6-sidebar-item-flag" aria-hidden="true" /> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
