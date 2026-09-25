"use client";

import {
  INTEGRATION_IDENTITIES,
  INTEGRATION_LOGO_ALT,
  INTEGRATION_LOGO_SRC,
  INTEGRATION_LOGO_TREATMENT,
} from "../integrations";
import type { ActivityItem, IntegrationActivityPayload, ObjectiveWorkspaceView } from "../contracts";
import { humanizeKey, presentOption } from "../humanize";
import type { SomebodyMode } from "../../../lib/product/mode";

type StackStageId = "marketplace" | "wallet" | "x402" | "xlayer";

type StackStage = {
  id: StackStageId;
  title: string;
  detail: string;
  logoKey: "okx" | "x_layer";
  state: "pending" | "active" | "complete";
};

function isIntegration(payload: ActivityItem["payload"]): payload is IntegrationActivityPayload {
  return Boolean(payload && "integration" in payload && "action" in payload);
}

/** Merchant / offering label from recorded facts only — never a hardcoded default. */
function resolveMerchantLabel(view: ObjectiveWorkspaceView): string | null {
  for (const item of view.activity) {
    if (item.type === "integration_activity" && isIntegration(item.payload) && item.payload.merchantLabel) {
      return item.payload.merchantLabel;
    }
  }
  for (const item of view.activity) {
    if (item.type === "manager_decision" && item.payload && "selected" in item.payload && item.payload.selected.approach === "BUY") {
      return presentOption(item.payload.selected).label;
    }
  }
  const acquisition = view.acquisitions[0];
  if (acquisition?.providerLabel) {
    // Prefer the resource/offering name when the provider is the marketplace namespace.
    if (acquisition.resourceLabel === "proprietary_data" || /social_media_guru/i.test(acquisition.providerLabel)) {
      return humanizeKey("social_media_guru");
    }
    return humanizeKey(acquisition.providerLabel);
  }
  if (view.attention?.detail) {
    const match = view.attention.detail.match(/\b[a-z][a-z0-9]*(?:[_:][a-z0-9]+)+\b/i);
    if (match) return humanizeKey(match[0]);
  }
  return null;
}

/**
 * Derive OKX Stack progression from recorded Product Contract facts only.
 * Never invents a stronger claim than the activity / acquisition / attention state shows.
 */
export function deriveOkxStackStages(view: ObjectiveWorkspaceView): StackStage[] {
  const integrations = view.activity.filter((item) => item.type === "integration_activity" && isIntegration(item.payload));
  const actions = new Set(
    integrations.map((item) => (isIntegration(item.payload) ? item.payload.action : null)).filter(Boolean),
  );
  const buySelected = view.activity.some(
    (item) =>
      item.type === "manager_decision" &&
      item.payload &&
      "selected" in item.payload &&
      item.payload.selected.approach === "BUY",
  );
  const needsApproval =
    Boolean(view.attention) || view.activity.some((item) => item.type === "founder_action_required");
  const acquisition = view.acquisitions[0];
  const hasAcquisition = Boolean(acquisition);
  const merchant = resolveMerchantLabel(view);
  const price =
    acquisition?.amount?.currency &&
    (/^usd$/i.test(acquisition.amount.currency.trim()) || /^usd₮/i.test(acquisition.amount.currency.trim()))
      ? `$${acquisition.amount.amount}`
      : null;

  // Marketplace is "selected" only when BUY is chosen, approval is pending, or an
  // acquisition exists — never from a market search alone (searches can run while MAKE continues).
  const offeringSelected = buySelected || needsApproval || hasAcquisition;
  const marketplaceSearching = actions.has("market_search") && !offeringSelected;

  const walletDone =
    actions.has("payment_preparing") ||
    actions.has("transaction_submitted") ||
    actions.has("settlement_confirmed") ||
    hasAcquisition;

  const x402Done = actions.has("transaction_submitted") || actions.has("settlement_confirmed");
  const xlayerSubmitted = actions.has("transaction_submitted");
  const xlayerConfirmed = actions.has("settlement_confirmed");

  const rows: Array<Omit<StackStage, "state"> & { done: boolean }> = [
    {
      id: "marketplace",
      title: "Marketplace",
      detail: offeringSelected
        ? `${merchant ?? "Outside offering"} selected`
        : marketplaceSearching
          ? "Comparing outside options"
          : "Looking for an outside option",
      logoKey: "okx",
      done: offeringSelected,
    },
    {
      id: "wallet",
      title: "Agentic Wallet",
      detail: walletDone ? "Purchase authorized" : "Waiting for authorization",
      logoKey: "okx",
      done: walletDone,
    },
    {
      id: "x402",
      title: "x402",
      detail: x402Done ? (price ? `${price} paid` : "Payment submitted") : "Payment pending",
      logoKey: "okx",
      done: x402Done,
    },
    {
      id: "xlayer",
      title: "X Layer Testnet",
      detail: xlayerConfirmed
        ? "Transaction confirmed"
        : xlayerSubmitted
          ? "Transaction submitted"
          : "Waiting for confirmation",
      logoKey: "x_layer",
      // Complete only on settlement — submission alone is a weaker claim.
      done: xlayerConfirmed,
    },
  ];

  // Searching counts as activity on the marketplace stage without completing it.
  const firstOpen = rows.findIndex((row) => !row.done);
  return rows.map((row, index) => {
    let state: StackStage["state"];
    if (row.done) {
      state = "complete";
    } else if (row.id === "marketplace" && marketplaceSearching) {
      state = "active";
    } else if (row.id === "xlayer" && xlayerSubmitted && !xlayerConfirmed) {
      state = "active";
    } else if (index === firstOpen) {
      state = "active";
    } else {
      state = "pending";
    }
    return {
      id: row.id,
      title: row.title,
      detail: row.detail,
      logoKey: row.logoKey,
      state,
    };
  });
}

