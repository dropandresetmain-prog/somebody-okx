/**
 * Evidence revision must represent source chronology, not webhook arrival order.
 * Domain revision is capped at 100_000_000, so we use whole seconds since a fixed epoch.
 * Later provider timestamps always beat earlier ones even if webhooks arrive late or retry.
 */
export const SOURCE_REVISION_EPOCH_MS = Date.UTC(2024, 0, 1);

export function parseProviderTimestamp(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0)
      throw new Error("Invalid provider timestamp");
    return value < 1_000_000_000_000 ? Math.trunc(value * 1000) : Math.trunc(value);
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Missing provider timestamp");
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0)
    return asNumber < 1_000_000_000_000
      ? Math.trunc(asNumber * 1000)
      : Math.trunc(asNumber);
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) throw new Error("Unparseable provider timestamp");
  return ms;
}

export function sourceRevision(observedAtMs: number): number {
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs <= 0)
    throw new Error("observedAt must be a positive integer timestamp");
  const seconds = Math.floor((observedAtMs - SOURCE_REVISION_EPOCH_MS) / 1000);
  if (seconds < 1) return 1;
  if (seconds > 100_000_000)
    throw new Error("Source timestamp exceeds supported revision range");
  return seconds;
}

/** Stable ordering helper for tests: earlier source time sorts first; message id breaks ties. */
export function compareSourceOrder(
  a: { observedAt: number; observationId: string },
  b: { observedAt: number; observationId: string },
): number {
  return a.observedAt - b.observedAt || a.observationId.localeCompare(b.observationId);
}
