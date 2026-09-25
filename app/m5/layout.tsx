import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isReplayMode } from "../../lib/product/mode";

// The legacy Mission Control surfaces (/m5, /m5/fixtures) belong to the live
// product only. The public replay website exposes /start and the replay
// workspace, nothing else.
export default function M5Layout({ children }: { children: ReactNode }) {
  if (isReplayMode()) notFound();
  return children;
}
