// ReportDocument — deterministic structured rendering of the governed final
// deliverable artifact text (replaces the raw <pre>{content}</pre>).
// Presentation-only: no LLM, no rewriting/reordering/dropping of content.
// Parser tests use lib/product/reportBlocks.ts directly (the SAME parser
// finalReportPdf.ts's parseArtifactBlocks adapts for the PDF renderer);
// render tests go through FinalDeliverable via react-dom/server, mirroring
// tests/finalDeliverable.test.ts.

import "./helpers/ignoreCss";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseInline, parseReportBlocks } from "../lib/product/reportBlocks";
import { parseArtifactBlocks } from "../lib/product/finalReportPdf";
import { ReportDocument } from "../app/product/components/ReportDocument";
import { FinalDeliverable } from "../app/product/components/FinalDeliverable";
import type { DeliverableView, ObjectiveView, SomebodyNowView } from "../app/product/contracts";

const NOW = 1_820_000_000_000;

function objective(over: Partial<ObjectiveView> = {}): ObjectiveView {
  return {
    id: "obj_1",
    title: "Somebody launch-week social media plan",
    request: "Ship the launch-week social plan.",
    status: "completed",
    createdAt: NOW - 100_000,
    updatedAt: NOW,
    ...over,
  };
}

function somebodyNow(over: Partial<SomebodyNowView> = {}): SomebodyNowView {
  return {
    state: "completed",
    headline: "The required outcome is verified.",
    detail: "Saved.",
    updatedAt: NOW,
    ...over,
  };
}

function deliverable(over: Partial<DeliverableView> = {}): DeliverableView {
  return {
    id: "d1",
    title: "Launch-week social media plan",
    type: "document",
    version: 5,
    status: "verified",
    updatedAt: NOW,
    ...over,
  };
}

// Short excerpt of the real, canonical artifact content (GPT-6 run,
// tables.objectives[0].versions[last].doc.data.companyArtifacts[0].content).
// Headings (#, ##), bullets (-), and **bold** inline are the only Markdown-
// like syntax the real artifact actually uses — no numbered lists or tables
// appear in it, so those are covered by synthetic fixtures below instead.
const REAL_EXCERPT = `# Somebody launch-week social media plan

## Launch context and message
The company brief reports weak signup conversion and says many visitors do not quickly recognize that Somebody is for founders of very small companies or understand how it differs from other AI tools.

**Core message:** "For founders running a one-person company or a lean team: keep important work moving without adding another tool to manage."

## Channel approach
- **TikTok:** Publish a sub-25-second before/after desk-day montage.
- **Instagram:** Use a Reel adapted from the short-form video.
- **X:** Publish a numbered founder pain to fix thread.
`;

// ── A. parseReportBlocks — the shared parser ─────────────────────────────────

test("parseReportBlocks renders #, ##, ### as heading levels 1/2/3", () => {
  const blocks = parseReportBlocks("# One\n## Two\n### Three\n");
  assert.deepEqual(blocks, [
    { kind: "heading", level: 1, text: "One" },
    { kind: "heading", level: 2, text: "Two" },
    { kind: "heading", level: 3, text: "Three" },
    { kind: "blank" },
  ]);
});

test("parseReportBlocks renders -, *, • bullets as bullet_item", () => {
  const blocks = parseReportBlocks("- Dash\n* Star\n• Bullet\n");
  assert.deepEqual(blocks, [
    { kind: "bullet_item", text: "Dash" },
    { kind: "bullet_item", text: "Star" },
    { kind: "bullet_item", text: "Bullet" },
    { kind: "blank" },
  ]);
});

test("parseReportBlocks renders 1. and 1) as ordered_item, keeping the marker", () => {
  const blocks = parseReportBlocks("1. First\n2) Second\n");
  assert.deepEqual(blocks, [
    { kind: "ordered_item", marker: "1.", text: "First" },
    { kind: "ordered_item", marker: "2)", text: "Second" },
    { kind: "blank" },
  ]);
});

test("parseReportBlocks falls back to paragraph for unrecognized syntax, preserving the literal line", () => {
  const blocks = parseReportBlocks("> A blockquote line\n| a | table |\n");
  assert.deepEqual(blocks, [
    { kind: "paragraph", text: "> A blockquote line" },
    { kind: "paragraph", text: "| a | table |" },
    { kind: "blank" },
  ]);
});

test("parseReportBlocks never invents sections absent from the source", () => {
  const blocks = parseReportBlocks("Just a paragraph.\n");
  assert.ok(!blocks.some((b) => b.kind === "heading"));
  assert.deepEqual(blocks, [{ kind: "paragraph", text: "Just a paragraph." }, { kind: "blank" }]);
});

test("parseInline splits **bold** spans, leaving plain text and markers correctly separated", () => {
  assert.deepEqual(parseInline("plain **bold** plain"), [
    { text: "plain ", bold: false },
    { text: "bold", bold: true },
    { text: " plain", bold: false },
  ]);
  assert.deepEqual(parseInline("**Core message:** rest"), [
    { text: "Core message:", bold: true },
    { text: " rest", bold: false },
  ]);
  assert.deepEqual(parseInline("no bold here"), [{ text: "no bold here", bold: false }]);
});

