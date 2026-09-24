// Canonical OKX / X Layer integration identities — governed brand vocabulary.
//
// This is the ONE place the founder-facing labels and logo assets for
// approved infrastructure identities are declared. Activity rendering must
// consume these constants rather than re-deriving or renaming labels.
//
// Logo assets are bundled locally under public/integrations/ (no hotlinking).
// Both are official, first-party assets (not placeholders):
//   - okx-wordmark-white.png — official OKX schema.org Organization logo from
//     https://www.okx.com/cdn/assets/imgs/221/187957948BD02D97.png (also the
//     mark served on https://www.okx.com). White glyphs on transparent — OKX
//     does not host a black/dark plain wordmark. Per spec (no recoloring /
//     redrawing), the PNG is used untouched; a small dark rounded chip is
//     rendered behind it in the UI (standard reversed-logo lockup).
//   - x-layer-icon-black.svg — XLayer_Icon_WhenLessThan40px_Black.svg from the
//     official X Layer logo kit (XLayer-logo-kit.zip) published by OKX at
//     https://github.com/okx/xlayer-docs/tree/main/media-kit (also linked from
//     X Layer docs). The <40px icon is the size-appropriate official mark for
//     the ~26px Activity logo slot; black, so it renders plain on light UI.

import type { IntegrationIdentity, IntegrationIdentityId } from "./contracts";

export const INTEGRATION_IDENTITIES: Record<IntegrationIdentityId, IntegrationIdentity> = {
  okx_marketplace: { id: "okx_marketplace", label: "OKX Marketplace", logoKey: "okx" },
  okx_agentic_wallet: { id: "okx_agentic_wallet", label: "OKX Agentic Wallet", logoKey: "okx" },
  okx_x402: { id: "okx_x402", label: "OKX x402", logoKey: "okx" },
  x_layer_testnet: { id: "x_layer_testnet", label: "X Layer Testnet", logoKey: "x_layer" },
};

/** Local, bundled logo asset paths — never a remote/hotlinked URL. */
export const INTEGRATION_LOGO_SRC: Record<IntegrationIdentity["logoKey"], string> = {
  okx: "/integrations/okx-wordmark-white.png",
  x_layer: "/integrations/x-layer-icon-black.svg",
};

export const INTEGRATION_LOGO_ALT: Record<IntegrationIdentity["logoKey"], string> = {
  okx: "OKX",
  x_layer: "X Layer",
};

/**
 * How each logo must be presented so an unmodified, un-recolored asset stays
 * legible on the light Activity surface (spec §2/§13 — no redrawing, no
 * recoloring, no distorted crop):
 *   - "chip-dark": the source asset is white/transparent-only (OKX's own
 *     site hosts no dark variant of the plain wordmark) — render it on a
 *     small dark rounded chip behind it, never recolor the PNG itself.
 *   - "plain": the source asset already reads correctly directly on the
 *     light surface (X Layer's black icon).
 */
export const INTEGRATION_LOGO_TREATMENT: Record<IntegrationIdentity["logoKey"], "chip-dark" | "plain"> = {
  okx: "chip-dark",
  x_layer: "plain",
};
