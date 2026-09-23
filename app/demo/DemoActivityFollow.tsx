"use client";

import { useEffect, useRef } from "react";
import { useDemoPlayback } from "./useDemoPlayback";

const NEAR_BOTTOM_PX = 140;
/** Scroll events inside this window after our own scrollIntoView are ours, not the founder's. */
const AUTO_SCROLL_GUARD_MS = 1_200;

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
  const autoScrollUntilRef = useRef(0);

  useEffect(() => {
    if (!demo.active) {
      followRef.current = true;
      lastCountRef.current = 0;
      return;
    }

    function onScroll() {
      // Mid-animation of our own smooth scroll the page is briefly "not near
      // the bottom"; reading that as the founder scrolling away would stop
      // following for the rest of the run (closely spaced events hit this).
      if (performance.now() < autoScrollUntilRef.current) return;
      followRef.current = isNearBottom();
    }
    // Any real founder input ends the guard immediately so their scroll wins.
    function onUserIntent() {
      autoScrollUntilRef.current = 0;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onUserIntent, { passive: true });
    window.addEventListener("touchstart", onUserIntent, { passive: true });
    window.addEventListener("keydown", onUserIntent);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onUserIntent);
      window.removeEventListener("touchstart", onUserIntent);
      window.removeEventListener("keydown", onUserIntent);
    };
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

    autoScrollUntilRef.current = performance.now() + AUTO_SCROLL_GUARD_MS;
    latest.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }, [activityCount, demo.active, demo.phase]);

  return null;
}
