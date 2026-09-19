// Runtime-safe deterministic SHA-256 for stable identity derivation.
//
// WHY THIS EXISTS (R3 finding I1)
// ──────────────────────────────
// The management kernels derive stable identities (option ids, wake event ids,
// intent ids, idempotency keys) by hashing semantic material with SHA-256.
// Those ids are business identities: they MUST stay byte-stable across
// processes, replays and deployments, and they MUST be computable synchronously
// inside a Convex mutation.
//
// `node:crypto` cannot serve that role here. Convex bundles function modules
// with esbuild's `platform: "browser"` unless the file declares `"use node"`,
// and a browser-platform bundle cannot resolve `node:crypto`. The kernels are
// imported by default-runtime modules (convex/management.ts, convex/objectives.ts),
// so a node:crypto import there is a deployment-time failure, not a style issue.
// Web Crypto (`crypto.subtle.digest`) IS available in the default runtime but is
// async-only, which would turn synchronous identity derivation into an await
// chain across every kernel — a wider change than the finding warrants.
//
// So this file is a pure, synchronous SHA-256 with no runtime dependencies.
// It is NOT used for security (no signatures, no secrets, no tokens); it is
// used only where a deterministic digest of application-controlled material is
// needed. Output is byte-identical to `createHash("sha256").digest("hex")`,
// which is pinned by tests against node:crypto itself.
//
// Scope discipline: this module replaces the hashing IMPLEMENTATION only.
// Identity SEMANTICS (what material is hashed, how it is joined, how many hex
// characters are kept) are unchanged at every call site.

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const INITIAL_H = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

// UTF-8 encode without TextEncoder/Buffer so the result is identical in every
// Convex runtime (default and node) and in Node itself.
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    // Surrogate pair → code point. Matches UTF-8 semantics exactly.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800)
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return bytes;
}

// SHA-256 of a UTF-8 string, as 64 lowercase hex characters.
export function sha256Hex(message: string): string {
  const bytes = utf8Bytes(message);
  const bitLength = bytes.length * 8;

  // Padding: 0x80, then zeros, then the 64-bit big-endian bit length.
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0x00);
  const highWord = Math.floor(bitLength / 0x100000000);
  bytes.push(
    (highWord >>> 24) & 0xff,
    (highWord >>> 16) & 0xff,
    (highWord >>> 8) & 0xff,
    highWord & 0xff,
    (bitLength >>> 24) & 0xff,
    (bitLength >>> 16) & 0xff,
    (bitLength >>> 8) & 0xff,
    bitLength & 0xff,
  );

  const h = INITIAL_H.slice();
  const w = new Array<number>(64);

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const o = chunk + i * 4;
      w[i] =
        ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      // σ0 = ROTR7 ⊕ ROTR18 ⊕ SHR3; σ1 = ROTR17 ⊕ ROTR19 ⊕ SHR10.
      // The last term of each is a right *shift*, not a rotation.
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  let out = "";
  for (let i = 0; i < 8; i++) out += h[i].toString(16).padStart(8, "0");
  return out;
}

// The shared identity convention used across the management kernels: the first
// 24 hex characters of the SHA-256 of the joined material. Unchanged semantics
// from the previous node:crypto implementation.
export function hash24(payload: string): string {
  return sha256Hex(payload).slice(0, 24);
}

// Join identity material the way the kernels always have: NUL-separated, so
// two fields can never concatenate into the same string as one longer field.
export function identityMaterial(parts: readonly string[]): string {
  return parts.join("\u0000");
}
