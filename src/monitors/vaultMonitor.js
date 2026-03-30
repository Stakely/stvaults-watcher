import {
  vaultHubAbi,
  vaultConnectionAbi,
  stakingVaultAbi,
  withdrawalQueueAbi,
  poolAbi,
  dashboardAbi,
  stEthAbi,
  pdgAbi,
} from '../abis.js';
import { computeHealthFactorPct, computeUtilizationRatioPct } from './healthMonitor.js';
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
 * @param {import('viem').PublicClient} client
 * @param {import('../config.js').Config} config
 * @param {Array<{ vault: string, pool: string, vault_name: string, withdrawalQueue: string, dashboard: string }>} vaultConfigs - with withdrawalQueue/dashboard resolved
 * @param {string} stEthAddress
 * @param {string} vaultHubAddress
 */
export async function pollVaults(client, config, vaultConfigs, stEthAddress, vaultHubAddress) {
  const chain = config.chain;
  const pdgAddress = config.pdgAddress;
  const results = [];

  for (const vc of vaultConfigs) {
    const { vault, vault_name: vaultName, withdrawalQueue, dashboard } = vc;
    const labels = vaultLabels(vault, vaultName, chain);

    try {
      // VaultHub multicall
      const [
        totalValue,
        isHealthy,
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
          functionName: 'isVaultHealthy',
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

      // VaultConnection (read real thresholds from contract)
      let forcedRebalanceThresholdBP = config.forcedRebalanceThresholdBP ?? 1000;
      let reserveRatioBP = 0;
      try {
        const conn = await client.readContract({
          address: vaultHubAddress,
          abi: vaultConnectionAbi,
          functionName: 'vaultConnection',
          args: [vault],
        });
        if (conn.forcedRebalanceThresholdBP > 0) {
          forcedRebalanceThresholdBP = conn.forcedRebalanceThresholdBP;
        }
        reserveRatioBP = conn.reserveRatioBP ?? 0;
      } catch (e) {
        console.warn(`vaultConnection read failed for ${vaultName}, using config fallback (${forcedRebalanceThresholdBP}BP):`, e?.shortMessage ?? e?.message);
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

      // Convert shares to ETH via stETH
      let liabilityEthWei = 0n;
      let mintingCapacityEthWei = 0n;
      if (stEthAddress) {
        const sharesToConvert = [];
        if (liabilityShares > 0n) sharesToConvert.push(liabilityShares);
        if (mintingCapacityShares > 0n) sharesToConvert.push(mintingCapacityShares);

        if (sharesToConvert.length > 0) {
          const results = await Promise.all(
            sharesToConvert.map((s) =>
              client.readContract({
                address: stEthAddress,
                abi: stEthAbi,
                functionName: 'getPooledEthByShares',
                args: [s],
              })
            )
          );
          let idx = 0;
          if (liabilityShares > 0n) liabilityEthWei = results[idx++];
          if (mintingCapacityShares > 0n) mintingCapacityEthWei = results[idx++];
        }
      }

      const healthFactorPct = computeHealthFactorPct(totalValue, forcedRebalanceThresholdBP, liabilityEthWei);
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
          console.warn(
            `WithdrawalQueue read failed for ${vaultName} (${withdrawalQueue}), using zeros:`,
            wqErr?.shortMessage ?? wqErr?.message ?? wqErr
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
          console.warn(
            `dashboard read failed for ${vaultName} (${dashboard}), using defaults:`,
            feeErr?.shortMessage ?? feeErr?.message ?? feeErr
          );
        }
      }

      let pdgTotalWei = 0n;
      let pdgLockedWei = 0n;
      let pdgUnlockedWei = 0n;
      let pdgPendingActivations = 0n;
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
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
          console.warn(
            `PDG read failed for ${vaultName} (${pdgAddress}), using zeros:`,
            pdgErr?.shortMessage ?? pdgErr?.message ?? pdgErr
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
      vaultHealthFactor.set(labels, healthFactorPct);
      vaultIsHealthy.set(labels, isHealthy ? 1 : 0);
      vaultHealthShortfallShares.set(labels, healthShortfallShares === MAX_UINT256 ? 0 : Number(healthShortfallShares));
      vaultUtilizationRatio.set(labels, utilizationPct);
      vaultReportFresh.set(labels, reportFresh ? 1 : 0);
      vaultForcedRebalanceThreshold.set(labels, forcedRebalanceThresholdBP / 100);
      vaultReserveRatio.set(labels, reserveRatioBP / 100);
      vaultStethLiabilityShares.set(labels, Number(liabilityShares));
      vaultStethLiabilityEth.set(labels, weiToEth(liabilityEthWei));
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
        liabilityShares,
        liabilityEthWei,
        mintingCapacityShares,
        unfinalizedRequests,
        unfinalizedAssets,
        lastRequestId,
        lastFinalizedId,
      });
    } catch (err) {
      console.error(`Poll error for vault ${vault} (${vaultName}):`, err);
      throw err;
    }
  }

  return results;
}
