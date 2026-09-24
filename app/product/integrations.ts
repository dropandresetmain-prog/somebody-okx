// Canonical OKX / X Layer integration identities — governed brand vocabulary.
//
// This is the ONE place the founder-facing labels and logo assets for
// approved infrastructure identities are declared. Activity rendering must
// consume these constants rather than re-deriving or renaming labels.
//
// Logo assets are bundled locally under public/integrations/ (no hotlinking).
// The files currently checked in are PLACEHOLDERS ONLY — see the header
// comment in each SVG for the exact official asset that must replace it
// before this ships publicly.

import type { IntegrationIdentity, IntegrationIdentityId } from "./contracts";

export const INTEGRATION_IDENTITIES: Record<IntegrationIdentityId, IntegrationIdentity> = {
  okx_marketplace: { id: "okx_marketplace", label: "OKX Marketplace", logoKey: "okx" },
  okx_agentic_wallet: { id: "okx_agentic_wallet", label: "OKX Agentic Wallet", logoKey: "okx" },
  okx_x402: { id: "okx_x402", label: "OKX x402", logoKey: "okx" },
  x_layer_testnet: { id: "x_layer_testnet", label: "X Layer Testnet", logoKey: "x_layer" },
};

/** Local, bundled logo asset paths — never a remote/hotlinked URL. */
export const INTEGRATION_LOGO_SRC: Record<IntegrationIdentity["logoKey"], string> = {
  okx: "/integrations/okx.svg",
  x_layer: "/integrations/x-layer.svg",
};

export const INTEGRATION_LOGO_ALT: Record<IntegrationIdentity["logoKey"], string> = {
  okx: "OKX",
  x_layer: "X Layer",
};
