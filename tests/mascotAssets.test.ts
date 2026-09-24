// Mascot asset existence/mapping test. Every pose in MASCOT_ASSETS must
// resolve to a real file under public/ (what the browser actually fetches),
// and that file must meet a minimum pixel resolution so it doesn't look
// soft when the V6 workspace renders it at up to 162x162 CSS px (up to
// ~486px on a 3x display). See app/product/product-workspace.css
// `.v6-manager-visual .mascot`.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MASCOT_ASSETS } from "../app/somebody/Mascot";

const PUBLIC_ROOT = join(__dirname, "..", "public");
const BRAND_ROOT = join(__dirname, "..", "brand", "assets", "mascot");

// Minimal WEBP dimension reader (VP8X/VP8L/VP8 chunk parsing) — avoids a
// runtime dependency on sharp/PIL just to assert width/height in a test.
function webpDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a webp file");
  }
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  if (chunk === "VP8L") {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (chunk === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  throw new Error(`unrecognized webp chunk ${chunk}`);
}

const MIN_DIMENSION = 480; // headroom for 162px @ ~3x device pixel ratio

test("every MASCOT_ASSETS pose resolves to a file that exists under public/", () => {
  for (const [pose, src] of Object.entries(MASCOT_ASSETS)) {
    assert.ok(src, `pose ${pose} has no asset path`);
    const p = join(PUBLIC_ROOT, src!.replace(/^\//, ""));
    assert.ok(existsSync(p), `pose ${pose} maps to missing file ${src}`);
  }
});

test("Somebody mascot assets meet the minimum resolution for the V6 recording viewport", () => {
  const somebodyFiles = new Set(Object.values(MASCOT_ASSETS).filter((s) => s?.includes("/mascot/somebody-")));
  assert.ok(somebodyFiles.size > 0, "expected at least one somebody-* mascot asset");
  for (const src of somebodyFiles) {
    const p = join(PUBLIC_ROOT, src!.replace(/^\//, ""));
    const buf = readFileSync(p);
    const { width, height } = webpDimensions(buf);
    assert.ok(
      width >= MIN_DIMENSION && height >= MIN_DIMENSION,
      `${src} is ${width}x${height}, below the ${MIN_DIMENSION}px minimum for recording-quality rendering`,
    );
  }
});

test("public/mascot Somebody assets are byte-identical to brand/assets/mascot (single source of truth)", () => {
  for (const [pose, src] of Object.entries(MASCOT_ASSETS)) {
    if (!src?.includes("/mascot/somebody-")) continue;
    const filename = src.split("/").pop()!;
    const publicPath = join(PUBLIC_ROOT, "mascot", filename);
    const brandPath = join(BRAND_ROOT, filename);
    assert.ok(existsSync(brandPath), `missing brand source for ${filename} (pose ${pose})`);
    const publicBuf = readFileSync(publicPath);
    const brandBuf = readFileSync(brandPath);
    assert.ok(publicBuf.equals(brandBuf), `${filename} differs between brand/ and public/`);
  }
});
