/**
 * Focused tests for Final Report PDF — authority gating + deterministic renderer.
 * No Convex, no LLM, no whole-suite run.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DeliverableView, ObjectiveView, SomebodyNowView } from "../app/product/contracts";
import { FinalDeliverable } from "../app/product/components/FinalDeliverable";
import {
  buildFinalReportPresentation,
  finalReportPdfFilename,
  parseArtifactBlocks,
  renderFinalReportPdf,
  selectDisplayFinalDeliverable,
  selectVerifiedPdfDeliverable,
} from "../lib/product/finalReportPdf";

const NOW = 1_820_000_000_000;
const MARKER = "UNIQUE_VERIFIED_ARTIFACT_MARKER_7f3a9c";

function objective(over: Partial<ObjectiveView> = {}): ObjectiveView {
  return {
    id: "obj_1",
    title: "OKX launch-week messaging",
    request: "Produce the launch-week report.",
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
    id: "deliverable:obj_1:launch_report",
    title: "Launch-week messaging package",
    type: "document",
    version: 3,
    status: "verified",
    updatedAt: NOW,
    content: `# Executive summary\n\n${MARKER}\n\n- TikTok first\n- Instagram second\n`,
    ...over,
  };
}

// ── 1. No PDF button before governed verification / completion ───────────────

test("no Download PDF button when Objective is not completed", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "working" }),
      somebodyNow: somebodyNow({ state: "working", headline: "Working", detail: null }),
      deliverables: [deliverable({ status: "verified" })],
    }),
  );
  assert.equal(html, "");
  assert.ok(!html.includes("Download PDF"));
  assert.ok(!html.includes('data-action="download-pdf"'));
});

test("no Download PDF button when completed but only current (unverified) deliverable exists", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow(),
      deliverables: [deliverable({ status: "current", content: "Not yet verified body." })],
    }),
  );
  assert.ok(html.includes("Final deliverable"), "surface still shows current fallback");
  assert.ok(!html.includes("Download PDF"));
  assert.ok(html.includes('data-pdf-eligible="false"'));
});

test("Download PDF appears only for verified final deliverable with content", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow(),
      deliverables: [deliverable({ id: "deliverable:obj_1:launch_report", version: 3, status: "verified" })],
    }),
  );
  assert.ok(html.includes("Download PDF"));
  assert.ok(html.includes('data-action="download-pdf"'));
  assert.ok(html.includes('data-pdf-eligible="true"'));
  assert.ok(html.includes('data-pdf-artifact-id="deliverable:obj_1:launch_report"'));
  assert.ok(html.includes('data-pdf-artifact-version="3"'));
});

// ── 2–3. Correct verified artifact/version; draft/superseded excluded ────────

test("selectVerifiedPdfDeliverable binds only the verified id+version, never draft/superseded/current", () => {
  const deliverables: DeliverableView[] = [
    deliverable({
      id: "deliverable:obj_1:old",
      version: 1,
      status: "superseded",
      content: "SUPERSEDED_BODY",
    }),
    deliverable({
      id: "deliverable:obj_1:draft",
      version: 2,
      status: "draft",
      content: "DRAFT_BODY",
    }),
    deliverable({
      id: "deliverable:obj_1:launch_report",
      version: 3,
      status: "verified",
      content: `VERIFIED_BODY ${MARKER}`,
    }),
  ];
  const selected = selectVerifiedPdfDeliverable(deliverables);
  assert.ok(selected);
  assert.equal(selected!.id, "deliverable:obj_1:launch_report");
  assert.equal(selected!.version, 3);
  assert.equal(selected!.status, "verified");
  assert.ok(selected!.content?.includes(MARKER));
  assert.equal(selectVerifiedPdfDeliverable([deliverable({ status: "draft" })]), null);
  assert.equal(selectVerifiedPdfDeliverable([deliverable({ status: "superseded" })]), null);
  assert.equal(selectVerifiedPdfDeliverable([deliverable({ status: "current" })]), null);
  assert.equal(selectVerifiedPdfDeliverable([deliverable({ status: "verified", content: "   " })]), null);
});

test("UI Download PDF attributes target the verified artifact, not a superseded sibling", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow(),
      deliverables: [
        deliverable({
          id: "deliverable:obj_1:old",
          version: 1,
          status: "superseded",
          content: "Old superseded draft content.",
        }),
        deliverable({
          id: "deliverable:obj_1:launch_report",
          version: 4,
          status: "verified",
          content: `The verified final content. ${MARKER}`,
        }),
      ],
    }),
  );
  assert.ok(html.includes('data-pdf-artifact-id="deliverable:obj_1:launch_report"'));
  assert.ok(html.includes('data-pdf-artifact-version="4"'));
  assert.ok(!html.includes('data-pdf-artifact-id="deliverable:obj_1:old"'));
  assert.ok(html.includes(MARKER));
  assert.ok(!html.includes("Old superseded draft content."));
});

test("display selection may fall back to current; PDF selection must not", () => {
  const onlyCurrent = [deliverable({ status: "current", content: "Current only." })];
  assert.equal(selectDisplayFinalDeliverable(onlyCurrent)?.status, "current");
  assert.equal(selectVerifiedPdfDeliverable(onlyCurrent), null);
});

// ── 4–5. Generated file is PDF; stored artifact text appears ─────────────────

test("buildFinalReportPresentation + renderFinalReportPdf produce a real PDF containing the artifact text", async () => {
  const verified = deliverable({
    id: "deliverable:obj_1:launch_report",
    version: 5,
    status: "verified",
    content: `# Executive summary\n\n${MARKER}\n\n## TikTok\n\n- Post daily\n`,
  });
  const presentation = buildFinalReportPresentation({
    objective: objective(),
    deliverable: verified,
    nowMs: NOW,
  });
  assert.equal(presentation.artifactId, verified.id);
  assert.equal(presentation.artifactVersion, "5");
  assert.equal(presentation.content, verified.content);
  assert.ok(presentation.content.includes(MARKER), "artifact text must be the deterministic renderer input");
  assert.equal(
    presentation.presentationNote,
    "Presentation of the verified final deliverable. Not a new assessment or source of truth.",
  );

  const bytes = await renderFinalReportPdf(presentation);
  assert.ok(bytes.byteLength > 100);
  const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  assert.equal(head, "%PDF-");

  // pdf-lib Flate-compresses content streams and hex-encodes WinAnsi text
  // (`<554E49…> Tj`). Inflate streams and decode hex string operands.
  const extracted = extractPdfLiteralText(Buffer.from(bytes));
  assert.ok(extracted.includes(MARKER), "stored artifact marker must appear in PDF content streams");
  assert.ok(extracted.includes("Somebody"), "brand identity must appear");
  assert.ok(extracted.includes(verified.id) || extracted.includes("launch_report"));

  const name = finalReportPdfFilename(presentation);
  assert.match(name, /^somebody-okx-.*-v5\.pdf$/);
});

/** Inflate FlateDecode streams and decode hex `<…>` / literal `(…)` text ops. */
function extractPdfLiteralText(buf: Buffer): string {
  const chunks: string[] = [];
  let searchFrom = 0;
  while (searchFrom < buf.length) {
    const streamKey = buf.indexOf(Buffer.from("\nstream"), searchFrom);
    if (streamKey < 0) break;
    let dataStart = streamKey + "\nstream".length;
    if (buf[dataStart] === 0x0d) dataStart += 1;
    if (buf[dataStart] === 0x0a) dataStart += 1;
    const endKey = buf.indexOf(Buffer.from("\nendstream"), dataStart);
    if (endKey < 0) break;
    const raw = buf.subarray(dataStart, endKey);
    let decoded: Buffer;
    try {
      decoded = inflateSync(raw);
    } catch {
      searchFrom = endKey + 1;
      continue;
    }
    const ops = decoded.toString("latin1");
    for (const hex of ops.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      chunks.push(Buffer.from(hex[1], "hex").toString("latin1"));
    }
    for (const lit of ops.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      chunks.push(
        lit[0].slice(1, -1).replace(/\\([nrt\\()])/g, (_, c: string) => {
          if (c === "n") return "\n";
          if (c === "r") return "\r";
          if (c === "t") return "\t";
          return c;
        }),
      );
    }
    searchFrom = endKey + 1;
  }
  return chunks.join("\n");
}

