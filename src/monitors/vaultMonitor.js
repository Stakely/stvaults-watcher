import {
  vaultHubAbi,
  vaultConnectionAbi,
  stakingVaultAbi,
  withdrawalQueueAbi,
  poolAbi,
  dashboardAbi,
  stEthAbi,
  pdgAbi,
  lazyOracleAbi,
} from '../abis.js';
import { calculateHealth, computeUtilizationRatioPct } from './healthMonitor.js';
import { computeInactiveEthWei } from './efficiencyMonitor.js';
import {
  vaultTotalValueEth,
  vaultAvailableBalanceEth,
  vaultStagedBalanceEth,
  vaultInactiveEth,
  vaultWithdrawableValueEth,
  vaultNodeOperatorFeeEth,
  vaultPdgTotalEth,
  vaultPdgLockedEth,
  vaultPdgUnlockedEth,
  vaultPdgPendingActivations,
  vaultPdgPolicy,
  vaultHealthFactor,
  vaultIsHealthy,
  vaultHealthShortfallShares,
  vaultUtilizationRatio,
  vaultReportFresh,
  vaultDisconnected,
  vaultQuarantineActive,
  vaultQuarantinePendingValueEth,
  vaultQuarantineEndTimestamp,
  vaultForcedRebalanceThreshold,
  vaultReserveRatio,
  vaultStethLiabilityShares,
  vaultStethLiabilityEth,
  vaultMintingCapacityShares,
  vaultMintingCapacityEth,
  wqUnfinalizedRequests,
  wqUnfinalizedAssetsEth,
  wqLastRequestId,
  wqLastFinalizedId,
  vaultLabels,
} from '../metrics/definitions.js';

const WEI_PER_ETH = 1e18;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function weiToEth(wei) {
  return Number(wei) / WEI_PER_ETH;
}

const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Resolve withdrawalQueue and dashboard from pool if not set.
 * @param {import('viem').PublicClient} client
 * @param {string} poolAddress
 * @param {{ vault: string, pool: string, vault_name: string, withdrawalQueue: string, dashboard: string }} vaultConfig
 * @returns {Promise<{ withdrawalQueue: string, dashboard: string }>}
 */
export async function resolvePoolAddresses(client, poolAddress, vaultConfig) {
  if (vaultConfig.withdrawalQueue && vaultConfig.dashboard) {
    return { withdrawalQueue: vaultConfig.withdrawalQueue, dashboard: vaultConfig.dashboard };
  }
  const [wq, dash] = await Promise.all([
    client.readContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: 'WITHDRAWAL_QUEUE',
    }),
    client.readContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: 'DASHBOARD',
    }),
  ]);
  return { withdrawalQueue: wq, dashboard: dash };
}

/**
 * Fetch all vault data and update metrics. Returns snapshot per vault for alerting.
 *
 * Health factor matches `lido-staking-vault-cli vo r health`: uses
 * `getPooledEthBySharesRoundUp` for the liability and computes the ratio in
 * BigInt with 1e18 precision via `calculateHealth`. `isHealthy` is derived
 * from `healthRatio >= 100` instead of `VaultHub.isVaultHealthy()`.
 *
 * @param {import('viem').PublicClient} client
 * @param {import('../config.js').Config} config
 * @param {Array<{ vault: string, pool: string, vault_name: string, withdrawalQueue: string, dashboard: string }>} vaultConfigs - with withdrawalQueue/dashboard resolved
 * @param {string} stEthAddress
 * @param {string} vaultHubAddress
 */
