"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DuoArt } from "../product/characters";
import type {
  ProductCommandResult,
  StartCapabilitiesView,
} from "../product/contracts";
import {
  CREATE_TRANSITION_COPY,
  canSubmitCreate,
  productErrorCopy,
  shouldShowSuccessTransition,
  transitionDurationMs,
  trimObjectiveRequest,
} from "./startCreateFlow";
import type { SomebodyMode } from "../../lib/product/mode";
import { REPLAY_START_CAPABILITIES, REPLAY_TRANSITION_COPY } from "./startReplayFlow";

type StartViewProps = {
  /**
   * live: capability-gated Create Objective via onCreate.
   * replay: the public site — submit only calls onReplayStart. The typed text
   * never leaves this component's state.
   */
  mode?: SomebodyMode;
  onReplayStart?: () => void;
  capabilities: StartCapabilitiesView | null;
  onCreate?: (request: string) => Promise<ProductCommandResult>;
  onNavigateToObjective?: (objectiveId: string) => void;
};

// /start — capability-gated composer. When canCreateObjective is true, submits
// through the Product Command adapter only. Unsupported controls stay hidden.
export function StartView({
  mode = "live",
  onReplayStart,
  capabilities: liveCapabilities,
  onCreate,
  onNavigateToObjective,
}: StartViewProps) {
  const replay = mode === "replay";
  const capabilities = replay ? REPLAY_START_CAPABILITIES : liveCapabilities;
  const loaded = capabilities !== null;
  const canCreate = capabilities?.canCreateObjective ?? false;
  const showContext = Boolean(capabilities?.supportsContextRefs);
  const showAttachments = Boolean(capabilities?.supportsAttachments);
  const showSpend = Boolean(capabilities?.advanced.spendLimit);
  const showDeadline = Boolean(capabilities?.advanced.deadline);
  const showPolicy = Boolean(capabilities?.advanced.externalEffectPolicy);
  const showAdvanced = showSpend || showDeadline || showPolicy;
  const showTools = showContext || showAttachments;

  const [request, setRequest] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitionObjectiveId, setTransitionObjectiveId] = useState<string | null>(null);
  const navigateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navigateTimer.current) clearTimeout(navigateTimer.current);
    };
  }, []);

  const submittable = canSubmitCreate(request, canCreate, pending);

  const finishNavigate = useCallback(
    (objectiveId: string) => {
      onNavigateToObjective?.(objectiveId);
    },
    [onNavigateToObjective],
  );

  const handleSubmit = useCallback(async () => {
    if (replay) {
      // Replay: start the recorded run. The visitor's text is not sent anywhere.
      if (!onReplayStart || !submittable || pending) return;
      setPending(true);
      setTransitionObjectiveId("replay");
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const delay = transitionDurationMs(reduced);
      if (delay <= 0) {
        onReplayStart();
        return;
      }
      navigateTimer.current = setTimeout(onReplayStart, delay);
      return;
    }
    if (!onCreate || !submittable || pending) return;
    setError(null);
    setPending(true);
    try {
      const trimmed = trimObjectiveRequest(request);
      const result = await onCreate(trimmed);
      if (!result.accepted) {
        setError(productErrorCopy(result.error));
        setPending(false);
        return;
      }
      if (!shouldShowSuccessTransition(result)) {
        setPending(false);
        return;
      }
      // Accepted → short walking-duo presentation, then navigate. Do not wait
      // for interpretation / contract / work. No automatic retry.
      setTransitionObjectiveId(result.objectiveId);
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const delay = transitionDurationMs(reduced);
      if (delay <= 0) {
        finishNavigate(result.objectiveId);
        return;
      }
      navigateTimer.current = setTimeout(() => {
        finishNavigate(result.objectiveId);
      }, delay);
    } catch {
      setError("Objective creation is unavailable right now. Try again in a moment.");
      setPending(false);
    }
  }, [finishNavigate, onCreate, onReplayStart, pending, replay, request, submittable]);

  if (transitionObjectiveId) {
    return (
      <div className="v6-start" data-start-phase="transition">
        <div className="v6-start-transition" role="status" aria-live="polite">
          <DuoArt
            pose="walking"
            className="v6-start-transition-duo"
            alt="Somebody and the Intern heading out"
          />
          <p className="v6-start-transition-copy">{replay ? REPLAY_TRANSITION_COPY : CREATE_TRANSITION_COPY}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="v6-start">
      <div className="v6-start-hero">
        <div className="v6-start-hero-art">
          <DuoArt
            pose="working"
            className="v6-start-hero-duo"
            alt="Somebody working while the Intern eagerly brings ideas"
          />
        </div>
        <p className="v6-objective-kicker">New objective</p>
        <h1>Give Somebody an objective</h1>
        <p>Describe the result you want. Add context, files or limits only when they matter.</p>
      </div>

      <div className="v6-start-composer" data-can-create={canCreate ? "true" : "false"}>
        <label className="sr-only" htmlFor="v6-start-request">
          Objective
        </label>
        <textarea
          id="v6-start-request"
          rows={5}
          disabled={!canCreate || pending}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Our launch messaging isn’t working. Figure out what’s wrong and get a better relaunch ready…"
        />
        <div className="v6-composer-bar">
          {showTools ? (
            <div className="v6-composer-tools">
              {showContext ? <div className="v6-tool-btn v6-start-field">Context</div> : null}
              {showAttachments ? <div className="v6-tool-btn v6-start-field">Attachments</div> : null}
            </div>
          ) : (
            <div />
          )}
          <button
            type="button"
            className="v6-send-btn"
            disabled={!submittable}
            data-start-submit="true"
            data-pending={pending ? "true" : "false"}
            onClick={() => void handleSubmit()}
          >
            {pending ? "Starting…" : "Start objective →"}
          </button>
        </div>
        {showAdvanced ? (
          <div className="v6-advanced">
            {showSpend ? (
              <div className="v6-advanced-card v6-start-field">
                <span>Spending authority</span>
                <strong>Spend limit</strong>
              </div>
            ) : null}
            {showDeadline ? (
              <div className="v6-advanced-card v6-start-field">
                <span>Deadline</span>
                <strong>Deadline</strong>
              </div>
            ) : null}
            {showPolicy ? (
              <div className="v6-advanced-card v6-start-field">
                <span>External effects</span>
                <strong>External effect policy</strong>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="muted v6-start-note v6-start-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted v6-start-note" role="status">
            {!loaded
              ? "Checking what’s available…"
              : canCreate
                ? "Somebody will interpret this and get to work."
                : "Starting a new objective isn’t available yet."}
          </p>
        )}
      </div>

      <div className="v6-empty-zones">
        <div className="v6-empty-zone">
          <strong>Activity</strong>
          <span>Meaningful moves will appear here once Somebody starts managing the objective.</span>
        </div>
        <div className="v6-empty-zone">
          <strong>Deliverable</strong>
          <span>Nothing to show yet. Output appears when there is something real to review.</span>
        </div>
      </div>
    </div>
  );
}
