import test from "node:test";
import assert from "node:assert/strict";
import { pollVaults, resolvePoolAddresses } from "../../src/monitors/vaultMonitor.js";
import { register } from "../../src/metrics/definitions.js";

const ADDR_VAULT = "0x1111111111111111111111111111111111111111";
const ADDR_POOL = "0x2222222222222222222222222222222222222222";
const ADDR_WQ = "0x3333333333333333333333333333333333333333";
const ADDR_DASH = "0x4444444444444444444444444444444444444444";
const ADDR_STETH = "0x5555555555555555555555555555555555555555";
const ADDR_HUB = "0x6666666666666666666666666666666666666666";
const ADDR_PDG = "0x7777777777777777777777777777777777777777";
const ADDR_NODE_OPERATOR = "0x8888888888888888888888888888888888888888";

test.beforeEach(() => {
  register.resetMetrics();
});

test("resolvePoolAddresses returns configured addresses without on-chain reads", async () => {
  const client = {
    async readContract() {
      throw new Error("should not be called");
    },
  };

  const result = await resolvePoolAddresses(client, ADDR_POOL, {
    withdrawalQueue: ADDR_WQ,
    dashboard: ADDR_DASH,
  });

  assert.deepEqual(result, { withdrawalQueue: ADDR_WQ, dashboard: ADDR_DASH });
});

test("resolvePoolAddresses fetches addresses from pool when missing", async () => {
  const calls = [];
  const client = {
    async readContract(req) {
      calls.push(req.functionName);
      if (req.functionName === "WITHDRAWAL_QUEUE") return ADDR_WQ;
      if (req.functionName === "DASHBOARD") return ADDR_DASH;
      throw new Error(`unexpected function: ${req.functionName}`);
    },
  };

  const result = await resolvePoolAddresses(client, ADDR_POOL, {});
  assert.deepEqual(result, { withdrawalQueue: ADDR_WQ, dashboard: ADDR_DASH });
  assert.deepEqual(calls.sort(), ["DASHBOARD", "WITHDRAWAL_QUEUE"]);
});

test("pollVaults returns snapshot and updates Prometheus metrics", async () => {
  const readContract = async (req) => {
    switch (req.functionName) {
      case "totalValue":
        return 200n * 10n ** 18n;
      case "isVaultHealthy":
        return true;
      case "healthShortfallShares":
        return 0n;
      case "liabilityShares":
        return 100n;
      case "totalMintingCapacityShares":
        return 200n;
      case "isReportFresh":
        return true;
      case "withdrawableValue":
        return 20n * 10n ** 18n;
      case "vaultConnection":
        return { forcedRebalanceThresholdBP: 1000, reserveRatioBP: 250 };
      case "availableBalance":
        return 15n * 10n ** 18n;
      case "stagedBalance":
        return 3n * 10n ** 18n;
      case "nodeOperator":
        return ADDR_NODE_OPERATOR;
      case "accruedFee":
        return 29500000000000000n;
      case "pdgPolicy":
        return 2n;
      case "getPooledEthByShares":
        return req.args[0] * 10n ** 18n;
      case "nodeOperatorBalance":
        // viem returns multiple named outputs as a plain array at runtime, not a named object
        return [5n * 10n ** 18n, 2n * 10n ** 18n];
      case "unlockedBalance":
        return 3n * 10n ** 18n;
      case "pendingActivations":
        return 4n;
      case "unfinalizedRequestsNumber":
        return 2n;
      case "unfinalizedAssets":
        return 4n * 10n ** 18n;
      case "getLastRequestId":
        return 10n;
      case "getLastFinalizedRequestId":
        return 8n;
      default:
        throw new Error(`unexpected functionName: ${req.functionName}`);
    }
  };

  const snapshots = await pollVaults(
    { readContract },
    { chain: "mainnet", forcedRebalanceThresholdBP: 900, pdgAddress: ADDR_PDG },
    [{ vault: ADDR_VAULT, pool: ADDR_POOL, vault_name: "vault-a", withdrawalQueue: ADDR_WQ, dashboard: ADDR_DASH }],
    ADDR_STETH,
    ADDR_HUB
  );

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].vault_name, "vault-a");
  assert.equal(snapshots[0].healthFactorPct, 180);
  assert.equal(snapshots[0].utilizationPct, 50);
  assert.equal(snapshots[0].unfinalizedRequests, 2n);
  assert.equal(snapshots[0].pdgTotalWei, 5n * 10n ** 18n);
  assert.equal(snapshots[0].pdgLockedWei, 2n * 10n ** 18n);
  assert.equal(snapshots[0].pdgUnlockedWei, 3n * 10n ** 18n);
  assert.equal(snapshots[0].pdgPendingActivations, 4n);
  assert.equal(snapshots[0].pdgPolicy, 2n);
  assert.equal(snapshots[0].nodeOperator, ADDR_NODE_OPERATOR);

  const metrics = await register.metrics();
  assert.match(metrics, /lido_vault_total_value_eth/);
  assert.match(metrics, /lido_vault_inactive_eth/);
  assert.match(metrics, /lido_vault_node_operator_fee_eth/);
  assert.match(metrics, /lido_vault_pdg_total_eth/);
  assert.match(metrics, /lido_vault_pdg_locked_eth/);
  assert.match(metrics, /lido_vault_pdg_unlocked_eth/);
  assert.match(metrics, /lido_vault_pdg_pending_activations/);
  assert.match(metrics, /lido_vault_pdg_policy/);
  assert.match(metrics, /lido_wq_unfinalized_requests/);
  assert.match(metrics, /vault_name="vault-a"/);
});

