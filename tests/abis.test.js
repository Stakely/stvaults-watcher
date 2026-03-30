import test from "node:test";
import assert from "node:assert/strict";
import {
  vaultHubAbi,
  vaultConnectionAbi,
  stakingVaultAbi,
  withdrawalQueueAbi,
  poolAbi,
  stEthAbi,
} from "../src/abis.js";

test("all ABI exports are non-empty arrays", () => {
  for (const abi of [vaultHubAbi, vaultConnectionAbi, stakingVaultAbi, withdrawalQueueAbi, poolAbi, stEthAbi]) {
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
});
