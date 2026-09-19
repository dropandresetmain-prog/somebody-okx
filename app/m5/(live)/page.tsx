// Production /m5 — the accepted Executive Mission Control wired to the
// authoritative Convex read model. Provider scope: the narrowest correct
// structure. ConvexClientProvider wraps ONLY this route segment (see
// app/m5/layout.tsx); the root layout stays provider-free so other surfaces
// choose their own data strategy, and the fixture lane (/m5/fixtures) stays
// provider-free and fixture-only.
import { LiveWorkspace } from "../LiveWorkspace";
import "../mission-control.css";
import "../xray.css";

export default async function M5Page({ searchParams }: { searchParams: Promise<{ objective?: string }> }) {
  const params = await searchParams;
  return <LiveWorkspace initialObjectiveKey={params.objective} />;
}
