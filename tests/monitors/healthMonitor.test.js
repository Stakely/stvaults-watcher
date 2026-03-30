import test from "node:test";
import assert from "node:assert/strict";
import { computeHealthFactorPct, computeUtilizationRatioPct } from "../../src/monitors/healthMonitor.js";

test("computeHealthFactorPct returns Infinity when liability is zero (no minted stETH)", () => {
  const value = computeHealthFactorPct(10n * 10n ** 18n, 1000, 0n);
  assert.equal(value, Infinity);
});

test("computeHealthFactorPct computes percentage and rounds to 2 decimals", () => {
  const value = computeHealthFactorPct(200n * 10n ** 18n, 1000, 100n * 10n ** 18n);
  assert.equal(value, 180);
});

test("computeHealthFactorPct clamps negative values to zero", () => {
  const value = computeHealthFactorPct(0n, 1000, 100n * 10n ** 18n);
  assert.equal(value, 0);
});

test("computeUtilizationRatioPct returns 0 when capacity is zero", () => {
  const value = computeUtilizationRatioPct(25n, 0n);
  assert.equal(value, 0);
});

test("computeUtilizationRatioPct returns expected percentage", () => {
  const value = computeUtilizationRatioPct(25n, 100n);
  assert.equal(value, 25);
});

test("computeUtilizationRatioPct returns 100 when fully utilized", () => {
  const value = computeUtilizationRatioPct(100n, 100n);
  assert.equal(value, 100);
});
