import test from "node:test";
import assert from "node:assert/strict";
import { ensureConvexIsolateGlobals } from "../lib/management/convexIsolatePolyfill";

test("ensureConvexIsolateGlobals polyfills queueMicrotask only when missing", async () => {
  const calls: string[] = [];
  const fake = {
    queueMicrotask: undefined as undefined | ((cb: () => void) => void),
  };
  ensureConvexIsolateGlobals(fake as unknown as typeof globalThis);
  assert.equal(typeof fake.queueMicrotask, "function");
  await new Promise<void>((resolve) => {
    fake.queueMicrotask!(() => {
      calls.push("ran");
      resolve();
    });
  });
  assert.deepEqual(calls, ["ran"]);

  const sentinel = () => {
    throw new Error("must not replace host queueMicrotask");
  };
  const host = { queueMicrotask: sentinel };
  ensureConvexIsolateGlobals(host as unknown as typeof globalThis);
  assert.equal(host.queueMicrotask, sentinel);
});
