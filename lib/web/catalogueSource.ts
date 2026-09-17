/**
 * Configured public web catalogue source for Vendor A.
 * Facts must be retrieved from the live page; this file only pins identity + URL.
 */
export const CATALOGUE_VENDOR_ID = "catalogue" as const;

export type CatalogueSource = {
  vendorId: typeof CATALOGUE_VENDOR_ID;
  supplierName: string;
  productName: string;
  endpointRef: string;
  productUrl: string;
  /** Extra public pages from the same supplier that may state MOQ / lead-time facts. */
  companionUrls: string[];
  searchTerms: string[];
};

export const PATMA_CHIBI_TUMBLER_500ML: CatalogueSource = {
  vendorId: CATALOGUE_VENDOR_ID,
  supplierName: "Patma",
  productName: "Chibi Stainless Steel Vacuum Tumbler – 500ml",
  endpointRef: "web.patma.chibi-tumbler-500ml",
  productUrl:
    "https://patma.com.sg/product/chibi-stainless-steel-vacuum-tumbler-500ml/",
  companionUrls: [],
  searchTerms: [
    "tumbler",
    "bottle",
    "insulated",
    "stainless",
    "corporate gift",
    "branded",
    "500ml",
    "600ml",
    "patma",
    "chibi",
  ],
};

/** Single configured public catalogue source for this procurement worker. */
export const CONFIGURED_CATALOGUE_SOURCES: CatalogueSource[] = [
  PATMA_CHIBI_TUMBLER_500ML,
];

export function defaultCatalogueSource(): CatalogueSource {
  return PATMA_CHIBI_TUMBLER_500ML;
}

/**
 * Narrow catalogue search: match the configured public source(s) by keyword.
 * Not a general web crawler or marketplace index.
 */
export function searchCatalogueSources(query: string): CatalogueSource[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
  if (!tokens.length) return [];
  return CONFIGURED_CATALOGUE_SOURCES.filter((source) => {
    const haystack = [
      source.supplierName,
      source.productName,
      ...source.searchTerms,
    ]
      .join(" ")
      .toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });
}
