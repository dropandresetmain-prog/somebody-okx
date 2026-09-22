import { ConvexClientProvider } from "./ConvexClientProvider";
import { ProductWorkspace } from "./product/ProductWorkspace";

// V6 product surface — the app entry point. Reads only the accepted product
// contract (app/product/contracts.ts) via convex/productWorkspace.ts; see
// DESIGN.md for the approved information architecture. The older raw-domain
// Objective workspace stays reachable at /m5 (app/m5/(live)/page.tsx).
export default async function Home({ searchParams }: { searchParams: Promise<{ objective?: string }> }) {
  const params = await searchParams;
  return (
    <ConvexClientProvider>
      <ProductWorkspace initialObjectiveId={params.objective} />
    </ConvexClientProvider>
  );
}
