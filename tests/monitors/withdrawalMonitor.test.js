import test from "node:test";
import assert from "node:assert/strict";
import { hasUnfinalizedRequests } from "../../src/monitors/withdrawalMonitor.js";

test("hasUnfinalizedRequests returns false for zero", () => {
  assert.equal(hasUnfinalizedRequests(0n), false);
});

test("hasUnfinalizedRequests returns true for positive values", () => {
  assert.equal(hasUnfinalizedRequests(1n), true);
  assert.equal(hasUnfinalizedRequests(999999999n), true);
});
