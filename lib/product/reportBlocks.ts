/**
 * Shared, deterministic Markdown-like block parser for the governed final
 * deliverable artifact text.
 *
 * Used by BOTH the browser report renderer (app/product/components/
 * ReportDocument.tsx) and the PDF renderer (lib/product/finalReportPdf.ts,
 * via its parseArtifactBlocks adapter) so the two surfaces read as the same
 * report. Presentation-only: no LLM, no rewriting, reordering, or dropping
 * of content. Unrecognized syntax falls back to a paragraph carrying the
 * literal source line.
 */

export type ReportBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet_item"; text: string }
  | { kind: "ordered_item"; text: string; marker: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blank" };

export type InlineSegment = { text: string; bold: boolean };

/**
 * Split source text into line-based blocks. One non-blank line is one
 * block — the governed artifacts observed in production write one
 * paragraph/bullet/heading per line, so no line-joining/reflow is applied.
 * Every non-blank-line character that isn't a recognized block marker is
 * preserved verbatim in the resulting block's `text`.
 */
export function parseReportBlocks(content: string): ReportBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReportBlock[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      blocks.push({ kind: "blank" });
      continue;
    }
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, text: headingMatch[2] });
      continue;
    }
    const bulletMatch = /^[-*•]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      blocks.push({ kind: "bullet_item", text: bulletMatch[1] });
      continue;
    }
    const orderedMatch = /^(\d+[.)])\s+(.+)$/.exec(line);
    if (orderedMatch) {
      blocks.push({ kind: "ordered_item", marker: orderedMatch[1], text: orderedMatch[2] });
      continue;
    }
    blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
}

/**
 * Split a block's literal text into bold/non-bold inline segments on
 * `**...**` markers. Presentation-only; never alters the underlying text
 * content, only how it is grouped for `<strong>` rendering.
 */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    if (match[1].length > 0) {
      segments.push({ text: match[1], bold: true });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  if (segments.length === 0) {
    segments.push({ text, bold: false });
  }
  return segments;
}
