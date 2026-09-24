/**
 * Final Report PDF — presentation-only renderer.
 *
 * Authority chain (locked):
 *   governed final deliverable
 *   → successful final semantic verification (DeliverableView.status === "verified")
 *   → deterministic presentation renderer (this module)
 *   → founder clicks Download PDF
 *
 * This module MUST NOT call an LLM, rewrite/summarize the report, re-assess
 * semantics, or alter completion state. It only lays out the exact verified
 * artifact text already projected onto DeliverableView.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { DeliverableView, ObjectiveView } from "../../app/product/contracts";

/** Display selection for the Final Deliverable surface (verified, else current). */
export function selectDisplayFinalDeliverable(deliverables: DeliverableView[]): DeliverableView | null {
  return deliverables.find((item) => item.status === "verified") ?? deliverables.find((item) => item.status === "current") ?? null;
}

/**
 * PDF authority: only the governed artifact version that passed final semantic
 * verification. Draft, superseded, and unverified "current" are ineligible.
 */
export function selectVerifiedPdfDeliverable(deliverables: DeliverableView[]): DeliverableView | null {
  const verified = deliverables.find((item) => item.status === "verified") ?? null;
  if (!verified) return null;
  if (typeof verified.content !== "string" || verified.content.trim().length === 0) return null;
  return verified;
}

export type FinalReportBlock =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "list_item"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blank" };

export type FinalReportPresentation = {
  brand: "Somebody × OKX";
  reportLabel: "Final Report";
  objectiveTitle: string;
  artifactId: string;
  artifactVersion: string;
  artifactTitle: string;
  /** Exact stored artifact body — never rewritten. */
  content: string;
  blocks: FinalReportBlock[];
  /** Truthful presentation metadata only. */
  presentedAtIso: string;
  presentationNote: "Presentation of the verified final deliverable. Not a new assessment or source of truth.";
};

export type BuildFinalReportPresentationArgs = {
  objective: Pick<ObjectiveView, "title">;
  deliverable: DeliverableView;
  /** Injected for tests; defaults to Date.now(). */
  nowMs?: number;
};

/**
 * Build the deterministic presentation model from a verified deliverable.
 * Throws if the deliverable is not PDF-eligible (wrong status / empty content).
 */
export function buildFinalReportPresentation(args: BuildFinalReportPresentationArgs): FinalReportPresentation {
  const { objective, deliverable, nowMs = Date.now() } = args;
  if (deliverable.status !== "verified") {
    throw new Error("PDF is only available for the verified final deliverable.");
  }
  if (typeof deliverable.content !== "string" || deliverable.content.trim().length === 0) {
    throw new Error("Verified deliverable has no stored content to present.");
  }
  const content = deliverable.content;
  const blocks = parseArtifactBlocks(content);
  // Presentation-only string parsing: if the verified artifact opens with a
  // real Markdown heading, use it as the report title — it is the author's
  // own stated title for the deliverable. Falls back to the artifact label.
  // No LLM/model call; purely structural.
  const firstHeading = blocks.find(
    (block): block is Extract<FinalReportBlock, { kind: "heading" }> =>
      block.kind === "heading" && block.text.trim().length > 0,
  );
  const artifactTitle = firstHeading?.text.trim() || deliverable.title;
  return {
    brand: "Somebody × OKX",
    reportLabel: "Final Report",
    objectiveTitle: objective.title,
    artifactId: deliverable.id,
    artifactVersion: String(deliverable.version),
    artifactTitle,
    content,
    blocks,
    presentedAtIso: new Date(nowMs).toISOString(),
    presentationNote: "Presentation of the verified final deliverable. Not a new assessment or source of truth.",
  };
}

/**
 * Light presentation parsing for Markdown-like artifact text.
 * Preserves every character of non-blank structure; never invents sections.
 */
export function parseArtifactBlocks(content: string): FinalReportBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: FinalReportBlock[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      blocks.push({ kind: "blank" });
      continue;
    }
    const headingMatch = /^(#{1,2})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length === 1 ? 1 : 2;
      blocks.push({ kind: "heading", level, text: headingMatch[2] });
      continue;
    }
    const listMatch = /^([-*•])\s+(.+)$/.exec(line);
    if (listMatch) {
      blocks.push({ kind: "list_item", text: listMatch[2] });
      continue;
    }
    blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
}

