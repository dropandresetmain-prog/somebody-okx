"use client";

// V6 live container (task §8/§19). Talks to Convex only through the product
// read seam (useProductWorkspace). Demo playback swaps the data source at that
// seam; V6WorkspaceView stays Convex-unaware.

import { useRouter } from "next/navigation";
import { V6WorkspaceView } from "./V6WorkspaceView";
import { useProductWorkspace } from "../demo/useProductWorkspace";
import { DemoConsole } from "../demo/DemoConsole";
import "./product-workspace.css";

export function ProductWorkspace({ initialObjectiveId }: { initialObjectiveId?: string }) {
  const router = useRouter();
  const { list, selectedId, select, main, demoActive } = useProductWorkspace(initialObjectiveId);

  function onSelect(id: string) {
    select(id);
    if (!demoActive) {
      router.replace(`?objective=${encodeURIComponent(id)}`, { scroll: false });
    }
  }

  return (
    <>
      <V6WorkspaceView
        list={list}
        selectedId={selectedId}
        onSelect={onSelect}
        onStartNew={() => router.push("/start")}
        main={main}
      />
      <DemoConsole />
    </>
  );
}
