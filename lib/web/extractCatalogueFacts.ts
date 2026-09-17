import type { Quote } from "../procurement/types";
import type { CatalogueSource } from "./catalogueSource";

export type ExtractedCatalogueFacts = {
  claims: Partial<Quote>;
  /** Human-readable evidence text retaining only observed public facts. */
  text: string;
  /** Explicit notes about absences (for tests / operators). */
  absent: string[];
};

/**
 * Conservative extraction from public catalogue HTML text.
 * Only emits Quote claims that are explicitly supported by page wording.
 */
export function extractCatalogueFacts(
  source: CatalogueSource,
  pageText: string,
): ExtractedCatalogueFacts {
  const text = pageText.replace(/\s+/g, " ").trim();
  const claims: Partial<Quote> = {};
  const absent: string[] = [];
  const lines: string[] = [
    `${source.supplierName}: ${source.productName}`,
    `Source: ${source.productUrl}`,
  ];

  const moq = matchMoq(text);
  if (moq !== null) {
    claims.moq = moq;
    lines.push(`Public MOQ: ${moq} pcs`);
  } else absent.push("moq");

  const price = matchIndicativeUnitPriceSgd(text);
  if (price) {
    // A published range is not a single firm unit price — keep both bounds in
    // text only; do not invent unitCents from a range.
    lines.push(
      `Public indicative price range (before GST): S$${price.low.toFixed(2)}–S$${price.high.toFixed(2)} per pc`,
    );
    absent.push("unitCents");
  } else {
    const single = matchSingleUnitPriceSgd(text);
    if (single !== null) {
      claims.unitCents = single;
      claims.currency = "SGD";
      lines.push(`Public unit price: S$${(single / 100).toFixed(2)}`);
    } else absent.push("unitCents");
  }

  if (/\bSGD\b|S\$|Prices quoted are before GST/i.test(text)) {
    claims.currency = claims.currency ?? "SGD";
    lines.push("Currency stated/context: SGD (prices before GST where noted)");
  } else absent.push("currency");

  if (hasBrandingOffer(text)) {
    claims.branded = true;
    lines.push(
      "Branding/customisation stated: silk screen / UV DTF / UV sticker / laser engraving (as published)",
    );
  } else absent.push("branded");

  if (/Free Delivery in Singapore/i.test(text)) {
    claims.deliveryCents = 0;
    lines.push("Delivery: free delivery in Singapore (one location), as published");
  } else absent.push("deliveryCents");

  if (/Prices quoted are before GST/i.test(text)) {
    lines.push("Tax: prices quoted before GST; GST amount not stated as a fixed cents figure");
    absent.push("taxCents");
  } else absent.push("taxCents");

  if (/\bIn Stock\b/i.test(text)) {
    lines.push("Stock: page states In Stock; numeric stock quantity not published");
    absent.push("stock");
  } else absent.push("stock");

  // Max pcs is an upper bound, not the mission order quantity.
  const maxPcs = text.match(/Max\s+(\d+)\s*pcs/i);
  if (maxPcs) lines.push(`Published maximum order size: ${maxPcs[1]} pcs`);

  absent.push("setupCents", "quantity", "deliveryAt");
  lines.push(
    "Not stated on retrieved public pages: setup fee, exact order quantity commitment, absolute delivery timestamp",
  );

  return {
    claims,
    text: lines.join(". ") + ".",
    absent: [...new Set(absent)],
  };
}

function matchMoq(text: string): number | null {
  const patterns = [
    /Min\s+(\d+)\s*pcs/i,
    /Minimum(?:\s+order)?(?:\s+quantity)?\s*[:=]?\s*(\d+)/i,
    /MOQ\s*[:=]?\s*(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function matchIndicativeUnitPriceSgd(
  text: string,
): { low: number; high: number } | null {
  const range =
    text.match(
      /Price range:\s*\$?\s*([\d.]+)\s*through\s*\$?\s*([\d.]+)/i,
    ) ||
    text.match(
      /\$\s*([\d.]+)\s*[–-]\s*\$\s*([\d.]+)/,
    ) ||
    text.match(
      /from\s*\$\s*([\d.]+)\s*[–-]\s*\$\s*([\d.]+)\s*\/?\s*pc/i,
    );
  if (!range) return null;
  const low = Number(range[1]);
  const high = Number(range[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low)
    return null;
  return { low, high };
}

function matchSingleUnitPriceSgd(text: string): number | null {
  const match = text.match(
    /Unit Price:\s*S\$\s*([\d.]+)(?:\s*\/\s*S\$\s*([\d.]+))?/i,
  );
  if (!match) return null;
  // Multiple printed options on one line → not a single firm unit price.
  if (match[2]) return null;
  const dollars = Number(match[1]);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

function hasBrandingOffer(text: string): boolean {
  return (
    /silkscreen|silk screen|logo printing|laser engraving|UV DTF|customizable|customis/i.test(
      text,
    ) || /Printing Option:/i.test(text)
  );
}
