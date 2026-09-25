"use client";

import {
  INTEGRATION_IDENTITIES,
  INTEGRATION_LOGO_ALT,
  INTEGRATION_LOGO_SRC,
  INTEGRATION_LOGO_TREATMENT,
} from "../integrations";
import type { ObjectiveWorkspaceView } from "../contracts";
import type { SomebodyMode } from "../../../lib/product/mode";

/**
 * Persistent, presentation-only view of the OKX stack used by the hackathon
 * demo. It never claims that a transaction, market search, wallet preparation,
 * or settlement has happened — those remain exclusively event-driven in
 * Activity. This card only shows the infrastructure/catalog that the controlled
 * Testnet demo can use.
 */
export function OKXDemoStack({ view, mode = "live" }: { view: ObjectiveWorkspaceView; mode?: SomebodyMode }) {
  void view; // stage progression is derived from the view (acquisitions/activity) — see Lane 5.
  const explicit = process.env.NEXT_PUBLIC_OKX_DEMO_SURFACE;
  const enabled =
    mode === "replay" ||
    explicit === "true" ||
    process.env.NEXT_PUBLIC_DEMO_CONSOLE === "true" ||
    (explicit !== "false" && process.env.NODE_ENV !== "production");

  if (!enabled) return null;

  const integrations = [
    INTEGRATION_IDENTITIES.okx_marketplace,
    INTEGRATION_IDENTITIES.okx_agentic_wallet,
    INTEGRATION_IDENTITIES.okx_x402,
    INTEGRATION_IDENTITIES.x_layer_testnet,
  ];

  return (
    <section className="v6-rail-card v6-okx-stack" data-okx-demo-surface="true">
      <div className="v6-rail-card-head v6-okx-stack-head">
        <h3>OKX stack</h3>
        <span>Testnet demo</span>
      </div>

      <div className="v6-okx-stack-body">
        <p className="v6-okx-stack-note">
          Infrastructure available to BUY flows. Live Activity cards appear only when the backend records the real event.
        </p>

        <div className="v6-okx-stack-integrations" aria-label="OKX integrations">
          {integrations.map((integration) => {
            const chip = INTEGRATION_LOGO_TREATMENT[integration.logoKey] === "chip-dark";
            return (
              <div className="v6-okx-stack-integration" key={integration.id}>
                <span className={chip ? "v6-okx-stack-logo-chip" : "v6-okx-stack-logo-plain"}>
                  <img
                    src={INTEGRATION_LOGO_SRC[integration.logoKey]}
                    alt={INTEGRATION_LOGO_ALT[integration.logoKey]}
                  />
                </span>
                <span>{integration.label}</span>
              </div>
            );
          })}
        </div>

        <div className="v6-okx-catalog">
          <p className="v6-okx-catalog-label">Controlled Testnet catalog</p>
          <div className="v6-okx-catalog-row v6-okx-catalog-row--primary">
            <span>Social Media Guru</span>
            <strong>$0.01</strong>
          </div>
          <div className="v6-okx-catalog-row">
            <span>Token Market Intelligence</span>
            <span className="muted">distractor</span>
          </div>
          <div className="v6-okx-catalog-row">
            <span>Wallet / Onchain Risk</span>
            <span className="muted">distractor</span>
          </div>
        </div>
      </div>
    </section>
  );
}
