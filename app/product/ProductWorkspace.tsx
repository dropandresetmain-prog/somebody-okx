"use client";

// V6 live container (task §8/§19). The ONLY component that talks to Convex.
// Wires V1 product read queries and the spend-approval attention command,
// then hands pure product-contract data down to V6WorkspaceView.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useConvexConnectionState } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type {
  AttentionActionView,
  ObjectiveListView,
  ObjectiveWorkspaceView,
  ProductCommandResult,
  ProductReadEnvelope,
} from "./contracts";
import { V6WorkspaceView, type MainPaneState } from "./V6WorkspaceView";
import "./product-workspace.css";

function displayOrder(list: ObjectiveListView): string[] {
  return [...list.needsYou, ...list.inProgress, ...list.done].map((item) => item.id);
}

function useLastAccepted<T>(value: T | null | undefined): T | null {
  const ref = useRef<T | null>(null);
  if (value) ref.current = value;
  return ref.current;
}

function attentionErrorCopy(result: Extract<ProductCommandResult, { accepted: false }>): string {
  switch (result.error.code) {
    case "stale_view":
      return result.error.message || "This approval is no longer current. Refresh and try again.";
    case "not_allowed":
      return result.error.message || "That action isn’t available yet.";
    case "validation_error":
      return result.error.message || "That approval request was incomplete.";
    case "temporarily_unavailable":
      return result.error.message || "Spend approval is unavailable right now. Try again in a moment.";
    default:
      return result.error.message || "Something went wrong. Please try again.";
  }
}

export function ProductWorkspace({ initialObjectiveId }: { initialObjectiveId?: string }) {
  const router = useRouter();
  const connection = useConvexConnectionState();
  const submitAttention = useMutation(api.productCommands.submitAttentionActionV1);

  const listEnvelope = useQuery(api.productWorkspace.getObjectiveListV1, {}) as
    | ProductReadEnvelope<ObjectiveListView>
    | undefined;
  const list = listEnvelope?.found ? listEnvelope.view : null;
  const lastList = useLastAccepted(list);
  const activeList = list ?? lastList;

  const [selectedId, setSelectedId] = useState<string | null>(initialObjectiveId ?? null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [attentionAck, setAttentionAck] = useState<string | null>(null);

  // Deterministic initial selection (task §9): URL id if present, else the
  // first Objective in the V6 display order the backend already grouped.
  useEffect(() => {
    if (selectedId || !list) return;
    const first = displayOrder(list)[0];
    if (first) setSelectedId(first);
  }, [list, selectedId]);

  function select(id: string) {
    setSelectedId(id);
    setAttentionError(null);
    setAttentionAck(null);
    setPendingActionId(null);
    router.replace(`?objective=${encodeURIComponent(id)}`, { scroll: false });
  }

  const workspaceEnvelope = useQuery(
    api.productWorkspace.getObjectiveWorkspaceV1,
    selectedId ? { objectiveKey: selectedId } : "skip",
  ) as ProductReadEnvelope<ObjectiveWorkspaceView> | undefined;
  const lastWorkspaceView = useLastAccepted(
    workspaceEnvelope?.found ? workspaceEnvelope.view : null,
  );

  const stale = connection.hasEverConnected && !connection.isWebSocketConnected;

  let main: MainPaneState;
  if (!activeList) {
    main = { kind: "loading" };
  } else if (displayOrder(activeList).length === 0) {
    main = { kind: "no_objectives" };
  } else if (!selectedId) {
    main = { kind: "loading" };
  } else if (workspaceEnvelope === undefined) {
    main = lastWorkspaceView ? { kind: "ready", view: lastWorkspaceView, stale: true } : { kind: "loading" };
  } else if (!workspaceEnvelope.found) {
    main = { kind: "not_found" };
  } else {
    main = { kind: "ready", view: workspaceEnvelope.view, stale };
  }

  async function onAttentionAction(action: AttentionActionView) {
    if (main.kind !== "ready" || !selectedId || pendingActionId) return;
    const attention = main.view.attention;
    if (!attention) return;

    setPendingActionId(action.id);
    setAttentionError(null);
    setAttentionAck(null);
    try {
      const result = (await submitAttention({
        objectiveId: selectedId,
        attentionId: attention.id,
        attentionRevision: attention.revision,
        actionId: action.id,
      })) as ProductCommandResult;
      if (result.accepted) {
        setAttentionAck("Approval recorded. Somebody is continuing.");
      } else {
        setAttentionError(attentionErrorCopy(result));
      }
    } catch {
      setAttentionError("Spend approval is unavailable right now. Try again in a moment.");
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <V6WorkspaceView
      list={activeList ?? { inProgress: [], needsYou: [], done: [] }}
      selectedId={selectedId}
      onSelect={select}
      onStartNew={() => router.push("/start")}
      main={main}
      onAttentionAction={main.kind === "ready" && main.view.attention ? onAttentionAction : undefined}
      pendingAttentionActionId={pendingActionId}
      attentionError={attentionError}
      attentionAcknowledgement={attentionAck}
    />
  );
}
