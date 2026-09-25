"use client";

import { useState } from "react";
import type { DeliverableView, ObjectiveView, SomebodyNowView } from "../contracts";
import { deliverableKind, presentSomebodyNow } from "../humanize";
import {
  buildFinalReportPresentation,
  finalReportPdfFilename,
  renderFinalReportPdf,
  selectDisplayFinalDeliverable,
  selectVerifiedPdfDeliverable,
  triggerBrowserPdfDownload,
} from "../../../lib/product/finalReportPdf";
import type { SomebodyMode } from "../../../lib/product/mode";
import { ReportDocument } from "./ReportDocument";
import "../nodeTestCssShim";
import "../final-report.css";

// Main-column "Final deliverable" (post-founder-live-run Incident #2): when an
// Objective is completed, the governed final artifact must be unmistakable,
// not buried in the right-rail Deliverables card. Renders ONLY when
// objective.status === "completed", and ONLY the current accepted deliverable
// — verified first, falling back to current — never a superseded or draft
// version. Reads straight from the supplied `deliverables` prop; no second
// source of truth, no frontend re-derivation of artifact authority.
//
// Download PDF is stricter: only the verified (final-semantic-verification)
// artifact version is eligible. Presentation-only — no LLM, no rewrite.
export function FinalDeliverable({
  objective,
  somebodyNow,
  deliverables,
  mode = "live",
}: {
  objective: ObjectiveView;
  somebodyNow: SomebodyNowView;
  deliverables: DeliverableView[];
  /** replay: PDF export is a live-workspace feature — show a note, never the button. */
  mode?: SomebodyMode;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (objective.status !== "completed") return null;

  // Verified is the governed, checked outcome; "current" is the fallback for
  // the rare case where completion landed without a matching assessment yet.
  // Draft and superseded artifacts are never eligible here.
  const selected = selectDisplayFinalDeliverable(deliverables);
  if (!selected) return null;

  // Same copy the top-of-page Somebody Now card uses — never a second wording
  // of "what finished".
  const display = presentSomebodyNow(somebodyNow, deliverables);

  // PDF authority is verified-only — never draft, superseded, or unverified current.
  const pdfSource = selectVerifiedPdfDeliverable(deliverables);
  const canDownloadPdf = mode === "live" && pdfSource !== null && pdfSource.id === selected.id;

  async function onDownloadPdf() {
    if (!pdfSource || pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const presentation = buildFinalReportPresentation({
        objective,
        deliverable: pdfSource,
      });
      const bytes = await renderFinalReportPdf(presentation);
      if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== "%PDF-") {
        throw new Error("PDF renderer returned a non-PDF payload.");
      }
      triggerBrowserPdfDownload(bytes, finalReportPdfFilename(presentation));
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "PDF download failed.";
      setPdfError(message);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <section
      id="final-deliverable"
      className="v6-final-deliverable"
      aria-label="Final deliverable"
      data-deliverable-id={selected.id}
      data-deliverable-status={selected.status}
      data-pdf-eligible={canDownloadPdf ? "true" : "false"}
    >
      <div className="v6-final-deliverable-head">
        <div className="v6-final-deliverable-head-row">
          <div>
            <p className="v6-final-deliverable-kicker">Final deliverable</p>
            <h2 className="v6-final-deliverable-title">{selected.title}</h2>
            <p className="v6-final-deliverable-meta">
              {deliverableKind(selected.type)} · v{selected.version}
            </p>
          </div>
          {canDownloadPdf ? (
            <button
              type="button"
              className="v6-final-deliverable-pdf"
              data-action="download-pdf"
              data-pdf-artifact-id={pdfSource.id}
              data-pdf-artifact-version={String(pdfSource.version)}
              disabled={pdfBusy}
              aria-busy={pdfBusy ? "true" : "false"}
              onClick={() => {
                void onDownloadPdf();
              }}
            >
              {pdfBusy ? "Preparing PDF…" : "Download PDF"}
            </button>
          ) : mode === "replay" ? (
            <p className="v6-final-deliverable-live-note muted" data-pdf-live-only="true">
              Live Somebody workspaces can download verified deliverables as PDF.
            </p>
          ) : null}
        </div>
      </div>
      {display.detail ? <p className="v6-final-deliverable-summary">{display.detail}</p> : null}
      {selected.content ? (
        <div className="v6-final-deliverable-content">
          <ReportDocument content={selected.content} />
        </div>
      ) : (
        <p className="muted v6-final-deliverable-empty">No stored content for this deliverable.</p>
      )}
      {pdfError ? (
        <p className="v6-final-deliverable-pdf-error" role="alert">
          {pdfError}
        </p>
      ) : null}
    </section>
  );
}