/**
 * Persistent presentation of the OKX path used by BUY flows.
 * Stage lines are derived from the current Product Contract view — never from
 * live network calls. Catalog distractors and internal driver labels stay out.
 */
export function OKXDemoStack({ view, mode = "live" }: { view: ObjectiveWorkspaceView; mode?: SomebodyMode }) {
  const explicit = process.env.NEXT_PUBLIC_OKX_DEMO_SURFACE;
  const enabled =
    mode === "replay" ||
    explicit === "true" ||
    process.env.NEXT_PUBLIC_DEMO_CONSOLE === "true" ||
    (explicit !== "false" && process.env.NODE_ENV !== "production");

  if (!enabled) return null;

  const stages = deriveOkxStackStages(view);
  const identities = [
    INTEGRATION_IDENTITIES.okx_marketplace,
    INTEGRATION_IDENTITIES.okx_agentic_wallet,
    INTEGRATION_IDENTITIES.okx_x402,
    INTEGRATION_IDENTITIES.x_layer_testnet,
  ];

  return (
    <section className="v6-rail-card v6-okx-stack" data-okx-demo-surface="true">
      <div className="v6-rail-card-head v6-okx-stack-head">
        <h3>OKX stack</h3>
        <span>BUY path</span>
      </div>

      <div className="v6-okx-stack-body">
        <ol className="v6-okx-stack-stages" aria-label="OKX path">
          {stages.map((stage, index) => {
            const identity = identities[index]!;
            const chip = INTEGRATION_LOGO_TREATMENT[stage.logoKey] === "chip-dark";
            return (
              <li
                key={stage.id}
                className="v6-okx-stack-stage"
                data-okx-stage={stage.id}
                data-okx-stage-state={stage.state}
              >
                <span className={chip ? "v6-okx-stack-logo-chip" : "v6-okx-stack-logo-plain"}>
                  <img
                    src={INTEGRATION_LOGO_SRC[stage.logoKey]}
                    alt={INTEGRATION_LOGO_ALT[stage.logoKey]}
                  />
                </span>
                <div className="v6-okx-stack-stage-copy">
                  <span className="v6-okx-stack-stage-title">{stage.title}</span>
                  <span className="v6-okx-stack-stage-detail">{stage.detail}</span>
                  <span className="sr-only">{identity.label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
