import type { JsonRpcTransport } from "./xlayerSettlement";

/**
 * Read-only EIP-712 / EIP-3009 domain compatibility preflight for the asset a
 * 402 challenge asks us to pay in.
 *
 * An x402 `exact` payment on EVM is an EIP-3009 `transferWithAuthorization`.
 * The buyer signs typed data whose EIP-712 domain is built from the challenge's
 * `extra.name` / `extra.version` plus the chain id and the asset address. The
 * token contract verifies that signature against its OWN domain. If the
 * challenge advertises a domain the token does not actually use, the signature
 * is well-formed but unverifiable: the facilitator cannot settle it, the
 * merchant keeps returning 402, and no funds ever move.
 *
 * That failure is invisible until after signing, so this module moves it before
 * signing. Everything here is read-only `eth_call`; it never signs or submits.
 */

/** `name()` */
const SELECTOR_NAME = "0x06fdde03";
/** `symbol()` */
const SELECTOR_SYMBOL = "0x95d89b41";
/** `decimals()` */
const SELECTOR_DECIMALS = "0x313ce567";
/** `version()` — EIP-3009/FiatToken exposes the EIP-712 domain version here. */
const SELECTOR_VERSION = "0x54fd4d50";
/** `DOMAIN_SEPARATOR()` */
const SELECTOR_DOMAIN_SEPARATOR = "0x3644e515";

export type AssetDomainFacts = {
  asset: string;
  /** null when the contract does not expose the getter (call reverted). */
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  version: string | null;
  domainSeparator: string | null;
};

export type AssetDomainExpectation = {
  /** challenge `extra.name` */
  name: string;
  /** challenge `extra.version` */
  version: string;
  /** decimals the challenge/quote decoded the amount with */
  decimals?: number;
};

export type AssetDomainVerdict =
  | { state: "compatible"; facts: AssetDomainFacts }
  | { state: "unverifiable"; facts: AssetDomainFacts; reasons: string[] }
  | { state: "incompatible"; facts: AssetDomainFacts; reasons: string[] };

/** Decode a solidity `string` return value. Returns null if not decodable. */
export function decodeAbiString(result: unknown): string | null {
  if (typeof result !== "string") return null;
  const hex = result.replace(/^0x/, "");
  if (hex.length < 128) return null;
  const length = Number.parseInt(hex.slice(64, 128), 16);
  if (!Number.isInteger(length) || length <= 0) return null;
  const body = hex.slice(128, 128 + length * 2);
  if (body.length < length * 2) return null;
  return Buffer.from(body, "hex").toString("utf8");
}

/** Decode a small solidity `uint`/`uint8` return value. */
export function decodeAbiUint(result: unknown): number | null {
  if (typeof result !== "string") return null;
  const hex = result.replace(/^0x/, "");
  if (hex.length === 0 || hex.length > 64) return null;
  const value = Number.parseInt(hex, 16);
  return Number.isFinite(value) ? value : null;
}

async function callOrNull(
  rpc: JsonRpcTransport,
  asset: string,
  selector: string,
): Promise<unknown> {
  try {
    return await rpc("eth_call", [{ to: asset, data: selector }, "latest"]);
  } catch {
    // A reverted getter is a fact about the contract, not a transport failure.
    return null;
  }
}

/** Read the asset's on-chain identity and EIP-712 domain inputs. Read-only. */
export async function readAssetDomainFacts(
  rpc: JsonRpcTransport,
  asset: string,
): Promise<AssetDomainFacts> {
  const [name, symbol, decimals, version, domainSeparator] = await Promise.all([
    callOrNull(rpc, asset, SELECTOR_NAME),
    callOrNull(rpc, asset, SELECTOR_SYMBOL),
    callOrNull(rpc, asset, SELECTOR_DECIMALS),
    callOrNull(rpc, asset, SELECTOR_VERSION),
    callOrNull(rpc, asset, SELECTOR_DOMAIN_SEPARATOR),
  ]);
  return {
    asset: asset.toLowerCase(),
    name: decodeAbiString(name),
    symbol: decodeAbiString(symbol),
    decimals: decodeAbiUint(decimals),
    version: decodeAbiString(version),
    domainSeparator:
      typeof domainSeparator === "string" && /^0x[0-9a-f]{64}$/i.test(domainSeparator)
        ? domainSeparator.toLowerCase()
        : null,
  };
}

/**
 * Compare challenge-advertised domain inputs against on-chain reality.
 *
 * `incompatible` means a signature built from the challenge cannot be verified
 * by the token and must not be produced. `unverifiable` means the contract does
 * not expose enough to decide; that is not proof of safety.
 */
export function verifyAssetDomain(
  facts: AssetDomainFacts,
  expected: AssetDomainExpectation,
): AssetDomainVerdict {
  const mismatches: string[] = [];
  const unknowns: string[] = [];

  if (facts.name === null) {
    unknowns.push("token does not expose name()");
  } else if (facts.name !== expected.name) {
    mismatches.push(
      `EIP-712 domain name mismatch: challenge says ${JSON.stringify(expected.name)}, token reports ${JSON.stringify(facts.name)}`,
    );
  }

  if (facts.version === null) {
    unknowns.push("token does not expose version()");
  } else if (facts.version !== expected.version) {
    mismatches.push(
      `EIP-712 domain version mismatch: challenge says ${JSON.stringify(expected.version)}, token reports ${JSON.stringify(facts.version)}`,
    );
  }

  if (expected.decimals !== undefined && facts.decimals !== null
      && facts.decimals !== expected.decimals) {
    mismatches.push(
      `decimals mismatch: challenge decoded with ${expected.decimals}, token reports ${facts.decimals}`,
    );
  }

  if (mismatches.length > 0) return { state: "incompatible", facts, reasons: mismatches };
  if (unknowns.length > 0) return { state: "unverifiable", facts, reasons: unknowns };
  return { state: "compatible", facts };
}

/** Raised when the challenge's advertised domain contradicts the live token. */
export class AssetDomainMismatchError extends Error {
  constructor(
    readonly asset: string,
    readonly reasons: readonly string[],
    readonly facts: AssetDomainFacts,
  ) {
    super(
      `Refusing to sign: 402 challenge asset domain does not match the on-chain token (${asset}). ` +
        reasons.join("; "),
    );
    this.name = "AssetDomainMismatchError";
  }
}

/**
 * Gate signing on domain compatibility. Throws on a proven mismatch.
 *
 * `unverifiable` is deliberately allowed through: some legitimate tokens expose
 * no `version()`. It is returned to the caller so it can be recorded, not
 * silently treated as a pass.
 */
export async function assertAssetDomainCompatible(
  rpc: JsonRpcTransport,
  asset: string,
  expected: AssetDomainExpectation,
): Promise<AssetDomainVerdict> {
  const facts = await readAssetDomainFacts(rpc, asset);
  const verdict = verifyAssetDomain(facts, expected);
  if (verdict.state === "incompatible") {
    throw new AssetDomainMismatchError(asset, verdict.reasons, facts);
  }
  return verdict;
}
