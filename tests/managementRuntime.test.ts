// I1 — Convex runtime compatibility.
//
// The management kernels derive BUSINESS identities (option ids, wake event ids,
// intent ids, idempotency keys) by hashing semantic material. Those ids must be
// byte-stable across processes, replays and deployments, and they must be
// computable synchronously inside a Convex mutation.
//
// Two things are pinned here:
//   1. the runtime-safe SHA-256 is byte-identical to node:crypto, including
//      multi-byte UTF-8 and NUL-joined identity material — so replacing the
//      hashing IMPLEMENTATION did not move a single identity;
//   2. every Convex module that runs on the DEFAULT platform still bundles when
//      node:crypto is unavailable — the failure R3 hit while bundling for the
//      browser platform.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { sha256Hex, hash24, identityMaterial } from "../lib/management/sha256";
import { optionIdFor } from "../lib/management/options";
import { deriveIntentId, deriveIdempotencyKey } from "../lib/management/intents";
import {
  planWakeForWorkerResult,
  planWakeForResourceRequest,
} from "../lib/management/wakes";

const REPO = path.resolve(process.cwd());

test("sha256Hex is byte-identical to node:crypto across adversarial inputs", () => {
  const cases = [
    "",
    "a",
    "abc",
    "hello world",
    "obj_1\u0000req_a\u00002\u0000opt_z",
    "é",
    "日本語テキスト",
    "\u{1F600} emoji",
    "\u{1F600}\u{1F601}",
    "\u0000",
    "\u00ff\u007f\u0080",
    "x".repeat(1),
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(63),
    "x".repeat(64),
    "x".repeat(65),
    "x".repeat(119),
    "x".repeat(120),
    "x".repeat(1000),
    "x".repeat(50000),
  ];
  for (const input of cases) {
    const expected = createHash("sha256").update(input).digest("hex");
    assert.equal(sha256Hex(input), expected, `digest differs for ${JSON.stringify(input.slice(0, 24))}`);
    assert.equal(hash24(input), expected.slice(0, 24));
  }
});

test("identityMaterial joins NUL-separated so fields cannot alias", () => {
  assert.equal(identityMaterial(["a", "b"]), "a\u0000b");
  // ["ab",""] and ["a","b"] must NOT collide into one identity.
  assert.notEqual(identityMaterial(["ab", ""]), identityMaterial(["a", "b"]));
});

test("kernel identities are unchanged by the hashing swap", () => {
  // Recomputed independently with node:crypto: if any identity moves, a live
  // row's id would stop matching its derived key after deployment.
  const h24 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

  const optionPayload = identityMaterial([
    "req_market_scan",
    "2",
    "internal",
    "internal:company_records_lookup+public_information_research:new",
  ]);
  assert.equal(
    optionIdFor({
      requirementKey: "req_market_scan",
      contractRevision: 2,
      kind: "internal",
      target: "internal:company_records_lookup+public_information_research:new",
    }),
    `opt_${h24(optionPayload)}`,
  );

  const intentMaterial = identityMaterial(["obj_1", "req_a", "3", "opt_abc"]);
  assert.equal(
    deriveIntentId({ objectiveKey: "obj_1", requirementKey: "req_a", contractRevision: 3, optionId: "opt_abc" }),
    `int_${h24(intentMaterial)}`,
  );
  assert.equal(
    deriveIdempotencyKey({ objectiveKey: "obj_1", requirementKey: "req_a", contractRevision: 3, optionId: "opt_abc" }),
    `idem_${h24(intentMaterial)}`,
  );

  const wake = planWakeForWorkerResult({
    objectiveKey: "obj_1", runId: "run_1", failed: false, spineCompleted: false, at: 1,
  });
  assert.equal(wake.eventId, `wake_wr_${h24(wake.dedupeKey)}`);

  const resourceWake = planWakeForResourceRequest({
    objectiveKey: "obj_1", runId: "run_1", resourceClass: "proprietary_data", purpose: "p", needId: "need_1", at: 1,
  });
  assert.equal(resourceWake.eventId, `wake_rr_${h24(resourceWake.dedupeKey)}`);
});

// ── Platform bundling probe ──────────────────────────────────────────────────
// Convex bundles default-platform modules with esbuild's `platform: "browser"`,
// which cannot resolve `node:crypto`. "use node" modules are exempt. This walks
// the real convex/ tree the same way the deploy bundler does.

function convexModules(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "_generated" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...convexModules(full));
    else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const esbuildBin = path.join(REPO, "node_modules", ".bin", "esbuild");

test(
  "every default-platform Convex module bundles without node:crypto",
  { skip: existsSync(esbuildBin) ? false : "esbuild not installed" },
  () => {
    const modules = convexModules(path.join(REPO, "convex"));
    assert.ok(modules.length >= 6, "expected to find the convex module tree");
    const checked: string[] = [];
    for (const file of modules) {
      const source = readFileSync(file, "utf8");
      // A module that declares "use node" runs on the Node platform, where
      // node:crypto is legitimate. Only default-platform modules are at risk.
      const usesNodePlatform = /^\s*["']use node["']/.test(source);
      const declaresFunctions = /\b(internalMutation|internalQuery|internalAction|mutation|query|action)\s*\(/.test(source);
      if (usesNodePlatform || !declaresFunctions) continue;
      checked.push(path.relative(REPO, file));
      // externalising node builtins would mask the defect, so nothing is
      // external: an unresolvable node:crypto must fail the bundle.
      assert.doesNotThrow(
        () =>
          execFileSync(
            esbuildBin,
            [file, "--bundle", "--platform=browser", "--format=esm", "--log-level=silent", "--outfile=/dev/null"],
            { cwd: REPO, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] },
          ),
        `${path.relative(REPO, file)} cannot bundle on the Convex default (browser) platform`,
      );
    }
    assert.ok(
      checked.includes(path.join("convex", "management.ts")),
      "convex/management.ts must be covered by this probe",
    );
  },
);
