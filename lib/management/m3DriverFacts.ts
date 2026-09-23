/** Canonical signed envelope for a local M3 fact entering the Convex bridge. */
export type M3DriverFact = {
  intentId: string;
  expectedUpdatedAt: number;
  eventKind: "submitted" | "provider_result" | "verification_passed" | "verification_failed" | "pre_submission_failed" | "reconciliation_required";
  eventId: string;
  dedupeKey: string;
  evidenceId: string | null;
  note: string;
  at: number;
  /**
   * SHA-256 of acquisition content when this fact carries verified live content
   * writeback. Bound into the attestation so content cannot be swapped after signing.
   */
  acquisitionContentHash: string | null;
  /**
   * Resource class the ADAPTER/authorized offering declares it actually
   * fulfilled, bound into the attestation alongside the content hash. Required
   * with the hash on a live verified writeback: the writeback must be verifiable
   * against the intent's authorized target class, so a driver cannot attest one
   * class and write another. Never a model-selected value.
   */
  acquisitionDeclaredResourceClass?: string | null;
};

/** Stable JSON avoids a caller choosing an equivalent-but-differently-encoded fact. */
export function canonicalM3DriverFact(fact: M3DriverFact): string {
  return JSON.stringify([
    fact.intentId, fact.expectedUpdatedAt, fact.eventKind, fact.eventId,
    fact.dedupeKey, fact.evidenceId, fact.note, fact.at,
    fact.acquisitionContentHash,
    fact.acquisitionDeclaredResourceClass ?? null,
  ]);
}
