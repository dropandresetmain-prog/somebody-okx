/**
 * Extract human-usable acquisition content from a verified controlled-Testnet
 * protected result (founder_narrative_pulse or social_media_guru).
 */
import {
  normalizeM3FounderNarrativeResult,
  verifyM3ProtectedResult,
} from "../payment/m3FounderNarrativeProduct";
import {
  normalizeSocialMediaGuruResult,
  verifySocialMediaGuruProtectedResult,
} from "../payment/socialMediaGuruProduct";
import { sha256Hex } from "../management/sha256";

export type LiveAcquisitionContent = {
  content: string;
  contentHash: string;
  providerId: string;
  serviceId: string;
  offeringId: string;
  resourceClass: string;
};

export function extractLiveAcquisitionContent(
  raw: unknown,
  ctx?: { offeringId?: string | null; serviceId?: string | null },
): LiveAcquisitionContent | null {
  if (verifySocialMediaGuruProtectedResult(raw)) {
    if (raw.provenance !== "synthetic_test_provider") return null;
    const normalized = normalizeSocialMediaGuruResult(raw, {
      offeringId: ctx?.offeringId ?? raw.offeringId ?? undefined,
      serviceId: ctx?.serviceId ?? raw.serviceId,
    });
    const content = raw.content.trim();
    if (!contentIncludesSyntheticMarkers(content)) return null;
    return {
      content,
      contentHash: sha256Hex(content),
      providerId: normalized.provenance.providerId,
      serviceId: normalized.provenance.serviceId || raw.serviceId,
      offeringId: normalized.offeringId || raw.offeringId || "",
      resourceClass: normalized.resourceClass,
    };
  }
  if (!verifyM3ProtectedResult(raw)) return null;
  if (raw.provenance !== "synthetic_test_provider") return null;
  const normalized = normalizeM3FounderNarrativeResult(raw, {
    offeringId: ctx?.offeringId ?? raw.offeringId ?? undefined,
    serviceId: ctx?.serviceId ?? raw.serviceId,
  });
  const content = raw.content.trim();
  if (!contentIncludesSyntheticMarkers(content)) return null;
  return {
    content,
    contentHash: sha256Hex(content),
    providerId: normalized.provenance.providerId,
    serviceId: normalized.provenance.serviceId || raw.serviceId,
    offeringId: normalized.offeringId || raw.offeringId || "",
    resourceClass: normalized.resourceClass,
  };
}

/** Defense-in-depth for Convex writeback that receives only the content string. */
export function contentIncludesSyntheticMarkers(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    (lower.includes("synthetic") || lower.includes("synthetic_test_provider")) &&
    lower.includes("not live")
  );
}

/**
 * Fail-closed check that attested content matches its hash and still carries
 * synthetic_test_provider markers (never silently upgrade to live social data).
 */
export function assertAttestedLiveAcquisitionContent(
  content: string,
  expectedHash: string,
): void {
  if (!content.trim()) throw new Error("live acquisition content is empty");
  if (sha256Hex(content) !== expectedHash) {
    throw new Error("live acquisition content hash does not match attestation");
  }
  if (!contentIncludesSyntheticMarkers(content)) {
    throw new Error(
      "live acquisition content missing synthetic_test_provider markers",
    );
  }
}
