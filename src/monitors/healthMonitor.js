/**
 * Health factor and utilization ratio computation.
 *
 * `calculateHealth` is a faithful port of
 * lido-staking-vault-cli `utils/health/calculate-health.ts`
 * (https://github.com/lidofinance/lido-staking-vault-cli/blob/main/utils/health/calculate-health.ts).
 * All arithmetic is done in BigInt at 1e18 precision, matching the CLI bit-for-bit
 * so the watcher's health factor agrees with `vo r health`.
 *
 * The CLI feeds `liabilitySharesInStethWei` from `stETH.getPooledEthBySharesRoundUp`
 * (round UP, conservative — caller is responsible for using the same method).
 */

const BASIS_POINTS_DENOMINATOR = 10_000n;
const PRECISION = 10n ** 18n;

/**
 * @typedef {Object} HealthResult
 * @property {number} healthRatio - Health ratio as percentage (e.g. 180.0 for 180%). Infinity when liability is zero.
 * @property {bigint} healthRatio18 - `healthRatio` scaled by 1e18 (full precision; Infinity case yields 0n).
 * @property {boolean} isHealthy - Derived from `healthRatio >= 100`.
 */

/**
 * Port of Lido CLI calculateHealth. Inputs in wei / BP, output in % (number) plus 1e18-scaled BigInt.
 * @param {{ totalValue: bigint, liabilityStethWei: bigint, forcedRebalanceThresholdBP: number }} args
 * @returns {HealthResult}
 */
export function calculateHealth({ totalValue, liabilityStethWei, forcedRebalanceThresholdBP }) {
  const thresholdMultiplier =
    ((BASIS_POINTS_DENOMINATOR - BigInt(forcedRebalanceThresholdBP)) * PRECISION) /
    BASIS_POINTS_DENOMINATOR;
  const adjustedValuation = (totalValue * thresholdMultiplier) / PRECISION;

  if (liabilityStethWei === 0n) {
    return { healthRatio: Infinity, healthRatio18: 0n, isHealthy: true };
  }

  const healthRatio18 = (adjustedValuation * PRECISION * 100n) / liabilityStethWei;
  const healthRatio = Number(healthRatio18) / 1e18;
  const isHealthy = healthRatio >= 100;
  return { healthRatio, healthRatio18, isHealthy };
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
