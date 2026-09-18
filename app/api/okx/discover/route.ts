/**
 * Documented local demo bridge for official onchainos discovery.
 *
 * Convex cloud cannot reliably spawn the CLI. Local Next.js can.
 * Set OKX_DISCOVERY_BRIDGE_URL on the Convex deployment only if this
 * route is publicly reachable; otherwise Convex Node attempts local
 * onchainos and uses explicit snapshot fallback with provenance.
 *
 * POST body: { resourceClass, taskDescription, limit? }
 * Response: { offerings, provenance }
 */

import { NextResponse } from "next/server";
import { createOkxDiscovery } from "@/lib/market/okxDiscovery";
import { createLocalOnchainosRunner } from "@/lib/market/okxCliBridge";
import type { ResourceClass } from "@/lib/workforce/types";
import type { MarketOffering } from "@/lib/market/discovery";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: {
    resourceClass?: string;
    taskDescription?: string;
    limit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.resourceClass || !body.taskDescription) {
    return NextResponse.json(
      { error: "resourceClass and taskDescription required" },
      { status: 400 },
    );
  }

  const discovery = createOkxDiscovery({
    allowSnapshotFallback: true,
    runner: createLocalOnchainosRunner(),
  });
  const offerings = await discovery.discover({
    resourceClass: body.resourceClass as ResourceClass,
    taskDescription: body.taskDescription,
    limit: body.limit,
  });

  return NextResponse.json({
    offerings,
    provenance: {
      bridge: "next_api_okx_discover",
      sourceKinds: [
        ...new Set(offerings.map((o: MarketOffering) => o.source.kind)),
      ],
    },
  });
}
