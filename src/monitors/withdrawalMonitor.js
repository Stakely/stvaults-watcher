/**
 * Withdrawal queue state for DeFi Wrapper - used for metrics and alert conditions.
 */

/**
 * Check if there are unfinalized withdrawal requests.
 * @param {bigint} unfinalizedRequestsNumber
 * @returns {boolean}
 */
export function hasUnfinalizedRequests(unfinalizedRequestsNumber) {
  return unfinalizedRequestsNumber > 0n;
}
