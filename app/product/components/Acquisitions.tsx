import type { AcquisitionView } from "../contracts";
import { ACQUISITION_STATUS_LABEL, acquisitionTone } from "../presentation";

// Acquisitions receipt treatment (contract §34–36). Renders ONLY supplied
// facts: absent provenance/transaction stay absent — never defaulted, never
// inferred from acquisition/intent state, and "verified" here never implies
// Objective completion.
export function Acquisitions({ acquisitions }: { acquisitions: AcquisitionView[] }) {
  if (acquisitions.length === 0) return null;
  return (
    <section className="v6-rail-card" aria-label="Acquisitions">
      <div className="v6-rail-card-head">
        <h3>Acquisitions</h3>
        <span>Secondary</span>
      </div>
      <ul className="v6-acquisition-list">
        {acquisitions.map((acquisition) => (
          <AcquisitionReceipt key={acquisition.id} acquisition={acquisition} />
        ))}
      </ul>
    </section>
  );
}

function AcquisitionReceipt({ acquisition }: { acquisition: AcquisitionView }) {
  return (
    <li className="v6-acquisition" data-acquisition-id={acquisition.id} data-acquisition-status={acquisition.status}>
      <div className="v6-acquisition-head">
        <span className={`pill tone-${acquisitionTone(acquisition.status)}`}>{ACQUISITION_STATUS_LABEL[acquisition.status]}</span>
        {acquisition.amount ? (
          <span className="v6-acquisition-amount">
            {acquisition.amount.amount} {acquisition.amount.currency}
          </span>
        ) : null}
      </div>
      <p className="v6-acquisition-resource">{acquisition.resourceLabel}</p>
      {acquisition.providerLabel ? <p className="muted">{acquisition.providerLabel}</p> : null}
      {acquisition.provenance ? (
        <span className="pill tone-neutral" data-acquisition-provenance={acquisition.provenance}>
          {provenanceLabel(acquisition.provenance)}
        </span>
      ) : null}
      {acquisition.resultSummary ? <p className="muted v6-acquisition-result">{acquisition.resultSummary}</p> : null}
      {acquisition.transaction ? (
        <p className="muted v6-acquisition-transaction" data-transaction-status={acquisition.transaction.status}>
          {acquisition.transaction.label}
        </p>
      ) : null}
    </li>
  );
}

function provenanceLabel(provenance: NonNullable<AcquisitionView["provenance"]>): string {
  switch (provenance) {
    case "live":
      return "Live";
    case "simulation":
      return "Simulation";
    case "recorded_replay":
      return "Recorded replay";
  }
}
