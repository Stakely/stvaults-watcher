import { createPublicClient, http } from 'viem';

/**
 * Create a viem public client for read-only contract calls.
 * @param {string} rpcUrl - Ethereum RPC URL
 * @param {number} chainId - Chain ID
 * @returns {import('viem').PublicClient}
 */
export function createClient(rpcUrl, chainId) {
  return createPublicClient({
    chain: {
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  });
}
