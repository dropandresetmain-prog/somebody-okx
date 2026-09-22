"use client";

// V6 live container (task §8/§19). The ONLY component that talks to Convex.
// Wires exactly the three V1 product read queries and hands pure
// product-contract data down to V6WorkspaceView, which has no Convex
// dependency at all.
//
// Loading / not-found / empty / reconnecting are infrastructure states, kept
// separate from ObjectiveProductStatus (contract §19 of the handoff).

import { useEffect, useRef, useState } from "react";
import { useQuery, useConvexConnectionState } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { ObjectiveListView, ObjectiveWorkspaceView, ProductReadEnvelope } from "./contracts";
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

export function ProductWorkspace({ initialObjectiveId }: { initialObjectiveId?: string }) {
  const router = useRouter();
  const connection = useConvexConnectionState();

  const listEnvelope = useQuery(api.productWorkspace.getObjectiveListV1, {}) as
    | ProductReadEnvelope<ObjectiveListView>
    | undefined;
  const list = listEnvelope?.found ? listEnvelope.view : null;
  const lastList = useLastAccepted(list);
  const activeList = list ?? lastList;

  const [selectedId, setSelectedId] = useState<string | null>(initialObjectiveId ?? null);

  // Deterministic initial selection (task §9): URL id if present, else the
  // first Objective in the V6 display order the backend already grouped.
  useEffect(() => {
    if (selectedId || !list) return;
    const first = displayOrder(list)[0];
    if (first) setSelectedId(first);
  }, [list, selectedId]);

  function select(id: string) {
    setSelectedId(id);
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

  return (
    <V6WorkspaceView
      list={activeList ?? { inProgress: [], needsYou: [], done: [] }}
      selectedId={selectedId}
      onSelect={select}
      onStartNew={() => router.push("/start")}
      main={main}
    />
  );
}