test("buildFinalReportPresentation refuses draft/superseded/current inputs", () => {
  for (const status of ["draft", "superseded", "current"] as const) {
    assert.throws(
      () =>
        buildFinalReportPresentation({
          objective: objective(),
          deliverable: deliverable({ status }),
        }),
      /verified final deliverable/i,
    );
  }
});

test("parseArtifactBlocks styles markdown-like headings/lists without inventing sections", () => {
  const blocks = parseArtifactBlocks("# Executive summary\n\nHello\n\n- One\n- Two\n");
  assert.deepEqual(blocks, [
    { kind: "heading", level: 1, text: "Executive summary" },
    { kind: "blank" },
    { kind: "paragraph", text: "Hello" },
    { kind: "blank" },
    { kind: "list_item", text: "One" },
    { kind: "list_item", text: "Two" },
    { kind: "blank" },
  ]);
  // No invented platform sections when absent from source text.
  const plain = parseArtifactBlocks("Just a paragraph.\n");
  assert.ok(!plain.some((b) => b.kind === "heading" && "text" in b && /tiktok|instagram/i.test(b.text)));
});

// ── 6. No LLM / model call in the PDF path ───────────────────────────────────

test("finalReportPdf module has no LLM/model imports", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../lib/product/finalReportPdf.ts"), "utf8");
  assert.ok(!/\bfrom\s+["']ai["']/.test(src));
  assert.ok(!/\bfrom\s+["']openai["']/.test(src));
  assert.ok(!/@openai\/agents/.test(src));
  assert.ok(!/@langchain\//.test(src));
  assert.ok(!/\bgenerateText\b|\bstreamText\b|\bchat\.completions\b|\binvoke\b/.test(src));
  assert.ok(src.includes("pdf-lib"), "renderer must use deterministic pdf-lib");
  assert.ok(src.includes("MUST NOT call an LLM"));
});
