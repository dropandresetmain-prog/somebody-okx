import { Icon, type IconName } from "./Icon";
import type { MascotPose } from "./presentation";

// Mascot slot. Pose art comes from brand/assets (served via public/mascot).
// Mapping follows presentation.ts poses → Somebody brand state WebPs.
// See DESIGN.md → "Mascot" and brand/SOMEBODY_BRAND.md.
export const MASCOT_ASSETS: Partial<Record<MascotPose, string>> = {
  idle: "/mascot/somebody-neutral.webp",
  reading: "/mascot/somebody-searching.webp",
  asking: "/mascot/somebody-following-up.webp",
  typing: "/mascot/somebody-working.webp",
  waiting: "/mascot/somebody-waiting.webp",
  reviewing: "/mascot/somebody-searching.webp",
  presenting: "/mascot/somebody-needs-approval.webp",
  "following-up": "/mascot/somebody-following-up.webp",
  verifying: "/mascot/somebody-working.webp",
  done: "/mascot/somebody-done-verified.webp",
  stopped: "/mascot/somebody-following-up.webp",
};

const POSE: Record<MascotPose, { prop: IconName; label: string }> = {
  idle: { prop: "coffee", label: "waiting for a job, coffee in hand" },
  reading: { prop: "document", label: "reading the paperwork" },
  asking: { prop: "clipboard", label: "checking a detail with you" },
  typing: { prop: "laptop", label: "typing on a laptop" },
  waiting: { prop: "phone", label: "waiting for a reply" },
  reviewing: { prop: "search", label: "reviewing quotes" },
  presenting: { prop: "pen", label: "holding out a form to sign" },
  "following-up": { prop: "mail", label: "following up" },
  verifying: { prop: "clipboard", label: "checking it actually happened" },
  done: { prop: "stamp", label: "stamping it done" },
  stopped: { prop: "hand", label: "stopping to check with you" },
};

export function Mascot({
  pose,
  size = "md",
  live = false,
}: {
  pose: MascotPose;
  size?: "sm" | "md" | "lg";
  live?: boolean;
}) {
  const src = MASCOT_ASSETS[pose];
  const { prop, label } = POSE[pose];
  return (
    <figure
      className={`mascot mascot-${size}${live ? " is-live" : ""}${src ? " has-art" : ""}`}
      data-pose={pose}
      role="img"
      aria-label={`Somebody, ${label}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <span className="mascot-placeholder">
          <Icon name={prop} size={size === "lg" ? 40 : size === "md" ? 28 : 18} />
        </span>
      )}
    </figure>
  );
}
