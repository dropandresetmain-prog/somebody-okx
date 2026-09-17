import type { Quote } from "../procurement/types";

/** Stable, non-cryptographic fingerprint for observation identity. */
export function materialFingerprint(
  url: string,
  claims: Partial<Quote>,
  evidenceText: string,
): string {
  const claimPart = JSON.stringify(claims, Object.keys(claims).sort());
  const textPart = evidenceText.replace(/\s+/g, " ").trim().slice(0, 2000);
  return fnv1aHex(`${url}\n${claimPart}\n${textPart}`);
}

export function webObservationId(url: string, fingerprint: string): string {
  const hostPath = url.replace(/^https?:\/\//i, "").slice(0, 80);
  return `web:${hostPath}:${fingerprint}`.slice(0, 200);
}

export function webParentId(url: string): string {
  return `web:source:${url}`.slice(0, 200);
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
