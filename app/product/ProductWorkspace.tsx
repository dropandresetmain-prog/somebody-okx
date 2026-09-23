"use client";

// V6 live container. Product reads come through useProductWorkspace
// (live Convex vs explicit demo playback). Spend approval stays on the live
// Product Command path only — playback never mutates live Objective state.

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { AttentionActionView, ProductCommandResult } from "./contracts";
import { V6WorkspaceView } from "./V6WorkspaceView";
import { useProductWorkspace } from "../demo/useProductWorkspace";
import { DemoConsole } from "../demo/DemoConsole";
import { DemoActivityFollow } from "../demo/DemoActivityFollow";
import "./product-workspace.css";

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
  const { list, selectedId, select, main, demoActive } = useProductWorkspace(initialObjectiveId);
  const submitAttention = useMutation(api.productCommands.submitAttentionActionV1);

  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [attentionAck, setAttentionAck] = useState<string | null>(null);

  function onSelect(id: string) {
    select(id);
    setAttentionError(null);
    setAttentionAck(null);
    setPendingActionId(null);
    if (!demoActive) {
      router.replace(`?objective=${encodeURIComponent(id)}`, { scroll: false });
    }
  }

  async function onAttentionAction(action: AttentionActionView) {
    // Demo playback is historical — never submit live Product Commands from it.
    if (demoActive) return;
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

  const liveAttention =
    !demoActive && main.kind === "ready" && main.view.attention ? onAttentionAction : undefined;

  const activityCount = main.kind === "ready" ? main.view.activity.length : 0;

  return (
    <>
      <V6WorkspaceView
        list={list}
        selectedId={selectedId}
        onSelect={onSelect}
        onStartNew={() => router.push("/start")}
        main={main}
        onAttentionAction={liveAttention}
        pendingAttentionActionId={pendingActionId}
        attentionError={attentionError}
        attentionAcknowledgement={attentionAck}
      />
      {demoActive ? <DemoActivityFollow activityCount={activityCount} /> : null}
      <DemoConsole />
    </>
  );
}
