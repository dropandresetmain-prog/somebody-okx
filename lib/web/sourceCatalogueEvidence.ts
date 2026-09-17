import type { Evidence, EvidenceInput, Mission } from "../procurement/types";
import {
  defaultCatalogueSource,
  searchCatalogueSources,
  type CatalogueSource,
} from "./catalogueSource";
import { extractCatalogueFacts } from "./extractCatalogueFacts";
import { fetchPublicHtml, htmlToExtractableText } from "./fetchPublicHtml";
import {
  materialFingerprint,
  webObservationId,
  webParentId,
} from "./observationIdentity";

export {
  CONFIGURED_CATALOGUE_SOURCES,
  CATALOGUE_VENDOR_ID,
  defaultCatalogueSource,
  searchCatalogueSources,
  PATMA_CHIBI_TUMBLER_500ML,
} from "./catalogueSource";
export type { CatalogueSource } from "./catalogueSource";
export { extractCatalogueFacts } from "./extractCatalogueFacts";
export { fetchPublicHtml, htmlToExtractableText } from "./fetchPublicHtml";
export {
  materialFingerprint,
  webObservationId,
  webParentId,
} from "./observationIdentity";

export type SourceCatalogueOptions = {
  source?: CatalogueSource;
  fetchImpl?: typeof fetch;
  now?: number;
  /** Existing mission evidence; same material returns the prior record exactly. */
  existingEvidence?: Evidence[];
};

/**
 * Retrieve the configured public catalogue page and normalize into EvidenceInput.
 * Absent public facts stay absent — callers must not fill gaps.
 *
 * Observation identity is derived from the source URL + material fingerprint.
 * Repeated polls of unchanged public content reuse the prior evidence record
 * (idempotent). Material changes mint a new observation id and a higher revision.
 */
export async function sourceCatalogueEvidence(
  mission: Pick<Mission, "vendors" | "evidence">,
  vendorId: string,
  options: SourceCatalogueOptions = {},
): Promise<EvidenceInput> {
  const configured = mission.vendors.find((vendor) => vendor.id === vendorId);
  if (!configured) throw new Error("Unknown vendor or unconfigured recipient endpoint");
  if (configured.channel !== "Web")
    throw new Error("Public web catalogue retrieval is only for Web-channel vendors");

  const source = options.source ?? defaultCatalogueSource();
  if (source.vendorId !== vendorId)
    throw new Error("Catalogue source vendorId mismatch");

  const primary = await fetchPublicHtml(source.productUrl, {
    fetchImpl: options.fetchImpl,
  });
  const texts = [htmlToExtractableText(primary.html)];
  const retrievedAt = options.now ?? primary.retrievedAt;

  for (const companion of source.companionUrls) {
    const page = await fetchPublicHtml(companion, {
      fetchImpl: options.fetchImpl,
    });
    texts.push(htmlToExtractableText(page.html));
  }

  const combinedText = texts.join(" \n ");
  if (
    !combinedText.toLowerCase().includes("chibi") &&
    !combinedText.toLowerCase().includes("tumbler")
  )
    throw new Error(
      "Retrieved catalogue page did not contain expected product markers",
    );

  const extracted = extractCatalogueFacts(source, combinedText);
  const fingerprint = materialFingerprint(
    source.productUrl,
    extracted.claims,
    extracted.text,
  );
  const observationId = webObservationId(source.productUrl, fingerprint);
  const existing =
    options.existingEvidence ??
    mission.evidence ??
    [];
  const priorSame = existing.find(
    (item) =>
      item.provenance.provider === "web" &&
      item.provenance.observationId === observationId,
  );
  if (priorSame) {
    const { id: _id, ...input } = priorSame;
    return input;
  }

  const priorWebCount = existing.filter(
    (item) =>
      item.vendorId === vendorId && item.provenance.provider === "web",
  ).length;

  const input: EvidenceInput = {
    vendorId,
    source: `${source.supplierName} public catalogue`,
    authority: "catalogue",
    revision: priorWebCount + 1,
    observedAt: retrievedAt,
    text: extracted.text,
    claims: extracted.claims,
    provenance: {
      provider: "web",
      channel: "Web",
      observationId,
      parentId: webParentId(source.productUrl),
      url: source.productUrl,
      observedAt: retrievedAt,
      retrievedAt,
      sourceLabel: `${source.supplierName} / ${source.productName}`,
    },
  };
  return input;
}

/** Resolve a narrow sourcing query to the configured catalogue source, if any. */
export function resolveCatalogueSearch(query: string): CatalogueSource | null {
  return searchCatalogueSources(query)[0] ?? null;
}
