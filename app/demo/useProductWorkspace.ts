"use client";

/**
 * Single product-read seam for V6.
 *
 * Live: Convex productWorkspace queries → Product Contract views.
 * Demo playback: current DemoFrame → the SAME Product Contract views.
 *
 * V6 presentational components must not branch on demo vs live.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useConvexConnectionState } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ObjectiveListView, ObjectiveWorkspaceView, ProductReadEnvelope } from "../product/contracts";
import type { MainPaneState } from "../product/V6WorkspaceView";
import { useDemoPlayback } from "./useDemoPlayback";

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
  /** True only while an explicit Demo Console scenario is active. */
  demoActive: boolean;
};

export function useProductWorkspace(initialObjectiveId?: string): ProductWorkspaceData {
  const demo = useDemoPlayback();
  const connection = useConvexConnectionState();

  // Skip live queries while demo playback owns the product-data source so
  // playback does not depend on (or keep) Convex subscriptions.
  const listEnvelope = useQuery(api.productWorkspace.getObjectiveListV1, demo.active ? "skip" : {}) as
    | ProductReadEnvelope<ObjectiveListView>
    | undefined;
  const liveList = listEnvelope?.found ? listEnvelope.view : null;
  const lastList = useLastAccepted(liveList);

  const [selectedId, setSelectedId] = useState<string | null>(initialObjectiveId ?? null);

  useEffect(() => {
    if (demo.active) return;
    if (selectedId || !liveList) return;
    const first = displayOrder(liveList)[0];
    if (first) setSelectedId(first);
  }, [liveList, selectedId, demo.active]);

  useEffect(() => {
    if (!demo.active || !demo.currentFrame) return;
    const demoId = demo.currentFrame.workspace.objective.id;
    if (selectedId !== demoId) setSelectedId(demoId);
  }, [demo.active, demo.currentFrame, selectedId]);

  function select(id: string) {
    if (demo.active) return; // playback owns selection for the scenario Objective
    setSelectedId(id);
  }

  const workspaceEnvelope = useQuery(
    api.productWorkspace.getObjectiveWorkspaceV1,
    !demo.active && selectedId ? { objectiveKey: selectedId } : "skip",
  ) as ProductReadEnvelope<ObjectiveWorkspaceView> | undefined;
  const lastWorkspaceView = useLastAccepted(workspaceEnvelope?.found ? workspaceEnvelope.view : null);

  if (demo.active && demo.currentFrame) {
    return {
      list: demo.currentFrame.objectiveList,
      selectedId: demo.currentFrame.workspace.objective.id,
      select,
      main: { kind: "ready", view: demo.currentFrame.workspace, stale: false },
      demoActive: true,
    };
  }

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
    select,
    main,
    demoActive: false,
  };
}
