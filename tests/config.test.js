import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

const VALID_ADDR_A = "0x1111111111111111111111111111111111111111";
const VALID_ADDR_B = "0x2222222222222222222222222222222222222222";
const ORIGINAL_ENV = process.env;

function baseEnv() {
  return {
    RPC_URL: "https://rpc.example",
    CHAIN: "mainnet",
    VAULT_CONFIGS: JSON.stringify([{ vault: VALID_ADDR_A, vault_name: "vault-a", pool: VALID_ADDR_B }]),
  };
}

function setEnv(newEnv) {
  process.env = { ...newEnv };
}

test.after(() => {
  process.env = ORIGINAL_ENV;
});

test("loadConfig parses valid minimum configuration and defaults", () => {
  setEnv(baseEnv());
  const cfg = loadConfig();

  assert.equal(cfg.rpcUrl, "https://rpc.example");
  assert.equal(cfg.chainId, 1);
  assert.equal(cfg.chain, "mainnet");
  assert.equal(cfg.metricsPort, 9600);
  assert.equal(cfg.pollIntervalMs, 60_000);
  assert.equal(cfg.alertCooldownMs, 30 * 60_000);
  assert.equal(cfg.healthWarningThreshold, 107);
  assert.equal(cfg.healthCriticalThreshold, 102);
  assert.equal(cfg.vaults.length, 1);
});

test("loadConfig throws when required env var is missing", () => {
  const env = baseEnv();
  delete env.RPC_URL;
  setEnv(env);
  assert.throws(() => loadConfig(), /Missing required env vars: RPC_URL/);
});

test("loadConfig throws when CHAIN is unsupported", () => {
  const env = baseEnv();
  env.CHAIN = "sepolia";
  setEnv(env);
  assert.throws(() => loadConfig(), /Unsupported CHAIN "sepolia"/);
});

test("loadConfig throws for invalid VAULT_CONFIGS JSON", () => {
  const env = baseEnv();
  env.VAULT_CONFIGS = "{not-json";
  setEnv(env);
  assert.throws(() => loadConfig(), /VAULT_CONFIGS must be a valid JSON array/);
});

test("loadConfig throws for empty VAULT_CONFIGS array", () => {
  const env = baseEnv();
  env.VAULT_CONFIGS = "[]";
  setEnv(env);
  assert.throws(() => loadConfig(), /VAULT_CONFIGS must be a non-empty JSON array/);
});

test("loadConfig throws for invalid vault address", () => {
  const env = baseEnv();
  env.VAULT_CONFIGS = JSON.stringify([{ vault: "0x1234", vault_name: "x" }]);
  setEnv(env);
  assert.throws(() => loadConfig(), /vault must be a valid 0x40-hex address/);
});

test("loadConfig accepts vault without pool", () => {
  const env = baseEnv();
  env.VAULT_CONFIGS = JSON.stringify([{ vault: VALID_ADDR_A, vault_name: "no-pool" }]);
  setEnv(env);
  const cfg = loadConfig();
  assert.equal(cfg.vaults[0].pool, "");
  assert.equal(cfg.vaults[0].vault_name, "no-pool");
});

test("loadConfig ignores label key and falls back to generated vault_name", () => {
  const env = baseEnv();
  env.VAULT_CONFIGS = JSON.stringify([{ vault: VALID_ADDR_A, label: "legacy-name", pool: VALID_ADDR_B }]);
  setEnv(env);
  const cfg = loadConfig();
  assert.equal(cfg.vaults[0].vault_name, "vault-0");
});

test("loadConfig picks optional overrides from env", () => {
  const env = baseEnv();
  env.POLL_INTERVAL_MIN = "2.5";
  env.METRICS_PORT = "9700";
  env.ALERT_COOLDOWN_MIN = "10";
  env.INACTIVE_ETH_THRESHOLD = "4200";
  env.HEALTH_WARNING_THRESHOLD = "130";
  env.HEALTH_CRITICAL_THRESHOLD = "110";
  env.UTILIZATION_WARNING_THRESHOLD = "96";
  env.FORCED_REBALANCE_THRESHOLD_BP = "900";
  setEnv(env);

  const cfg = loadConfig();
  assert.equal(cfg.pollIntervalMs, 150_000);
  assert.equal(cfg.metricsPort, 9700);
  assert.equal(cfg.alertCooldownMs, 600_000);
  assert.equal(cfg.inactiveEthThresholdWei, 4200n * 10n ** 18n);
  assert.equal(cfg.healthWarningThreshold, 130);
  assert.equal(cfg.healthCriticalThreshold, 110);
  assert.equal(cfg.utilizationWarningThreshold, 96);
  assert.equal(cfg.forcedRebalanceThresholdBP, 900);
});

test("loadConfig throws for empty INACTIVE_ETH_THRESHOLD", () => {
  const env = baseEnv();
  env.INACTIVE_ETH_THRESHOLD = "";
  setEnv(env);
  assert.throws(() => loadConfig(), /INACTIVE_ETH_THRESHOLD must not be empty/);
});

test("loadConfig throws for invalid INACTIVE_ETH_THRESHOLD", () => {
  const env = baseEnv();
  env.INACTIVE_ETH_THRESHOLD = "2..5";
  setEnv(env);
  assert.throws(() => loadConfig(), /INACTIVE_ETH_THRESHOLD is invalid/);
});

test("loadConfig throws for scientific notation in INACTIVE_ETH_THRESHOLD", () => {
  const env = baseEnv();
  env.INACTIVE_ETH_THRESHOLD = "32e18";
  setEnv(env);
  assert.throws(() => loadConfig(), /INACTIVE_ETH_THRESHOLD is invalid/);
});
