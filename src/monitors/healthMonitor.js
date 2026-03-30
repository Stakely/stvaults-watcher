/**
 * Health factor and utilization ratio computation from vault/VaultHub data.
 */

/**
 * Compute health factor as percentage.
 * Formula: HF = Total Value × (1 - FRT) / Minted stETH (liability in ETH)
 * @param {bigint} totalValueWei
 * @param {number} forcedRebalanceThresholdBP - e.g. 1000 = 10%
 * @param {bigint} liabilityEthWei - stETH liability converted to ETH
 * @returns {number} Health factor percentage (e.g. 150 = 150%)
 */
export function computeHealthFactorPct(totalValueWei, forcedRebalanceThresholdBP, liabilityEthWei) {
  if (liabilityEthWei === 0n) return Infinity;
  const frt = Number(forcedRebalanceThresholdBP) / 10_000;
  const numerator = Number(totalValueWei) * (1 - frt);
  const pct = (numerator / Number(liabilityEthWei)) * 100;
  const clamped = Math.max(0, pct);
  // Keep the metric stable/noisy-less: round at source (not in Grafana).
  return Math.round(clamped * 100) / 100;
}

/**
 * Compute utilization ratio as percentage.
 * UR = (liabilityShares / totalMintingCapacityShares) × 100
 * @param {bigint} liabilityShares
 * @param {bigint} mintingCapacityShares
 * @returns {number}
 */
export function computeUtilizationRatioPct(liabilityShares, mintingCapacityShares) {
  if (mintingCapacityShares === 0n) return 0;
  return Number((liabilityShares * 10000n) / mintingCapacityShares) / 100;
}
