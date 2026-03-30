import test from "node:test";
import assert from "node:assert/strict";
import {
  register,
  vaultLabels,
  vaultTotalValueEth,
  watcherInfo,
  vaultContractsInfo,
} from "../../src/metrics/definitions.js";

test("vaultLabels returns expected labels object", () => {
  assert.deepEqual(vaultLabels("0xabc", "vault-a", "mainnet"), {
    vault: "0xabc",
    vault_name: "vault-a",
    chain: "mainnet",
  });
});

test("register contains expected metric names", async () => {
  const metrics = await register.getMetricsAsJSON();
  const names = new Set(metrics.map((m) => m.name));

  for (const requiredName of [
    "lido_vault_total_value_eth",
    "lido_vault_health_factor",
    "lido_wq_unfinalized_requests",
    "lido_vault_contracts_info",
    "stvaults_watcher_info",
    "stvaults_watcher_poll_errors_total",
  ]) {
    assert.equal(names.has(requiredName), true, `missing metric: ${requiredName}`);
  }
});

test("key metric objects expose expected label sets", () => {
  assert.deepEqual(vaultTotalValueEth.labelNames, ["vault", "vault_name", "chain"]);
  assert.deepEqual(watcherInfo.labelNames, ["version", "chain", "explorer_url"]);
  assert.deepEqual(vaultContractsInfo.labelNames, [
    "vault_name",
    "chain",
    "vault_addr",
    "pool_addr",
    "wq_addr",
    "dashboard_addr",
  ]);
});
