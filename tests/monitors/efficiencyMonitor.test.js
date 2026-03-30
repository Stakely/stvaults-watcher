import test from "node:test";
import assert from "node:assert/strict";
import { computeInactiveEthWei, isInactiveEthAboveThreshold } from "../../src/monitors/efficiencyMonitor.js";

test("computeInactiveEthWei returns difference when available exceeds staged", () => {
  assert.equal(computeInactiveEthWei(10n, 4n), 6n);
});

test("computeInactiveEthWei returns zero when available is lower", () => {
  assert.equal(computeInactiveEthWei(4n, 10n), 0n);
});

test("computeInactiveEthWei returns zero when values are equal", () => {
  assert.equal(computeInactiveEthWei(10n, 10n), 0n);
});

test("isInactiveEthAboveThreshold returns true only when strictly above threshold", () => {
  assert.equal(isInactiveEthAboveThreshold(11n, 10n), true);
  assert.equal(isInactiveEthAboveThreshold(10n, 10n), false);
  assert.equal(isInactiveEthAboveThreshold(9n, 10n), false);
});
