/** Bounded snake_case identity for outcome levels (application-owned, not model judgment). */
const LEVEL_KEY_PATTERN = /^[a-z][a-z0-9_]{1,60}$/;

/**
 * Deterministically canonicalize a human label (or cosmetic bar reference) into a
 * bounded outcome levelKey. Returns null when the result is empty or invalid.
 */
export function canonicalizeOutcomeLevelIdentifier(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const collapsed = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!collapsed || !LEVEL_KEY_PATTERN.test(collapsed)) return null;
  return collapsed;
}

export function isValidOutcomeLevelKey(key: string): boolean {
  return LEVEL_KEY_PATTERN.test(key);
}
