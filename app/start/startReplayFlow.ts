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
export const REPLAY_LIVE_CTA = "Want to experience Somebody live? Contact the founder.";
