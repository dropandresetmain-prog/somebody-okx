import type { ObjectiveListView, ObjectiveSummaryView } from "../contracts";
import { OBJECTIVE_STATUS_LABEL, objectiveStatusTone } from "../presentation";

// Left rail — V6 IA (DESIGN.md §2): wordmark, primary "Start a new objective"
// CTA, then three status sections rendered exactly as the backend grouped
// them. No frontend regrouping/reclassification of ObjectiveSummaryView.status.
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
  return (
    <nav className="v6-sidebar" aria-label="Objectives">
      <div className="v6-sidebar-brand">
        <span className="wordmark-avatar" aria-hidden="true">
          <span className="wordmark-dot" />
        </span>
        <span className="wordmark-text">Somebody</span>
      </div>

      <button type="button" className="button primary large v6-start-cta" onClick={onStartNew}>
        Start a new objective
      </button>

      <SidebarSection title="Needs you" items={list.needsYou} selectedId={selectedId} onSelect={onSelect} />
      <SidebarSection title="In progress" items={list.inProgress} selectedId={selectedId} onSelect={onSelect} />
      <SidebarSection title="Done" items={list.done} selectedId={selectedId} onSelect={onSelect} />

      {list.needsYou.length === 0 && list.inProgress.length === 0 && list.done.length === 0 ? (
        <p className="v6-sidebar-empty muted">No objectives yet.</p>
      ) : null}
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
  if (items.length === 0) return null;
  return (
    <div className="v6-sidebar-section" data-sidebar-section={title}>
      <p className="kicker v6-sidebar-heading">{title}</p>
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
              <span className={`dot tone-${objectiveStatusTone(item.status)}`} aria-hidden="true" />
              <span className="v6-sidebar-item-title">{item.title}</span>
              {item.hasAttention ? <span className="v6-sidebar-item-flag" aria-hidden="true" /> : null}
              <span className="v6-sidebar-item-status muted">{item.statusLabel ?? OBJECTIVE_STATUS_LABEL[item.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
