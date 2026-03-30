/**
 * Load and validate configuration from environment variables.
 * Network-specific constants (chainId, contract addresses) are read from
 * src/networks.json — the user only needs to set CHAIN=mainnet|hoodi.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const NETWORKS = require('./networks.json');

const SUPPORTED_CHAINS = Object.keys(NETWORKS);

const requiredEnvVars = [
  'RPC_URL',
  'CHAIN',
  'VAULT_CONFIGS',
];

const optionalEnvVars = {
  POLL_INTERVAL_MIN: 1,
  METRICS_PORT: 9600,
  ALERT_COOLDOWN_MIN: 30,
  DISCORD_USERNAME: 'stvaults-watcher',
  DISCORD_AVATAR_URL: 'https://img.lightshot.app/LsNhkD8gRZaPcHK8lJqnWQ.png',
  // Default inactive ETH threshold (in ETH).
  // Note: on-chain comparisons operate in wei, so we convert this when loading config.
  INACTIVE_ETH_THRESHOLD: 2,
  HEALTH_WARNING_THRESHOLD: 107,
  HEALTH_CRITICAL_THRESHOLD: 102,
  UTILIZATION_WARNING_THRESHOLD: 95,
  FORCED_REBALANCE_THRESHOLD_BP: 1000, // 10%, used for health factor calculation if vaultConnection not read
};

/**
 * Parse a human ETH amount (e.g. "32", "32.5") into wei (1e18 fixed-point).
 * This is used for `INACTIVE_ETH_THRESHOLD` so operators can work in ETH.
 * @param {string} raw
 * @returns {bigint}
 */
function parseEthToWeiBigInt(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('empty');
  if (/[eE]/.test(s)) throw new Error('scientific notation is not supported');
  if (s.startsWith('-')) throw new Error('negative not supported');

  // Integer ETH
  if (/^\d+$/.test(s)) {
    return BigInt(s) * 10n ** 18n;
  }

  // Decimal ETH with up to 18 decimals
  const m = s.match(/^(\d+)?\.(\d+)$/);
  if (!m) throw new Error('invalid eth format');

  const intPart = m[1] ? BigInt(m[1]) : 0n;
  const fracRaw = m[2];
  if (fracRaw.length > 18) throw new Error('too many decimals');
  const fracPadded = fracRaw.padEnd(18, '0');

  return intPart * 10n ** 18n + BigInt(fracPadded);
}

/**
 * @typedef {Object} VaultConfig
 * @property {string} vault - Vault contract address
 * @property {string} [pool] - Pool (DeFi Wrapper) address. Optional; vaults without pool skip WQ/dashboard discovery.
 * @property {string} vault_name - Human-readable vault id for metrics and alerts
 * @property {string} [withdrawalQueue] - Optional, auto-discovered from pool if empty
 * @property {string} [dashboard] - Optional, auto-discovered from pool if empty
 */

/**
 * @typedef {Object} Config
 * @property {string} rpcUrl
 * @property {number} chainId
 * @property {string} chain - Chain name for metrics (e.g. mainnet, hoodi)
 * @property {string} explorerUrl - Block explorer base URL for this chain
 * @property {VaultConfig[]} vaults
 * @property {string} vaultHubAddress
 * @property {string} stEthAddress
 * @property {string} pdgAddress - PredepositGuarantee contract address
 * @property {number} pollIntervalMs
 * @property {number} metricsPort
 * @property {string} [discordWebhookUrl]
 * @property {number} alertCooldownMs
 * @property {bigint} inactiveEthThresholdWei
 * @property {number} healthWarningThreshold
 * @property {number} healthCriticalThreshold
 * @property {number} utilizationWarningThreshold
 */

/**
 * Parse VAULT_CONFIGS JSON array and validate each entry.
 * @param {string} raw
 * @returns {VaultConfig[]}
 */