export async function pollVaults(client, config, vaultConfigs, stEthAddress, vaultHubAddress) {
  const chain = config.chain;
  const pdgAddress = config.pdgAddress;
  const lazyOracleAddress = config.lazyOracleAddress;
  const results = [];

  for (const vc of vaultConfigs) {
    const { vault, vault_name: vaultName, withdrawalQueue, dashboard } = vc;
    const labels = vaultLabels(vault, vaultName, chain);

    try {
      // VaultHub multicall (no isVaultHealthy: derived from the formula below)
      const [
        totalValue,
        healthShortfallShares,
        liabilityShares,
        mintingCapacityShares,
        reportFresh,
        withdrawableValue,
      ] = await Promise.all([
        client.readContract({
          address: vaultHubAddress,
          abi: vaultHubAbi,
          functionName: 'totalValue',
          args: [vault],
        }),
        client.readContract({
          address: vaultHubAddress,
          abi: vaultHubAbi,
          functionName: 'healthShortfallShares',
          args: [vault],
        }),
        client.readContract({
          address: vaultHubAddress,
          abi: vaultHubAbi,
          functionName: 'liabilityShares',
          args: [vault],
        }),
        client.readContract({
          address: vaultHubAddress,
          abi: vaultHubAbi,
          functionName: 'totalMintingCapacityShares',
          args: [vault, 0n],
        }),
        client.readContract({
          address: vaultHubAddress,
          abi: vaultHubAbi,
          functionName: 'isReportFresh',
          args: [vault],
        }),
        client.readContract({
          address: vaultHubAddress,
          abi: vaultHubAbi,
          functionName: 'withdrawableValue',
          args: [vault],
        }),
      ]);

      // VaultConnection (real thresholds + disconnected detection)
      let forcedRebalanceThresholdBP = config.forcedRebalanceThresholdBP ?? 1000;
      let reserveRatioBP = 0;
      let disconnected = false;
      try {
        const conn = await client.readContract({
          address: vaultHubAddress,
          abi: vaultConnectionAbi,
          functionName: 'vaultConnection',
          args: [vault],
        });
        disconnected = conn.owner === ZERO_ADDRESS || conn.vaultIndex === 0n;
        if (conn.forcedRebalanceThresholdBP > 0) {
          forcedRebalanceThresholdBP = conn.forcedRebalanceThresholdBP;
        }
        reserveRatioBP = conn.reserveRatioBP ?? 0;
      } catch (e) {
        console.log(`WARN  vaultConnection read failed for ${vaultName}, using config fallback (${forcedRebalanceThresholdBP}BP): ${e?.shortMessage ?? e?.message ?? e}`);
      }

      // StakingVault
      const [availableBalance, stagedBalance, nodeOperator] = await Promise.all([
        client.readContract({
          address: vault,
          abi: stakingVaultAbi,
          functionName: 'availableBalance',
        }),
        client.readContract({
          address: vault,
          abi: stakingVaultAbi,
          functionName: 'stagedBalance',
        }),
        client.readContract({
          address: vault,
          abi: stakingVaultAbi,
          functionName: 'nodeOperator',
        }),
      ]);

      // Shares → stETH conversion. Liability uses RoundUp to match lido-cli's
      // calculateHealth input (conservative: liability looks 1 wei bigger,
      // HF slightly lower). Minting capacity stays on the regular method.
      let liabilityStethWei = 0n;
      let mintingCapacityEthWei = 0n;
      if (stEthAddress) {
        const calls = [];
        if (liabilityShares > 0n) {
          calls.push({
            kind: 'liability',
            promise: client.readContract({
              address: stEthAddress,
              abi: stEthAbi,
              functionName: 'getPooledEthBySharesRoundUp',
              args: [liabilityShares],
            }),
          });
        }
        if (mintingCapacityShares > 0n) {
          calls.push({
            kind: 'capacity',
            promise: client.readContract({
              address: stEthAddress,
              abi: stEthAbi,
              functionName: 'getPooledEthByShares',
              args: [mintingCapacityShares],
            }),
          });
        }
        if (calls.length > 0) {
          const settled = await Promise.all(calls.map((c) => c.promise));
          for (let i = 0; i < calls.length; i++) {
            if (calls[i].kind === 'liability') liabilityStethWei = settled[i];
            else mintingCapacityEthWei = settled[i];
          }
        }
      }

      // Health (lido-cli parity) and utilization
      const { healthRatio, isHealthy } = calculateHealth({
        totalValue,
        liabilityStethWei,
        forcedRebalanceThresholdBP,
      });
      const healthFactorPct = Number.isFinite(healthRatio)
        ? Math.round(healthRatio * 100) / 100
        : healthRatio;
      const utilizationPct = computeUtilizationRatioPct(liabilityShares, mintingCapacityShares);
      const inactiveEthWei = computeInactiveEthWei(availableBalance, stagedBalance);

      // Withdrawal queue (only if we have address). May revert when queue is empty/never used.
      let unfinalizedRequests = 0n;
      let unfinalizedAssets = 0n;
      let lastRequestId = 0n;
      let lastFinalizedId = 0n;
      if (withdrawalQueue) {
        try {
          [unfinalizedRequests, unfinalizedAssets, lastRequestId, lastFinalizedId] = await Promise.all([
            client.readContract({
              address: withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: 'unfinalizedRequestsNumber',
            }),
            client.readContract({
              address: withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: 'unfinalizedAssets',
            }),
            client.readContract({
              address: withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: 'getLastRequestId',
            }),
            client.readContract({
              address: withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: 'getLastFinalizedRequestId',
            }),
          ]);
        } catch (wqErr) {
          // Contract can revert when queue has no requests or different interface; use zeros
          console.log(
            `WARN  WithdrawalQueue read failed for ${vaultName} (${withdrawalQueue}), using zeros: ${wqErr?.shortMessage ?? wqErr?.message ?? wqErr}`
          );
        }
      }

      let nodeOperatorFeeWei = 0n;
      let pdgPolicy = 0;
      if (dashboard) {
        try {
          [nodeOperatorFeeWei, pdgPolicy] = await Promise.all([
            client.readContract({
              address: dashboard,
              abi: dashboardAbi,
              functionName: 'accruedFee',
            }),
            client.readContract({
              address: dashboard,
              abi: dashboardAbi,
              functionName: 'pdgPolicy',
            }),
          ]);
        } catch (feeErr) {
          console.log(
            `WARN  dashboard read failed for ${vaultName} (${dashboard}), using defaults: ${feeErr?.shortMessage ?? feeErr?.message ?? feeErr}`
          );
        }
      }

      let pdgTotalWei = 0n;
      let pdgLockedWei = 0n;
      let pdgUnlockedWei = 0n;
      let pdgPendingActivations = 0n;
      if (nodeOperator === ZERO_ADDRESS) {
        console.log(`WARN  PDG reads skipped for ${vaultName}: nodeOperator() returned zero address`);
      } else if (pdgAddress) {
        try {
          const [nodeOperatorBalance, unlockedBalance, pendingActivations] = await Promise.all([
            client.readContract({
              address: pdgAddress,
              abi: pdgAbi,
              functionName: 'nodeOperatorBalance',
              args: [nodeOperator],
            }),
            client.readContract({
              address: pdgAddress,
              abi: pdgAbi,
              functionName: 'unlockedBalance',
              args: [nodeOperator],
            }),
            client.readContract({
              address: pdgAddress,
              abi: pdgAbi,
              functionName: 'pendingActivations',
              args: [vault],
            }),
          ]);

          [pdgTotalWei, pdgLockedWei] = nodeOperatorBalance;
          pdgUnlockedWei = unlockedBalance;
          pdgPendingActivations = pendingActivations;
        } catch (pdgErr) {
          console.log(
            `WARN  PDG read failed for ${vaultName} (${pdgAddress}), using zeros: ${pdgErr?.shortMessage ?? pdgErr?.message ?? pdgErr}`
          );
        }
      }

      // Quarantine (LazyOracle). Warns when part of CL capital is frozen.
      let quarantineIsActive = false;
      let quarantinePendingValueWei = 0n;
      let quarantineEndTimestamp = 0n;
      if (lazyOracleAddress) {
        try {
          const q = await client.readContract({
            address: lazyOracleAddress,
            abi: lazyOracleAbi,
            functionName: 'vaultQuarantine',
            args: [vault],
          });
          quarantineIsActive = Boolean(q.isActive);
          quarantinePendingValueWei = q.pendingTotalValueIncrease ?? 0n;
          quarantineEndTimestamp = q.endTimestamp ?? 0n;
        } catch (qErr) {
          console.log(
            `WARN  LazyOracle quarantine read failed for ${vaultName} (${lazyOracleAddress}): ${qErr?.shortMessage ?? qErr?.message ?? qErr}`
          );
        }
      }

      // Update metrics (ETH values for human readability)
      vaultTotalValueEth.set(labels, weiToEth(totalValue));
      vaultAvailableBalanceEth.set(labels, weiToEth(availableBalance));
      vaultStagedBalanceEth.set(labels, weiToEth(stagedBalance));
      vaultInactiveEth.set(labels, weiToEth(inactiveEthWei));
      vaultWithdrawableValueEth.set(labels, weiToEth(withdrawableValue));
      vaultNodeOperatorFeeEth.set(labels, weiToEth(nodeOperatorFeeWei));
      vaultPdgTotalEth.set(labels, weiToEth(pdgTotalWei));
      vaultPdgLockedEth.set(labels, weiToEth(pdgLockedWei));
      vaultPdgUnlockedEth.set(labels, weiToEth(pdgUnlockedWei));
      vaultPdgPendingActivations.set(labels, Number(pdgPendingActivations));
      vaultPdgPolicy.set(labels, Number(pdgPolicy));
      // Pass Infinity through unchanged: prom-client emits "+Inf" for vaults with no
      // minted stETH, which the dashboard handles via clamp_max(..., 9999) and an "∞"
      // value mapping. Coercing to 0 here would flip a healthy vault into red.
      vaultHealthFactor.set(labels, healthFactorPct);
      vaultIsHealthy.set(labels, isHealthy ? 1 : 0);
      vaultHealthShortfallShares.set(labels, healthShortfallShares === MAX_UINT256 ? 0 : Number(healthShortfallShares));
      vaultUtilizationRatio.set(labels, utilizationPct);
      vaultReportFresh.set(labels, reportFresh ? 1 : 0);
      vaultDisconnected.set(labels, disconnected ? 1 : 0);
      vaultQuarantineActive.set(labels, quarantineIsActive ? 1 : 0);
      vaultQuarantinePendingValueEth.set(labels, weiToEth(quarantinePendingValueWei));
      vaultQuarantineEndTimestamp.set(labels, Number(quarantineEndTimestamp));
      vaultForcedRebalanceThreshold.set(labels, forcedRebalanceThresholdBP / 100);
      vaultReserveRatio.set(labels, reserveRatioBP / 100);
      vaultStethLiabilityShares.set(labels, Number(liabilityShares));
      vaultStethLiabilityEth.set(labels, weiToEth(liabilityStethWei));
      vaultMintingCapacityShares.set(labels, Number(mintingCapacityShares));
      vaultMintingCapacityEth.set(labels, weiToEth(mintingCapacityEthWei));
      wqUnfinalizedRequests.set(labels, Number(unfinalizedRequests));
      wqUnfinalizedAssetsEth.set(labels, weiToEth(unfinalizedAssets));
      wqLastRequestId.set(labels, Number(lastRequestId));
      wqLastFinalizedId.set(labels, Number(lastFinalizedId));

      results.push({
        vault,
        vault_name: vaultName,
        chain,
        totalValue,
        availableBalance,
        stagedBalance,
        inactiveEthWei,
        withdrawableValue,
        nodeOperatorFeeWei,
        nodeOperator,
        pdgTotalWei,
        pdgLockedWei,
        pdgUnlockedWei,
        pdgPendingActivations,
        pdgPolicy,
        isHealthy,
        healthShortfallShares,
        healthFactorPct,
        utilizationPct,
        reportFresh,
        disconnected,
        quarantineIsActive,
        quarantinePendingValueWei,
        quarantineEndTimestamp,
        liabilityShares,
        liabilityStethWei,
        mintingCapacityShares,
        unfinalizedRequests,
        unfinalizedAssets,
        lastRequestId,
        lastFinalizedId,
      });
    } catch (err) {
      console.log(`ERROR Poll error for vault ${vault} (${vaultName}): ${err?.message ?? err}`);
      throw err;
    }
  }

  return results;
}