test("PDG metrics are not NaN when nodeOperatorBalance returns array (viem runtime format)", async () => {
  const readContract = async (req) => {
    switch (req.functionName) {
      case "totalValue": return 100n * 10n ** 18n;
      case "isVaultHealthy": return true;
      case "healthShortfallShares": return 0n;
      case "liabilityShares": return 0n;
      case "totalMintingCapacityShares": return 100n;
      case "isReportFresh": return true;
      case "withdrawableValue": return 10n * 10n ** 18n;
      case "vaultConnection": return { forcedRebalanceThresholdBP: 1000, reserveRatioBP: 0 };
      case "availableBalance": return 5n * 10n ** 18n;
      case "stagedBalance": return 1n * 10n ** 18n;
      case "nodeOperator": return ADDR_NODE_OPERATOR;
      case "accruedFee": return 0n;
      case "pdgPolicy": return 0n;
      case "getPooledEthByShares": return req.args[0];
      case "nodeOperatorBalance":
        // Simulate viem array return (must NOT use .total / .locked — would be undefined)
        return [3n * 10n ** 18n, 1n * 10n ** 18n];
      case "unlockedBalance": return 2n * 10n ** 18n;
      case "pendingActivations": return 0n;
      case "unfinalizedRequestsNumber": return 0n;
      case "unfinalizedAssets": return 0n;
      case "getLastRequestId": return 0n;
      case "getLastFinalizedRequestId": return 0n;
      default: throw new Error(`unexpected functionName: ${req.functionName}`);
    }
  };

  const snapshots = await pollVaults(
    { readContract },
    { chain: "hoodi", forcedRebalanceThresholdBP: 1000, pdgAddress: ADDR_PDG },
    [{ vault: ADDR_VAULT, vault_name: "vault-b", withdrawalQueue: ADDR_WQ, dashboard: ADDR_DASH }],
    ADDR_STETH,
    ADDR_HUB
  );

  const snap = snapshots[0];

  // Core regression: must never be NaN or undefined
  assert.ok(!Number.isNaN(Number(snap.pdgTotalWei)), "pdgTotalWei must not be NaN");
  assert.ok(!Number.isNaN(Number(snap.pdgLockedWei)), "pdgLockedWei must not be NaN");
  assert.ok(!Number.isNaN(Number(snap.pdgUnlockedWei)), "pdgUnlockedWei must not be NaN");
  assert.notEqual(snap.pdgTotalWei, undefined, "pdgTotalWei must not be undefined");
  assert.notEqual(snap.pdgLockedWei, undefined, "pdgLockedWei must not be undefined");

  assert.equal(snap.pdgTotalWei, 3n * 10n ** 18n);
  assert.equal(snap.pdgLockedWei, 1n * 10n ** 18n);
  assert.equal(snap.pdgUnlockedWei, 2n * 10n ** 18n);

  // Verify Prometheus metrics are also not NaN
  const metrics = await register.metrics();
  assert.doesNotMatch(metrics, /lido_vault_pdg_total_eth.*NaN/, "pdg_total_eth must not be NaN in Prometheus output");
  assert.doesNotMatch(metrics, /lido_vault_pdg_locked_eth.*NaN/, "pdg_locked_eth must not be NaN in Prometheus output");
});

test("PDG metrics default to zero when pdgAddress is not configured", async () => {
  const readContract = async (req) => {
    switch (req.functionName) {
      case "totalValue": return 100n * 10n ** 18n;
      case "isVaultHealthy": return true;
      case "healthShortfallShares": return 0n;
      case "liabilityShares": return 0n;
      case "totalMintingCapacityShares": return 100n;
      case "isReportFresh": return true;
      case "withdrawableValue": return 10n * 10n ** 18n;
      case "vaultConnection": return { forcedRebalanceThresholdBP: 1000, reserveRatioBP: 0 };
      case "availableBalance": return 5n * 10n ** 18n;
      case "stagedBalance": return 1n * 10n ** 18n;
      case "nodeOperator": return ADDR_NODE_OPERATOR;
      case "accruedFee": return 0n;
      case "pdgPolicy": return 0n;
      case "getPooledEthByShares": return req.args[0];
      case "unfinalizedRequestsNumber": return 0n;
      case "unfinalizedAssets": return 0n;
      case "getLastRequestId": return 0n;
      case "getLastFinalizedRequestId": return 0n;
      default: throw new Error(`unexpected functionName: ${req.functionName}`);
    }
  };

  const snapshots = await pollVaults(
    { readContract },
    { chain: "hoodi", forcedRebalanceThresholdBP: 1000, pdgAddress: null },
    [{ vault: ADDR_VAULT, vault_name: "vault-c", withdrawalQueue: ADDR_WQ, dashboard: ADDR_DASH }],
    ADDR_STETH,
    ADDR_HUB
  );

  const snap = snapshots[0];
  assert.equal(snap.pdgTotalWei, 0n);
  assert.equal(snap.pdgLockedWei, 0n);
  assert.equal(snap.pdgUnlockedWei, 0n);
  assert.equal(snap.pdgPendingActivations, 0n);
});
