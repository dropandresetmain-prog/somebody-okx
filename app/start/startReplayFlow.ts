// Pure constants for the public replay /start experience.
// Kept free of React/Convex so focused tests can assert them.

import type { StartCapabilitiesView } from "../product/contracts";

/**
 * Replay /start shows the complete composer. Only the main submit action does
 * anything, and it only starts the recorded run.
 */
export const REPLAY_START_CAPABILITIES: StartCapabilitiesView = {
  canCreateObjective: true,
  supportsContextRefs: true,
  supportsAttachments: true,
  advanced: { spendLimit: true, deadline: true, externalEffectPolicy: true },
};

export const REPLAY_TRANSITION_COPY = "Starting the completed run…";

export const REPLAY_DISCLOSURE_TITLE = "Public replay";
export const REPLAY_DISCLOSURE_BODY =
  "This website replays a completed Somebody run so you can see the full MAKE + BUY journey. Whatever you type below starts the replay; it is not sent to the live AI engine.";
export const REPLAY_LIVE_QUESTION = "Want to experience Somebody live?";
export const REPLAY_CONTACT_LABEL = "Contact the founder.";
/** Plain-text fallback when no founder contact link is configured. */
export const REPLAY_LIVE_CTA = `${REPLAY_LIVE_QUESTION} ${REPLAY_CONTACT_LABEL}`;

/** Note shown under the replay composer, in place of the live "what happens next" copy. */
export const REPLAY_COMPOSER_NOTE =
  "Somebody will define success, do the work, and ask before it spends.";

/** Which action a submit should take for a given mode. Pure — no side effects. */
export function startSubmitAction(mode: "live" | "replay"): "replay" | "create" {
  return mode === "replay" ? "replay" : "create";
}
