import { ConvexClientProvider } from "./ConvexClientProvider";
import { DemoPlaybackProvider } from "./demo/DemoPlaybackProvider";
import { ProductWorkspace } from "./product/ProductWorkspace";

// V6 product surface — the app entry point. Reads only the accepted product
// contract (app/product/contracts.ts) via convex/productWorkspace.ts; see
// DESIGN.md for the approved information architecture. The older raw-domain
// Objective workspace stays reachable at /m5 (app/m5/(live)/page.tsx).
//
// DemoPlaybackProvider is the only place that can swap the product-data source
// to precomputed historical Product Contract frames (hackathon Demo Console).
export default async function Home({ searchParams }: { searchParams: Promise<{ objective?: string }> }) {
  const params = await searchParams;
  return (
    <ConvexClientProvider>
      <DemoPlaybackProvider>
        <ProductWorkspace initialObjectiveId={params.objective} />
      </DemoPlaybackProvider>
    </ConvexClientProvider>
  );
}
