// ConvexClientProvider scope decision (M5 integration):
//   - NOT the old root-layout provider: root wraps every surface, including
//     ones that must stay provider-free.
//   - NOT the fixture-era page-level placement: production /m5 is real now.
//   - CHOSEN: the narrowest correct structure — a route-group layout that
//     wraps ONLY the live mission-control segment. The fixture lane lives in a
//     sibling route group with no provider and no Convex dependency.
import type { ReactNode } from "react";
import { ConvexClientProvider } from "../../ConvexClientProvider";

export default function LiveLayout({ children }: { children: ReactNode }) {
  return <ConvexClientProvider>{children}</ConvexClientProvider>;
}
