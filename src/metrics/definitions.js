import { Registry, Gauge, Counter } from 'prom-client';

const defaultLabels = ['vault', 'vault_name', 'chain'];

export const register = new Registry();

// Vault - general state (values in ETH)
export const vaultTotalValueEth = new Gauge({
  name: 'lido_vault_total_value_eth',
  help: 'Total value of the vault in ETH',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultAvailableBalanceEth = new Gauge({
  name: 'lido_vault_available_balance_eth',
  help: 'ETH available in vault buffer',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultStagedBalanceEth = new Gauge({
  name: 'lido_vault_staged_balance_eth',
  help: 'ETH staged for validators',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultInactiveEth = new Gauge({
  name: 'lido_vault_inactive_eth',
  help: 'Inefficient ETH not in validators (available minus staged)',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultWithdrawableValueEth = new Gauge({
  name: 'lido_vault_withdrawable_value_eth',
  help: 'ETH withdrawable from vault',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultNodeOperatorFeeEth = new Gauge({
  name: 'lido_vault_node_operator_fee_eth',
  help: 'Undisbursed node operator fee in ETH (Dashboard.accruedFee)',
  labelNames: defaultLabels,
  registers: [register],
});

// Vault - PDG (PredepositGuarantee)
export const vaultPdgTotalEth = new Gauge({
  name: 'lido_vault_pdg_total_eth',
  help: 'Total PDG guarantee balance for the vault node operator in ETH',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultPdgLockedEth = new Gauge({
  name: 'lido_vault_pdg_locked_eth',
  help: 'Locked PDG guarantee balance in ETH',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultPdgUnlockedEth = new Gauge({
  name: 'lido_vault_pdg_unlocked_eth',
  help: 'Unlocked PDG guarantee balance in ETH',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultPdgPendingActivations = new Gauge({
  name: 'lido_vault_pdg_pending_activations',
  help: 'PDG validators pending activation for this vault',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultPdgPolicy = new Gauge({
  name: 'lido_vault_pdg_policy',
  help: 'PDG policy enum from Dashboard (0=STRICT, 1=ALLOW_PROVE, 2=ALLOW_DEPOSIT_AND_PROVE)',
  labelNames: defaultLabels,
  registers: [register],
});

// Vault - health
export const vaultHealthFactor = new Gauge({
  name: 'lido_vault_health_factor',
  help: 'Health factor (percentage)',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultIsHealthy = new Gauge({
  name: 'lido_vault_is_healthy',
  help: '1 if vault is healthy, 0 otherwise',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultHealthShortfallShares = new Gauge({
  name: 'lido_vault_health_shortfall_shares',
  help: 'Shares needed to restore vault health',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultUtilizationRatio = new Gauge({
  name: 'lido_vault_utilization_ratio',
  help: 'Utilization ratio (percentage)',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultReportFresh = new Gauge({
  name: 'lido_vault_report_fresh',
  help: '1 if oracle report is fresh, 0 if stale',
  labelNames: defaultLabels,
  registers: [register],
});

// Vault - connection params (from VaultHub.vaultConnection)
export const vaultForcedRebalanceThreshold = new Gauge({
  name: 'lido_vault_forced_rebalance_threshold',
  help: 'Forced rebalance threshold (percentage, e.g. 50 = 50%)',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultReserveRatio = new Gauge({
  name: 'lido_vault_reserve_ratio',
  help: 'Reserve ratio (percentage, e.g. 2.5 = 2.5%)',
  labelNames: defaultLabels,
  registers: [register],
});

// Vault - stETH
export const vaultStethLiabilityShares = new Gauge({
  name: 'lido_vault_steth_liability_shares',
  help: 'stETH liability in shares',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultStethLiabilityEth = new Gauge({
  name: 'lido_vault_steth_liability_eth',
  help: 'stETH liability in ETH',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultMintingCapacityShares = new Gauge({
  name: 'lido_vault_minting_capacity_shares',
  help: 'Total stETH minting capacity in shares',
  labelNames: defaultLabels,
  registers: [register],
});

export const vaultMintingCapacityEth = new Gauge({
  name: 'lido_vault_minting_capacity_eth',
  help: 'Total stETH minting capacity in ETH',
  labelNames: defaultLabels,
  registers: [register],
});

// Withdrawal queue
export const wqUnfinalizedRequests = new Gauge({
  name: 'lido_wq_unfinalized_requests',
  help: 'Number of unfinalized withdrawal requests',
  labelNames: defaultLabels,
  registers: [register],
});

export const wqUnfinalizedAssetsEth = new Gauge({
  name: 'lido_wq_unfinalized_assets_eth',
  help: 'ETH pending in withdrawal queue',
  labelNames: defaultLabels,
  registers: [register],
});

export const wqLastRequestId = new Gauge({
  name: 'lido_wq_last_request_id',
  help: 'Last withdrawal request ID',
  labelNames: defaultLabels,
  registers: [register],
});

export const wqLastFinalizedId = new Gauge({
  name: 'lido_wq_last_finalized_id',
  help: 'Last finalized withdrawal request ID',
  labelNames: defaultLabels,
  registers: [register],
});

// Vault contracts info (addresses as labels, set once at startup)
export const vaultContractsInfo = new Gauge({
  name: 'lido_vault_contracts_info',
  help: 'Vault contract addresses (always 1). Labels carry addresses.',
  labelNames: ['vault_name', 'chain', 'vault_addr', 'pool_addr', 'wq_addr', 'dashboard_addr'],
  registers: [register],
});

// Watcher
export const watcherInfo = new Gauge({
  name: 'stvaults_watcher_info',
  help: 'Watcher metadata (always 1). Labels carry version, chain and explorer_url.',
  labelNames: ['version', 'chain', 'explorer_url'],
  registers: [register],
});

export const watcherLastPollTimestamp = new Gauge({
  name: 'stvaults_watcher_last_poll_timestamp',
  help: 'Timestamp of last successful poll',
  labelNames: ['chain'],
  registers: [register],
});

export const watcherPollErrorsTotal = new Counter({
  name: 'stvaults_watcher_poll_errors_total',
  help: 'Total polling errors',
  labelNames: ['chain'],
  registers: [register],
});

/**
 * Get label set for a vault.
 * @param {string} vault - Vault address
 * @param {string} vaultName - Human-readable vault id
 * @param {string} chain - Chain name (e.g. mainnet, hoodi)
 * @returns {{ vault: string, vault_name: string, chain: string }}
 */
export function vaultLabels(vault, vaultName, chain) {
  return { vault, vault_name: vaultName, chain };
}
