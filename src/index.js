import { readFileSync } from 'fs';
import { loadConfig } from './config.js';
import { createClient } from './chain.js';
import { createMetricsServer } from './metrics/server.js';
import { watcherInfo, watcherLastPollTimestamp, watcherPollErrorsTotal, vaultContractsInfo } from './metrics/definitions.js';

const { version: WATCHER_VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
import { resolvePoolAddresses, pollVaults } from './monitors/vaultMonitor.js';
import {
  setWebhookIdentity,
  sendInactiveEthAlert,
  sendUnfinalizedRequestsAlert,
  sendHealthWarningAlert,
  sendHealthCriticalAlert,
  sendForcedRebalanceAlert,
  sendUtilizationHighAlert,
  // sendReportStaleAlert,
  sendVaultUnhealthyAlert,
} from './notifications/discord.js';
import { hasUnfinalizedRequests } from './monitors/withdrawalMonitor.js';
import { isInactiveEthAboveThreshold } from './monitors/efficiencyMonitor.js';

const MAX_UINT256 = 2n ** 256n - 1n;

function info(msg) {
  console.log(`INFO  ${msg}`);
}

function warn(vaultName, msg) {
  console.log(`WARNING ⚠️  [${vaultName}] ${msg}`);
}

function crit(vaultName, msg) {
  console.log(`ERROR 🔴 [${vaultName}] ${msg}`);
}

async function runPoll(config, client, vaultConfigs) {
  const chain = config.chain;
  try {
    const snapshots = await pollVaults(
      client,
      config,
      vaultConfigs,
      config.stEthAddress,
      config.vaultHubAddress
    );
    watcherLastPollTimestamp.set({ chain }, Date.now() / 1000);
    for (const s of snapshots) {
      const pendingWd = Number(s.unfinalizedRequests);
      const wdPart = pendingWd > 0 ? ` · 🕐 wd_pending=${pendingWd}` : '';
      info(`🔄 [${s.vault_name}] Poll OK · chain=${chain} · health=${s.healthFactorPct.toFixed(1)}% · stETH=${s.utilizationPct.toFixed(1)}%${wdPart}`);
    }

    for (const s of snapshots) {
      if (isInactiveEthAboveThreshold(s.inactiveEthWei, config.inactiveEthThresholdWei)) {
        const eth = (Number(s.inactiveEthWei) / 1e18).toFixed(4);
        warn(s.vault_name, `Inactive ETH · ${eth} ETH sitting idle (not in validators)`);
      }
      if (hasUnfinalizedRequests(s.unfinalizedRequests)) {
        const count = Number(s.unfinalizedRequests);
        const need = (Number(s.unfinalizedAssets) / 1e18).toFixed(4);
        const have = (Number(s.availableBalance) / 1e18).toFixed(4);
        const deficit = Number(s.unfinalizedAssets) / 1e18 - Number(s.availableBalance) / 1e18;
        const deficitPart = deficit > 0 ? ` · ❗ exit ${deficit.toFixed(4)} ETH from validators` : '';
        warn(s.vault_name, `Withdrawal requests pending · ${count} req · ${need} ETH needed · ${have} ETH available${deficitPart}`);
      }
      if (s.healthFactorPct < config.healthCriticalThreshold) {
        crit(s.vault_name, `Health factor critical · ${s.healthFactorPct.toFixed(1)}% (below ${config.healthCriticalThreshold}% threshold)`);
      } else if (s.healthFactorPct < config.healthWarningThreshold) {
        warn(s.vault_name, `Health factor low · ${s.healthFactorPct.toFixed(1)}% (below ${config.healthWarningThreshold}% threshold)`);
      }
      if (s.healthShortfallShares > 0n && s.healthShortfallShares !== MAX_UINT256) {
        crit(s.vault_name, `Forced rebalance required · shortfall: ${s.healthShortfallShares} shares`);
      }
      if (s.utilizationPct >= config.utilizationWarningThreshold) {
        warn(s.vault_name, `Utilization high · ${s.utilizationPct.toFixed(1)}% (above ${config.utilizationWarningThreshold}% threshold)`);
      }

      if (!s.isHealthy) {
        crit(s.vault_name, 'Vault unhealthy · check health factor and consider rebalancing');
      }

      if (config.discordWebhookUrl) {
        const cooldown = config.alertCooldownMs;
        const url = config.discordWebhookUrl;
        const discordErr = (vaultName, type) => (e) =>
          console.log(`ERROR 🔴 [${vaultName}] Discord ${type} notification failed: ${e?.message ?? e}`);

        if (isInactiveEthAboveThreshold(s.inactiveEthWei, config.inactiveEthThresholdWei)) {
          await sendInactiveEthAlert(url, cooldown, s.vault_name, s.vault, s.inactiveEthWei)
            .catch(discordErr(s.vault_name, 'inactive-eth'));
        }
        if (hasUnfinalizedRequests(s.unfinalizedRequests)) {
          await sendUnfinalizedRequestsAlert(
            url, cooldown, s.vault_name, s.vault,
            Number(s.unfinalizedRequests), s.unfinalizedAssets, s.availableBalance
          ).catch(discordErr(s.vault_name, 'unfinalized-requests'));
        }
        if (s.healthFactorPct < config.healthCriticalThreshold) {
          await sendHealthCriticalAlert(url, cooldown, s.vault_name, s.vault, s.healthFactorPct, config.healthCriticalThreshold)
            .catch(discordErr(s.vault_name, 'health-critical'));
        } else if (s.healthFactorPct < config.healthWarningThreshold) {
          await sendHealthWarningAlert(url, cooldown, s.vault_name, s.vault, s.healthFactorPct, config.healthWarningThreshold)
            .catch(discordErr(s.vault_name, 'health-warning'));
        }
        if (s.healthShortfallShares > 0n && s.healthShortfallShares !== MAX_UINT256) {
          await sendForcedRebalanceAlert(url, cooldown, s.vault_name, s.vault, s.healthShortfallShares)
            .catch(discordErr(s.vault_name, 'forced-rebalance'));
        }
        if (s.utilizationPct >= config.utilizationWarningThreshold) {
          await sendUtilizationHighAlert(url, cooldown, s.vault_name, s.vault, s.utilizationPct, config.utilizationWarningThreshold)
            .catch(discordErr(s.vault_name, 'utilization-high'));
        }
        if (!s.isHealthy) {
          await sendVaultUnhealthyAlert(url, cooldown, s.vault_name, s.vault)
            .catch(discordErr(s.vault_name, 'vault-unhealthy'));
        }
      }
    }
  } catch (err) {
    watcherPollErrorsTotal.inc({ chain: config.chain });
    throw err;
  }
}

async function main() {
  const config = loadConfig();
  info(`🚀 Starting stvaults-watcher v${WATCHER_VERSION} · chain=${config.chain} · vaults=${config.vaults.length}`);
  watcherInfo.set({ version: WATCHER_VERSION, chain: config.chain, explorer_url: config.explorerUrl }, 1);
  setWebhookIdentity({ username: config.discordUsername, avatarUrl: config.discordAvatarUrl });
  const client = createClient(config.rpcUrl, config.chainId);

  const vaultConfigs = [];
  for (const vc of config.vaults) {
    let resolved = { ...vc };
    if (vc.pool) {
      info(`📡 [${vc.vault_name}] Resolving pool addresses...`);
      const { withdrawalQueue, dashboard } = await resolvePoolAddresses(client, vc.pool, vc);
      resolved.withdrawalQueue = vc.withdrawalQueue || withdrawalQueue;
      resolved.dashboard = vc.dashboard || dashboard;
    }
    vaultConfigs.push(resolved);
    vaultContractsInfo.set({
      vault_name: resolved.vault_name,
      chain: config.chain,
      vault_addr: resolved.vault,
      pool_addr: resolved.pool || '',
      wq_addr: resolved.withdrawalQueue || '',
      dashboard_addr: resolved.dashboard || '',
    }, 1);
  }

  const metricsServer = createMetricsServer(config.metricsPort);
  info(`📊 Metrics on :${config.metricsPort} · polling every ${config.pollIntervalMs / 60_000}min`);

  let pollTimer;
  const schedule = () => {
    runPoll(config, client, vaultConfigs).catch((err) => {
      console.log(`ERROR 🔴 Poll error: ${err?.message ?? err}`);
    });
    pollTimer = setTimeout(schedule, config.pollIntervalMs);
  };
  schedule();

  const shutdown = () => {
    if (pollTimer) clearTimeout(pollTimer);
    metricsServer.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.log(`ERROR 🔴 Fatal: ${err?.message ?? err}`);
  process.exit(1);
});
