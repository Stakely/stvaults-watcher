import test from "node:test";
import assert from "node:assert/strict";
import { calculateHealth, computeUtilizationRatioPct } from "../../src/monitors/healthMonitor.js";

test("calculateHealth returns Infinity ratio and healthy=true when liability is zero", () => {
  const result = calculateHealth({
    totalValue: 10n * 10n ** 18n,
    liabilityStethWei: 0n,
    forcedRebalanceThresholdBP: 1000,
  });
  assert.equal(result.healthRatio, Infinity);
  assert.equal(result.healthRatio18, 0n);
  assert.equal(result.isHealthy, true);
});

test("calculateHealth computes the same ratio as lido-cli (BigInt precision)", () => {
  // totalValue=200 ETH, FRT=10%, liability=100 ETH → HF = 200·(1−0.10) / 100 = 180%
  const result = calculateHealth({
    totalValue: 200n * 10n ** 18n,
    liabilityStethWei: 100n * 10n ** 18n,
    forcedRebalanceThresholdBP: 1000,
  });
  assert.equal(result.healthRatio, 180);
  assert.equal(result.healthRatio18, 180n * 10n ** 18n);
  assert.equal(result.isHealthy, true);
});

test("calculateHealth returns 0 ratio and healthy=false when totalValue is zero", () => {
  const result = calculateHealth({
    totalValue: 0n,
    liabilityStethWei: 100n * 10n ** 18n,
    forcedRebalanceThresholdBP: 1000,
  });
  assert.equal(result.healthRatio, 0);
  assert.equal(result.healthRatio18, 0n);
  assert.equal(result.isHealthy, false);
});

test("calculateHealth marks isHealthy=false right below 100%", () => {
  // liability = totalValue · (1 − FRT) · 1.001  → ratio ≈ 99.9%
  const totalValue = 100n * 10n ** 18n;
  const liability = (100n * 9000n * 1001n * 10n ** 18n) / (10000n * 1000n);
  const result = calculateHealth({
    totalValue,
    liabilityStethWei: liability,
    forcedRebalanceThresholdBP: 1000,
  });
  assert.ok(result.healthRatio < 100, `expected < 100, got ${result.healthRatio}`);
  assert.equal(result.isHealthy, false);
});

test("calculateHealth keeps full precision for very large values (no Number() truncation)", () => {
  // 1_000_000 ETH vault with 333_333 ETH liability — Number(wei) would lose precision.
  // BigInt math should still produce a stable, deterministic ratio.
  const totalValue = 1_000_000n * 10n ** 18n;
  const liability = 333_333n * 10n ** 18n;
  const result = calculateHealth({
    totalValue,
    liabilityStethWei: liability,
    forcedRebalanceThresholdBP: 1000,
  });
  // Expected exact: (1_000_000 · 0.9 · 100) / 333_333 = 270.00027000...
  // healthRatio18 must be deterministic regardless of float widening.
  const expected18 = (totalValue * 9000n * 10n ** 18n * 100n) / (10000n * liability);
  assert.equal(result.healthRatio18, expected18);
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
