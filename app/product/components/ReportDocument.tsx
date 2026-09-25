import { Fragment, type ReactNode } from "react";
import { parseInline, parseReportBlocks, type ReportBlock } from "../../../lib/product/reportBlocks";

// Deterministic, structured rendering of a governed final deliverable
// artifact's text. Presentation-only: no LLM, no rewriting/reordering/
// dropping of content. Uses the SAME block parser as the PDF renderer
// (lib/product/reportBlocks.ts, shared via lib/product/finalReportPdf.ts's
// parseArtifactBlocks adapter) so the browser report and the downloaded PDF
// read as the same report. Unrecognized syntax falls back to a paragraph
// carrying the literal source line. No dangerouslySetInnerHTML — every node
// below is a built React element.

function InlineText({ text }: { text: string }) {
  const segments = parseInline(text);
  return (
    <>
      {segments.map((segment, i) =>
        segment.bold ? <strong key={i}>{segment.text}</strong> : <Fragment key={i}>{segment.text}</Fragment>,
      )}
    </>
  );
}

type ListBuffer = { type: "ul" | "ol"; items: string[] } | null;

export function ReportDocument({ content }: { content: string }) {
  const blocks: ReportBlock[] = parseReportBlocks(content);
  const nodes: ReactNode[] = [];
  let listBuffer: ListBuffer = null;
  let key = 0;

  function flushList() {
    if (!listBuffer) return;
    const items = listBuffer.items;
    const ListTag = listBuffer.type;
    nodes.push(
      <ListTag key={`list-${key++}`}>
        {items.map((item, i) => (
          <li key={i}>
            <InlineText text={item} />
          </li>
        ))}
      </ListTag>,
    );
    listBuffer = null;
  }

  for (const block of blocks) {
    if (block.kind === "blank") {
      // Spacing between sections is handled via CSS margins, not blank nodes.
      continue;
    }
    if (block.kind === "heading") {
      flushList();
      const HeadingTag = (`h${block.level}`) as "h1" | "h2" | "h3";
      nodes.push(
        <HeadingTag key={`h-${key++}`}>
          <InlineText text={block.text} />
        </HeadingTag>,
      );
      continue;
    }
    if (block.kind === "bullet_item") {
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer.items.push(block.text);
      continue;
    }
    if (block.kind === "ordered_item") {
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList();
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer.items.push(block.text);
      continue;
    }
    // paragraph — including any line whose syntax we don't recognize; the
    // parser already falls back to `paragraph` with the literal line text.
    flushList();
    nodes.push(
      <p key={`p-${key++}`}>
        <InlineText text={block.text} />
      </p>,
    );
  }
  flushList();

  return <>{nodes}</>;
}
