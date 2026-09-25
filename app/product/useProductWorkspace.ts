"use client";

/**
 * Live product-read seam: Convex productWorkspace queries → Product Contract
 * views. Replay mode never mounts this hook (see app/replay/ReplayWorkspace).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useConvexConnectionState } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ObjectiveListView, ObjectiveWorkspaceView, ProductReadEnvelope } from "./contracts";
import type { MainPaneState } from "./V6WorkspaceView";

function displayOrder(list: ObjectiveListView): string[] {
  return [...list.needsYou, ...list.inProgress, ...list.done].map((item) => item.id);
}

function useLastAccepted<T>(value: T | null | undefined): T | null {
  const ref = useRef<T | null>(null);
  if (value) ref.current = value;
  return ref.current;
}

export type ProductWorkspaceData = {
  list: ObjectiveListView;
  selectedId: string | null;
  select: (id: string) => void;
  main: MainPaneState;
};

export function useProductWorkspace(initialObjectiveId?: string): ProductWorkspaceData {
  const connection = useConvexConnectionState();

  const listEnvelope = useQuery(api.productWorkspace.getObjectiveListV1, {}) as
    | ProductReadEnvelope<ObjectiveListView>
    | undefined;
  const liveList = listEnvelope?.found ? listEnvelope.view : null;
  const lastList = useLastAccepted(liveList);

  const [selectedId, setSelectedId] = useState<string | null>(initialObjectiveId ?? null);

  useEffect(() => {
    if (selectedId || !liveList) return;
    const first = displayOrder(liveList)[0];
    if (first) setSelectedId(first);
  }, [liveList, selectedId]);

  const workspaceEnvelope = useQuery(
    api.productWorkspace.getObjectiveWorkspaceV1,
    selectedId ? { objectiveKey: selectedId } : "skip",
  ) as ProductReadEnvelope<ObjectiveWorkspaceView> | undefined;
  const lastWorkspaceView = useLastAccepted(workspaceEnvelope?.found ? workspaceEnvelope.view : null);

  const activeList = liveList ?? lastList;
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

  return {
    list: activeList ?? { inProgress: [], needsYou: [], done: [] },
    selectedId,
    select: setSelectedId,
    main,
  };
}