export function finalReportPdfFilename(presentation: FinalReportPresentation): string {
  const slug = presentation.artifactTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const base = slug.length > 0 ? slug : "final-report";
  return `somebody-okx-${base}-v${presentation.artifactVersion}.pdf`;
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

/**
 * Deterministic PDF bytes from a presentation model. No network, no LLM.
 */
export async function renderFinalReportPdf(presentation: FinalReportPresentation): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const ink = rgb(0.12, 0.11, 0.1);
  const muted = rgb(0.35, 0.33, 0.3);
  const rule = rgb(0.72, 0.68, 0.6);

  const ensureSpace = (needed: number): void => {
    if (y - needed >= MARGIN_BOTTOM) return;
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  };

  const drawWrapped = (
    text: string,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
    lineHeight: number,
    indent = 0,
  ): void => {
    const maxWidth = CONTENT_WIDTH - indent;
    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: MARGIN_X + indent,
        y: y - size,
        size,
        font,
        color,
      });
      y -= lineHeight;
    }
  };

  // Header
  drawWrapped(presentation.brand, bold, 11, ink, 16);
  y -= 4;
  drawWrapped(presentation.reportLabel, regular, 9, muted, 13);
  y -= 10;
  drawWrapped(presentation.artifactTitle, bold, 16, ink, 22);
  y -= 4;
  drawWrapped(presentation.objectiveTitle, regular, 10, muted, 14);
  y -= 2;
  drawWrapped(
    `Artifact ${presentation.artifactId} · Version ${presentation.artifactVersion}`,
    regular,
    9,
    muted,
    13,
  );
  y -= 10;
  ensureSpace(8);
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.75,
    color: rule,
  });
  y -= 16;

  // Body — exact artifact text, presentation-styled only
  for (const block of presentation.blocks) {
    if (block.kind === "blank") {
      y -= 8;
      continue;
    }
    if (block.kind === "heading") {
      y -= block.level === 1 ? 6 : 4;
      drawWrapped(block.text, bold, block.level === 1 ? 13 : 11, ink, block.level === 1 ? 18 : 15);
      y -= 2;
      continue;
    }
    if (block.kind === "list_item") {
      ensureSpace(14);
      page.drawText("•", {
        x: MARGIN_X + 4,
        y: y - 10,
        size: 10,
        font: regular,
        color: ink,
      });
      drawWrapped(block.text, regular, 10, ink, 14, 18);
      continue;
    }
    drawWrapped(block.text, regular, 10, ink, 14);
  }

  // Footer note on the last page
  y -= 16;
  ensureSpace(40);
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.5,
    color: rule,
  });
  y -= 14;
  drawWrapped(presentation.presentationNote, regular, 8, muted, 11);
  drawWrapped(`Presented ${presentation.presentedAtIso}`, regular, 8, muted, 11);

  // Identity in PDF metadata (presentation only)
  doc.setTitle(`${presentation.artifactTitle} (v${presentation.artifactVersion})`);
  doc.setAuthor(presentation.brand);
  doc.setSubject(`Verified final deliverable ${presentation.artifactId}`);
  doc.setCreator("Somebody × OKX — deterministic presentation renderer");
  doc.setProducer("Somebody × OKX finalReportPdf");
  doc.setCreationDate(new Date(presentation.presentedAtIso));
  doc.setModificationDate(new Date(presentation.presentedAtIso));

  return doc.save();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  // pdf-lib WinAnsi cannot encode every Unicode glyph; normalize common marks.
  const safe = sanitizeForWinAnsi(text);
  if (safe.length === 0) return [""];
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current.length > 0) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    // Hard-break oversized tokens
    let remaining = word;
    while (remaining.length > 0) {
      let fit = 1;
      while (
        fit < remaining.length &&
        font.widthOfTextAtSize(remaining.slice(0, fit + 1), size) <= maxWidth
      ) {
        fit += 1;
      }
      lines.push(remaining.slice(0, fit));
      remaining = remaining.slice(fit);
    }
    current = "";
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/** Map common Unicode punctuation to WinAnsi-safe equivalents; drop the rest. */
function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/\u2018|\u2019|\u201A/g, "'")
    .replace(/\u201C|\u201D|\u201E/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u2022/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

/** Browser download helper. Throws on failure — callers must surface errors. */
export function triggerBrowserPdfDownload(bytes: Uint8Array, filename: string): void {
  if (typeof document === "undefined") {
    throw new Error("PDF download requires a browser document.");
  }
  // Copy into a fresh ArrayBuffer-backed Uint8Array — Blob rejects SharedArrayBuffer views.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
