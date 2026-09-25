// Product deployment mode.
//
//   live   — the full Somebody product: Convex reads, Product Commands, the
//            live engine, founder spend approval and PDF export.
//   replay — the public read-only website: /start hands off to a recorded,
//            completed run replayed through the same product UI. No Convex,
//            no Product Commands, no model/JEV/payment authority.
//
// Read NEXT_PUBLIC_SOMEBODY_MODE with a literal property access so Next.js
// inlines it at build time on both server and client bundles.

export type SomebodyMode = "live" | "replay";

export function parseSomebodyMode(raw: string | undefined): SomebodyMode {
  return raw?.trim().toLowerCase() === "replay" ? "replay" : "live";
}

export function somebodyMode(): SomebodyMode {
  return parseSomebodyMode(process.env.NEXT_PUBLIC_SOMEBODY_MODE);
}

export function isReplayMode(): boolean {
  return somebodyMode() === "replay";
}

/** Optional public link for "Contact the founder" (mailto:, https:, …). */
export function founderContactUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_FOUNDER_CONTACT_URL?.trim();
  return raw ? raw : null;
}
