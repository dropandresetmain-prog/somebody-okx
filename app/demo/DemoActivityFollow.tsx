"use client";

import { useEffect, useRef } from "react";
import { useDemoPlayback } from "./useDemoPlayback";

const NEAR_BOTTOM_PX = 140;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isNearBottom(): boolean {
  const remaining =
    document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  return remaining <= NEAR_BOTTOM_PX;
}

/**
 * Replay-only: keep the latest Activity item in view while Demo playback
 * advances. Does not run in live Product Read mode. Stops following if the
 * founder scrolls away; resumes if they return near the bottom.
 */
export function DemoActivityFollow({ activityCount }: { activityCount: number }) {
  const demo = useDemoPlayback();
  const followRef = useRef(true);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (!demo.active) {
      followRef.current = true;
      lastCountRef.current = 0;
      return;
    }

    function onScroll() {
      followRef.current = isNearBottom();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [demo.active]);

  useEffect(() => {
    if (!demo.active) return;
    if (demo.phase !== "playing" && demo.phase !== "delaying") return;

    if (activityCount < lastCountRef.current) {
      // Restart / frame rewind — reset follow and count.
      lastCountRef.current = activityCount;
      followRef.current = true;
    }

    if (activityCount <= lastCountRef.current) return;
    lastCountRef.current = activityCount;
    if (!followRef.current) return;

    const items = document.querySelectorAll<HTMLElement>("[data-activity-id]");
    const latest = items[items.length - 1];
    if (!latest) return;

    latest.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }, [activityCount, demo.active, demo.phase]);

  return null;
}
