"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type {
  ProductCommandResult,
  ProductReadEnvelope,
  StartCapabilitiesView,
} from "../product/contracts";
import { StartView } from "./StartView";
import "./start.css";

export function StartContainer() {
  const router = useRouter();
  const envelope = useQuery(api.productWorkspace.getStartCapabilitiesV1, {}) as
    | ProductReadEnvelope<StartCapabilitiesView>
    | undefined;
  const capabilities = envelope?.found ? envelope.view : null;
  const createObjective = useMutation(api.productCommands.createObjectiveV1);

  const onCreate = useCallback(
    async (request: string): Promise<ProductCommandResult> => {
      // Product Command seam only — never the legacy objectives.submit path.
      return (await createObjective({ request })) as ProductCommandResult;
    },
    [createObjective],
  );

  const onNavigateToObjective = useCallback(
    (objectiveId: string) => {
      router.push(`/?objective=${encodeURIComponent(objectiveId)}`);
    },
    [router],
  );

  return (
    <div className="v6-start-page">
      <Link href="/" className="v6-start-back muted">
        ← Back to objectives
      </Link>
      <StartView
        capabilities={capabilities}
        onCreate={onCreate}
        onNavigateToObjective={onNavigateToObjective}
      />
    </div>
  );
}
