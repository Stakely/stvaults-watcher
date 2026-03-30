import { parseAbi } from 'viem';

/** Human-readable ABIs for Lido V3 stVaults monitoring (read-only methods). */

export const vaultHubAbi = parseAbi([
  'function isVaultHealthy(address vault) view returns (bool)',
  'function healthShortfallShares(address vault) view returns (uint256)',
  'function liabilityShares(address vault) view returns (uint256)',
  'function totalMintingCapacityShares(address vault, int256 deltaValue) view returns (uint256)',
  'function isReportFresh(address vault) view returns (bool)',
  'function withdrawableValue(address vault) view returns (uint256)',
  'function totalValue(address vault) view returns (uint256)',
]);

export const vaultConnectionAbi = [{
  name: 'vaultConnection',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: '_vault', type: 'address' }],
  outputs: [{
    name: '',
    type: 'tuple',
    components: [
      { name: 'owner', type: 'address' },
      { name: 'shareLimit', type: 'uint96' },
      { name: 'vaultIndex', type: 'uint96' },
      { name: 'disconnectInitiatedTs', type: 'uint48' },
      { name: 'reserveRatioBP', type: 'uint16' },
      { name: 'forcedRebalanceThresholdBP', type: 'uint16' },
      { name: 'infraFeeBP', type: 'uint16' },
      { name: 'liquidityFeeBP', type: 'uint16' },
      { name: 'reservationFeeBP', type: 'uint16' },
      { name: 'beaconChainDepositsPauseIntent', type: 'bool' },
    ],
  }],
}];

export const stakingVaultAbi = parseAbi([
  'function availableBalance() view returns (uint256)',
  'function stagedBalance() view returns (uint256)',
  'function valuation() view returns (uint256)',
  'function nodeOperator() view returns (address)',
]);

export const withdrawalQueueAbi = parseAbi([
  'function unfinalizedRequestsNumber() view returns (uint256)',
  'function unfinalizedAssets() view returns (uint256)',
  'function getLastRequestId() view returns (uint256)',
  'function getLastFinalizedRequestId() view returns (uint256)',
]);

export const poolAbi = parseAbi([
  'function WITHDRAWAL_QUEUE() view returns (address)',
  'function DASHBOARD() view returns (address)',
]);

export const dashboardAbi = parseAbi([
  'function accruedFee() view returns (uint256)',
  'function pdgPolicy() view returns (uint8)',
]);

export const stEthAbi = parseAbi([
  'function getPooledEthByShares(uint256 shares) view returns (uint256)',
]);

export const pdgAbi = parseAbi([
  'function nodeOperatorBalance(address _nodeOperator) view returns (uint128 total, uint128 locked)',
  'function unlockedBalance(address _nodeOperator) view returns (uint256)',
  'function pendingActivations(address _vault) view returns (uint256)',
]);
