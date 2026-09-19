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
};

/** Stable JSON avoids a caller choosing an equivalent-but-differently-encoded fact. */
export function canonicalM3DriverFact(fact: M3DriverFact): string {
  return JSON.stringify([
    fact.intentId, fact.expectedUpdatedAt, fact.eventKind, fact.eventId,
    fact.dedupeKey, fact.evidenceId, fact.note, fact.at,
  ]);
}
