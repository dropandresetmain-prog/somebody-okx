import test from "node:test";
import assert from "node:assert/strict";
import { isLocalControlRequest } from "../lib/server/local-control";
test("local write route permits Next loopback canonicalization and rejects cross-site origins", () => {
  const request = (origin: string, url = "http://localhost:3000/api/mission") =>
    new Request(url, { headers: { origin } });
  assert.equal(isLocalControlRequest(request("http://127.0.0.1:3000")), true);
  assert.equal(isLocalControlRequest(request("http://localhost:3000")), true);
  assert.equal(
    isLocalControlRequest(request("https://attacker.invalid")),
    false,
  );
  assert.equal(isLocalControlRequest(request("http://localhost:4000")), false);
  assert.equal(isLocalControlRequest(request("null")), false);
  assert.equal(
    isLocalControlRequest(
      request("http://localhost:3000", "https://public.invalid/api/mission"),
    ),
    false,
  );
});