function parseVaultConfigs(raw) {
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    throw new Error(`VAULT_CONFIGS must be a valid JSON array: ${e.message}`);
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('VAULT_CONFIGS must be a non-empty JSON array');
  }
  const vaults = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!v || typeof v !== 'object') {
      throw new Error(`VAULT_CONFIGS[${i}] must be an object`);
    }
    const vault = String(v.vault ?? '').trim();
    const pool = String(v.pool ?? '').trim();
    const vaultName = String(v.vault_name ?? `vault-${i}`).trim() || `vault-${i}`;
    if (!vault) {
      throw new Error(`VAULT_CONFIGS[${i}] must have a "vault" address`);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(vault)) {
      throw new Error(`VAULT_CONFIGS[${i}] vault must be a valid 0x40-hex address`);
    }
    if (pool && !/^0x[a-fA-F0-9]{40}$/.test(pool)) {
      throw new Error(`VAULT_CONFIGS[${i}] pool must be a valid 0x40-hex address`);
    }
    const withdrawalQueue = String(v.withdrawalQueue ?? '').trim();
    const dashboard = String(v.dashboard ?? '').trim();
    if (withdrawalQueue && !/^0x[a-fA-F0-9]{40}$/.test(withdrawalQueue)) {
      throw new Error(`VAULT_CONFIGS[${i}] withdrawalQueue must be a valid 0x40-hex address`);
    }
    if (dashboard && !/^0x[a-fA-F0-9]{40}$/.test(dashboard)) {
      throw new Error(`VAULT_CONFIGS[${i}] dashboard must be a valid 0x40-hex address`);
    }
    vaults.push({
      vault,
      pool,
      vault_name: vaultName,
      withdrawalQueue,
      dashboard,
    });
  }
  return vaults;
}

/**
 * @returns {Config}
 */
export function loadConfig() {
  const missing = requiredEnvVars.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const chain = process.env.CHAIN.trim();
  const network = NETWORKS[chain];
  if (!network) {
    throw new Error(
      `Unsupported CHAIN "${chain}". Supported values: ${SUPPORTED_CHAINS.join(', ')}`
    );
  }

  const { chainId, explorerUrl, contracts } = network;

  const vaults = parseVaultConfigs(process.env.VAULT_CONFIGS);

  const pollIntervalMin = parseFloat(process.env.POLL_INTERVAL_MIN) || optionalEnvVars.POLL_INTERVAL_MIN;
  const pollIntervalMs = Math.round(pollIntervalMin * 60_000);
  const metricsPort = parseInt(process.env.METRICS_PORT, 10) || optionalEnvVars.METRICS_PORT;
  const alertCooldownMin = parseFloat(process.env.ALERT_COOLDOWN_MIN) || optionalEnvVars.ALERT_COOLDOWN_MIN;
  const alertCooldownMs = Math.round(alertCooldownMin * 60_000);
  const healthWarningThreshold = parseInt(process.env.HEALTH_WARNING_THRESHOLD, 10) || optionalEnvVars.HEALTH_WARNING_THRESHOLD;
  const healthCriticalThreshold = parseInt(process.env.HEALTH_CRITICAL_THRESHOLD, 10) || optionalEnvVars.HEALTH_CRITICAL_THRESHOLD;
  const utilizationWarningThreshold = parseInt(process.env.UTILIZATION_WARNING_THRESHOLD, 10) || optionalEnvVars.UTILIZATION_WARNING_THRESHOLD;

  let inactiveEthThresholdWei = parseEthToWeiBigInt(optionalEnvVars.INACTIVE_ETH_THRESHOLD);

  if ('INACTIVE_ETH_THRESHOLD' in process.env) {
    const raw = (process.env.INACTIVE_ETH_THRESHOLD ?? '').trim();
    if (!raw) throw new Error('INACTIVE_ETH_THRESHOLD must not be empty');
    try {
      inactiveEthThresholdWei = parseEthToWeiBigInt(raw);
    } catch (e) {
      throw new Error(`INACTIVE_ETH_THRESHOLD is invalid: ${e.message}`);
    }
  }

  const forcedRebalanceThresholdBP =
    parseInt(process.env.FORCED_REBALANCE_THRESHOLD_BP, 10) || optionalEnvVars.FORCED_REBALANCE_THRESHOLD_BP;

  const discordUsername = process.env.DISCORD_USERNAME?.trim() || optionalEnvVars.DISCORD_USERNAME;
  const discordAvatarUrl = process.env.DISCORD_AVATAR_URL?.trim() || optionalEnvVars.DISCORD_AVATAR_URL;

  return {
    rpcUrl: process.env.RPC_URL.trim(),
    chainId,
    chain,
    explorerUrl,
    vaults,
    vaultHubAddress: contracts.vaultHub,
    stEthAddress: contracts.stEth,
    pdgAddress: contracts.pdg,
    pollIntervalMs,
    metricsPort,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL?.trim() || undefined,
    discordUsername,
    discordAvatarUrl,
    alertCooldownMs,
    inactiveEthThresholdWei,
    healthWarningThreshold,
    healthCriticalThreshold,
    utilizationWarningThreshold,
    forcedRebalanceThresholdBP,
  };
}
