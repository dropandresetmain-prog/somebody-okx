"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { ProductReadEnvelope, StartCapabilitiesView } from "../product/contracts";
import { StartView } from "./StartView";
import "./start.css";

export function StartContainer() {
  const envelope = useQuery(api.productWorkspace.getStartCapabilitiesV1, {}) as
    | ProductReadEnvelope<StartCapabilitiesView>
    | undefined;
  const capabilities = envelope?.found ? envelope.view : null;

  return (
    <div className="v6-start-page">
      <Link href="/" className="v6-start-back muted">
        ← Back to objectives
      </Link>
      <StartView capabilities={capabilities} />
    </div>
  );
}
