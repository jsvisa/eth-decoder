import { createPublicClient, http } from "viem";

/**
 * Auto-populate warp timestamp from block number if not already set.
 * Used by both the server-side simulate-tx route and the client-side
 * contract-caller before running a simulation with a forked block.
 *
 * @param {string|number} blockNumber - "latest", decimal, or hex string
 * @param {object} cheatcodes - Current cheatcodes (may already have warp.timestamp)
 * @param {string} rpcUrl - RPC URL to fetch the block from
 * @param {object} [viemChain] - Optional viem chain object (for server-side use)
 * @returns {Promise<object>} Updated cheatcodes with warp timestamp if auto-filled
 */
export async function autoFillWarpTimestamp(
  blockNumber,
  cheatcodes,
  rpcUrl,
  viemChain,
) {
  if (!blockNumber || blockNumber === "latest" || cheatcodes?.warp?.timestamp) {
    return cheatcodes || {};
  }
  try {
    const blockNum = BigInt(blockNumber);
    const client = createPublicClient({
      ...(viemChain ? { chain: viemChain } : {}),
      transport: http(rpcUrl),
    });
    const block = await client.getBlock({ blockNumber: blockNum });
    if (block.timestamp) {
      return {
        ...(cheatcodes || {}),
        warp: {
          ...((cheatcodes || {}).warp || {}),
          timestamp: Number(block.timestamp),
        },
      };
    }
  } catch {
    // Block fetch failed — simulate without warp
  }
  return cheatcodes || {};
}
