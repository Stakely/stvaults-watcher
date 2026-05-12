import test from "node:test";
import assert from "node:assert/strict";
import {
  vaultHubAbi,
  vaultConnectionAbi,
  stakingVaultAbi,
  withdrawalQueueAbi,
  poolAbi,
  stEthAbi,
  lazyOracleAbi,
} from "../src/abis.js";

test("all ABI exports are non-empty arrays", () => {
  for (const abi of [vaultHubAbi, vaultConnectionAbi, stakingVaultAbi, withdrawalQueueAbi, poolAbi, stEthAbi, lazyOracleAbi]) {
    assert.equal(Array.isArray(abi), true);
    assert.equal(abi.length > 0, true);
  }
});

test("vaultConnectionAbi contains tuple output with expected fields", () => {
  const item = vaultConnectionAbi[0];
  assert.equal(item.name, "vaultConnection");
  assert.equal(item.outputs[0].type, "tuple");
  assert.equal(item.outputs[0].components.some((c) => c.name === "forcedRebalanceThresholdBP"), true);
  assert.equal(item.outputs[0].components.some((c) => c.name === "reserveRatioBP"), true);
  assert.equal(item.outputs[0].components.some((c) => c.name === "owner"), true);
  assert.equal(item.outputs[0].components.some((c) => c.name === "vaultIndex"), true);
});

test("stEthAbi exposes both getPooledEthByShares and getPooledEthBySharesRoundUp", () => {
  const names = stEthAbi.map((e) => e.name);
  assert.ok(names.includes("getPooledEthByShares"), "expected getPooledEthByShares");
  assert.ok(names.includes("getPooledEthBySharesRoundUp"), "expected getPooledEthBySharesRoundUp");
});

test("lazyOracleAbi exposes vaultQuarantine with named tuple output", () => {
  const item = lazyOracleAbi[0];
  assert.equal(item.name, "vaultQuarantine");
  assert.equal(item.outputs[0].type, "tuple");
  const fields = item.outputs[0].components.map((c) => c.name);
  for (const f of ["isActive", "pendingTotalValueIncrease", "startTimestamp", "endTimestamp", "totalValueRemainder"]) {
    assert.ok(fields.includes(f), `expected component ${f} in vaultQuarantine output`);
  }
});
