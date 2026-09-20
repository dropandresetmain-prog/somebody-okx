import test from "node:test";
import assert from "node:assert/strict";
import { ensureConvexIsolateGlobals } from "../lib/management/convexIsolatePolyfill";

test("ensureConvexIsolateGlobals fills missing queueMicrotask without overriding host", () => {
  const host = function hostMicrotask(cb: () => void) {
    cb();
  };
  const withHost = { queueMicrotask: host } as typeof globalThis;
  ensureConvexIsolateGlobals(withHost);
  assert.equal(withHost.queueMicrotask, host);

  const bare = {} as typeof globalThis;
  ensureConvexIsolateGlobals(bare);
  assert.equal(typeof bare.queueMicrotask, "function");
  let ran = false;
  bare.queueMicrotask(() => {
    ran = true;
  });
  // Polyfill schedules via Promise.then — drain microtasks.
  return Promise.resolve().then(() => {
    assert.equal(ran, true);
  });
});
