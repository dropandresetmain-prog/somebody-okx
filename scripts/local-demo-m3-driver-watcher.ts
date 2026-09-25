/**
 * LOCAL testnet_demo: polls Convex for BUY intents that need the M4×M3 driver
 * and advances them (prepare → preview → confirm → execute → observe).
 *
 * Run alongside `convex dev`, `next dev`, and `npm run m3:seller`.
 *
 *   npm run m3:local-demo-driver
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../convex/_generated/api.js";
import { createM3DriverConvexBridge } from "../lib/payment/m3DriverConvexBridge.js";
import {
  advanceLocalDemoM3Intent,
  localDemoM3DriverEnabled,
} from "../lib/payment/localDemoM3DriverAdvance.js";

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLL_MS = 2_000;
const IDLE_LOG_EVERY_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!localDemoM3DriverEnabled()) {
    console.error(
      "local demo M3 driver watcher refused to start: set SOMEBODY_EXECUTION_MODE=testnet_demo, M4_M3_EXECUTION_ENABLED=true, CONVEX_URL, M4_M3_DRIVER_TOKEN, and M4_M3_FACT_ATTESTATION_KEY in .env.local",
    );
    process.exitCode = 1;
    return;
  }

  const bridge = createM3DriverConvexBridge(applicationRoot);
  let lastIdleLog = 0;

  console.log(
    JSON.stringify({
      event: "local_demo_m3_driver_watcher_started",
      pollMs: POLL_MS,
      at: new Date().toISOString(),
    }),
  );

  for (;;) {
    try {
      const candidate = await bridge.client.query(api.m3Driver.localDemoDriverCandidate, {
        driverToken: bridge.driverToken,
      });
      if (!candidate) {
        const now = Date.now();
        if (now - lastIdleLog >= IDLE_LOG_EVERY_MS) {
          console.log(JSON.stringify({ event: "idle", at: new Date().toISOString() }));
          lastIdleLog = now;
        }
        await sleep(POLL_MS);
        continue;
      }

      const result = await advanceLocalDemoM3Intent(candidate.intentId, applicationRoot, bridge);
      console.log(
        JSON.stringify({
          event: "advance",
          candidate,
          result,
          at: new Date().toISOString(),
        }),
      );
      if (!result.changed && !result.done) {
        await sleep(POLL_MS);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: "error", message, at: new Date().toISOString() }));
      await sleep(POLL_MS * 2);
    }
  }
}

void main();