// No content loss: concatenating every block's raw text (markup markers
// stripped from block *type*, not from inline text) reconstructs every
// non-blank source line exactly.
test("parseReportBlocks loses no content — every non-blank source line is recoverable from the blocks", () => {
  const lines = REAL_EXCERPT.split("\n").filter((l) => l.trim().length > 0);
  const blocks = parseReportBlocks(REAL_EXCERPT).filter((b) => b.kind !== "blank");
  assert.equal(blocks.length, lines.length);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const block = blocks[i];
    if (block.kind === "heading") {
      assert.ok(line.endsWith(block.text));
      continue;
    }
    if (block.kind === "bullet_item") {
      assert.ok(line.endsWith(block.text));
      continue;
    }
    if (block.kind === "paragraph") {
      assert.equal(line, block.text);
    }
  }
});

// ── B. parseArtifactBlocks (finalReportPdf.ts) reuses the SAME parser ───────

test("finalReportPdf's parseArtifactBlocks is an adapter over the shared reportBlocks parser", () => {
  const rich = parseReportBlocks("# Title\n\n- One\n1. Two\n");
  const legacy = parseArtifactBlocks("# Title\n\n- One\n1. Two\n");
  assert.deepEqual(legacy, [
    { kind: "heading", level: 1, text: "Title" },
    { kind: "blank" },
    { kind: "list_item", text: "One" },
    { kind: "list_item", text: "1. Two" },
    { kind: "blank" },
  ]);
  // Same segmentation count (bullet + ordered collapse to the same
  // `list_item` kind for PDF purposes, but no line is dropped).
  assert.equal(rich.length, legacy.length);
});

// ── C. ReportDocument — structured React rendering, no <pre>, no raw HTML ──

test("ReportDocument renders headings, a bullet list, and bold inline for the real artifact excerpt", () => {
  const html = renderToStaticMarkup(createElement(ReportDocument, { content: REAL_EXCERPT }));
  assert.ok(!html.includes("<pre"));
  assert.ok(!/dangerouslySetInnerHTML/.test(html));
  assert.ok(html.includes("<h1"));
  assert.ok(html.includes("<h2"));
  assert.ok(html.includes("Somebody launch-week social media plan"));
  assert.ok(html.includes("<ul"));
  assert.ok(html.includes("<li"));
  assert.ok(html.includes("TikTok:"));
  assert.ok(html.includes("<strong>Core message:</strong>") || html.includes("<strong>TikTok:</strong>"));
  // No raw double-asterisks leak into the rendered markup.
  assert.ok(!html.includes("**"));
});

test("ReportDocument renders ordered lists as <ol> and unknown syntax as a literal paragraph", () => {
  const html = renderToStaticMarkup(
    createElement(ReportDocument, { content: "1. First step\n2. Second step\n\n> A quoted aside\n" }),
  );
  assert.ok(html.includes("<ol"));
  assert.ok(html.includes("First step"));
  assert.ok(html.includes("Second step"));
  assert.ok(html.includes("&gt; A quoted aside") || html.includes("> A quoted aside"));
});

test("ReportDocument groups consecutive bullets into one <ul>, not one per item", () => {
  const html = renderToStaticMarkup(createElement(ReportDocument, { content: "- A\n- B\n- C\n" }));
  const ulCount = (html.match(/<ul/g) ?? []).length;
  assert.equal(ulCount, 1);
  const liCount = (html.match(/<li/g) ?? []).length;
  assert.equal(liCount, 3);
});

// ── D. FinalDeliverable — mounts ReportDocument, not <pre>, and mode gating ─

test("FinalDeliverable renders the artifact via structured markup, not <pre>, for a completed+verified deliverable", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow(),
      deliverables: [deliverable({ status: "verified", content: REAL_EXCERPT })],
      mode: "live",
    }),
  );
  assert.ok(!html.includes("<pre"));
  assert.ok(html.includes("<h1"));
  assert.ok(html.includes("<h2"));
  assert.ok(html.includes("<ul"));
  assert.ok(html.includes("Somebody launch-week social media plan"));
});

test("replay mode: no Download PDF button, and the live-only note renders", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow(),
      deliverables: [deliverable({ status: "verified", content: REAL_EXCERPT })],
      mode: "replay",
    }),
  );
  assert.ok(!html.includes('data-action="download-pdf"'));
  assert.ok(!html.includes(">Download PDF<"));
  assert.ok(html.includes("v6-final-deliverable-live-note"));
  assert.ok(html.includes("Live Somebody workspaces can download verified deliverables as PDF."));
});

test("live mode with a verified deliverable: Download PDF button is present", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow(),
      deliverables: [deliverable({ status: "verified", content: REAL_EXCERPT })],
      mode: "live",
    }),
  );
  assert.ok(html.includes('data-action="download-pdf"'));
  assert.ok(html.includes("Download PDF"));
});
