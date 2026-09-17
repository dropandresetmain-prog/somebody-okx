"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function HealthStatus() {
  const health = useQuery(api.health.status);
  if (health === undefined) return <p>Connecting to Convex…</p>;
  return (
    <pre>
      {JSON.stringify(
        {
          ok: health.ok,
          deploymentName: health.deploymentName,
          liveAiEnabled: health.liveAiEnabled,
        },
        null,
        2,
      )}
    </pre>
  );
}
