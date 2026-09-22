// Pure helpers for the /start Create Objective flow.
// Kept free of React/Convex so focused tests can assert decision logic.

import type { ProductCommandError, ProductCommandResult } from "../product/contracts";
import {
  OBJECTIVE_REQUEST_MAX_CHARS,
  OBJECTIVE_REQUEST_MIN_CHARS,
} from "../../lib/product/objectiveRequest";

export const CREATE_TRANSITION_MS = 800;
export const CREATE_TRANSITION_COPY = "Somebody is on it.";
export const CREATE_TRANSITION_ASSET = "/mascot/duo/duo-walking-transparent.webp";

export function trimObjectiveRequest(raw: string): string {
  return raw.trim();
}

export function isRequestSubmittable(raw: string): boolean {
  const request = trimObjectiveRequest(raw);
  return (
    request.length >= OBJECTIVE_REQUEST_MIN_CHARS &&
    request.length <= OBJECTIVE_REQUEST_MAX_CHARS
  );
}

export function canSubmitCreate(
  raw: string,
  canCreateObjective: boolean,
  pending: boolean,
): boolean {
  return canCreateObjective && !pending && isRequestSubmittable(raw);
}

export function objectiveWorkspaceHref(objectiveId: string): string {
  return `/?objective=${encodeURIComponent(objectiveId)}`;
}

export function shouldShowSuccessTransition(result: ProductCommandResult): boolean {
  return result.accepted === true;
}

/** Reduced-motion: brief static hold is fine; walking animation is optional. */
export function transitionDurationMs(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : CREATE_TRANSITION_MS;
}

export function productErrorCopy(error: ProductCommandError): string {
  switch (error.code) {
    case "validation_error":
      return error.message || "Describe the objective in 8–2000 characters.";
    case "not_allowed":
      return error.message || "That option isn’t available yet.";
    case "temporarily_unavailable":
      return error.message || "Creation is unavailable right now. Try again in a moment.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}
