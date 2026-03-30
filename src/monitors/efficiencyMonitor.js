/**
 * Detection of inefficient ETH (available in vault but not in validators/staged).
 */

/**
 * Compute inactive ETH: available balance minus staged (ETH sitting in buffer not yet in validators).
 * @param {bigint} availableBalanceWei
 * @param {bigint} stagedBalanceWei
 * @returns {bigint}
 */
export function computeInactiveEthWei(availableBalanceWei, stagedBalanceWei) {
  if (availableBalanceWei <= stagedBalanceWei) return 0n;
  return availableBalanceWei - stagedBalanceWei;
}

/**
 * Check if inactive ETH exceeds threshold (alert condition).
 * @param {bigint} inactiveEthWei
 * @param {bigint} thresholdWei
 * @returns {boolean}
 */
export function isInactiveEthAboveThreshold(inactiveEthWei, thresholdWei) {
  return inactiveEthWei > thresholdWei;
}
