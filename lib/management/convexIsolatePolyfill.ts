// Convex's default-platform isolate is not full Node/browser. LangGraph Pregel
// calls `queueMicrotask` when a management pass invokes; without this polyfill
// every `runManagementPass` dies before the first node runs.
//
// Import this module for its side effect before `@langchain/langgraph` loads.
// Only fills missing globals — never overrides a host implementation.

export function ensureConvexIsolateGlobals(
  globalObject: typeof globalThis = globalThis,
): void {
  if (typeof globalObject.queueMicrotask !== "function") {
    globalObject.queueMicrotask = (callback: () => void) => {
      void Promise.resolve().then(callback);
    };
  }
}

ensureConvexIsolateGlobals();
