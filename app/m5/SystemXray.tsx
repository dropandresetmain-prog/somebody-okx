import type { SystemXrayFixture } from "./workspace";

const kindTone: Record<SystemXrayFixture["nodes"][number]["kind"], string> = {
  objective: "verified",
  outcome: "verified",
  requirement: "waiting",
  worker: "somebody",
  assignment: "somebody",
  decision: "decision",
  provider: "ineligible",
  intent: "somebody",
  evidence: "verified",
  verification: "verified",
};

function kindLabel(kind: SystemXrayFixture["nodes"][number]["kind"]): string {
  return kind.replaceAll("_", " ");
}

function NodeTable({ nodes }: { nodes: SystemXrayFixture["nodes"] }) {
  if (nodes.length === 0) {
    return <p className="mc-xray-empty">No nodes in this fixture.</p>;
  }
  return (
    <table className="mc-xray-table" aria-label="Nodes in the normalized fixture graph">
      <thead>
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">Label</th>
          <th scope="col">Detail</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map(node => (
          <tr key={node.id}>
            <td>
              <span
                className={`mc-xray-badge mc-xray-badge--${kindTone[node.kind]}`}
                data-kind={node.kind}
              >
                {kindLabel(node.kind)}
              </span>
            </td>
            <td className="mc-xray-node-label">
              <strong>{node.label}</strong>
              <small className="mc-xray-id">{node.id}</small>
            </td>
            <td className="mc-xray-node-detail">{node.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RelationshipList({
  relationships,
  nodes,
}: {
  relationships: SystemXrayFixture["relationships"];
  nodes: SystemXrayFixture["nodes"];
}) {
  if (relationships.length === 0) {
    return <p className="mc-xray-empty">No relationships in this fixture.</p>;
  }
  const labelFor = (id: string) => nodes.find(n => n.id === id)?.label ?? id;
  return (
    <table className="mc-xray-table" aria-label="Explicit relationships between nodes">
      <thead>
        <tr>
          <th scope="col">From</th>
          <th scope="col">Relation</th>
          <th scope="col">To</th>
        </tr>
      </thead>
      <tbody>
        {relationships.map(rel => (
          <tr key={rel.id}>
            <td className="mc-xray-rel-end">
              <strong>{labelFor(rel.from)}</strong>
              <small className="mc-xray-id">{rel.from}</small>
            </td>
            <td className="mc-xray-rel-label">
              <span className="mc-xray-arrow">→</span>
              <span className="mc-xray-rel-verb">{rel.label.replaceAll("_", " ")}</span>
              <span className="mc-xray-arrow">→</span>
            </td>
            <td className="mc-xray-rel-end">
              <strong>{labelFor(rel.to)}</strong>
              <small className="mc-xray-id">{rel.to}</small>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RuntimeFacts({ runtime }: { runtime: SystemXrayFixture["runtime"] }) {
  if (runtime.length === 0) {
    return <p className="mc-xray-empty">No runtime facts recorded.</p>;
  }
  return (
    <dl className="mc-xray-facts">
      {runtime.map((fact, index) => (
        <div key={`${fact.label}-${index}`} className="mc-xray-fact">
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SystemXray({ xray }: { xray: SystemXrayFixture }) {
  return (
    <section className="mc-xray" aria-label="System X-ray inspection">
      <header className="mc-xray-header">
        <h3 className="mc-xray-title">System X-ray</h3>
        <p className="mc-xray-note">
          Secondary inspection · explicit references only · no inferred causality
        </p>
      </header>

      <div className="mc-xray-section">
        <h3 className="mc-xray-section-heading">
          Nodes
          <span className="mc-xray-count">{xray.nodes.length}</span>
        </h3>
        <NodeTable nodes={xray.nodes} />
      </div>

      <div className="mc-xray-section">
        <h3 className="mc-xray-section-heading">
          Relationships
          <span className="mc-xray-count">{xray.relationships.length}</span>
        </h3>
        <RelationshipList relationships={xray.relationships} nodes={xray.nodes} />
      </div>

      <div className="mc-xray-section">
        <h3 className="mc-xray-section-heading">
          Runtime facts
          <span className="mc-xray-count">{xray.runtime.length}</span>
        </h3>
        <RuntimeFacts runtime={xray.runtime} />
      </div>
    </section>
  );
}
