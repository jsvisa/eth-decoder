import { createPublicClient, http } from "viem";

// A block's timestamp never changes, so it is fetched once per (rpc, block)
// and shared across calls: session mode resolves the same fork block for every
// call it replays. Bounded to keep a long-lived server from growing unbounded.
const BLOCK_TIMESTAMP_CACHE_MAX = 1000;
const blockTimestampCache = new Map();

async function getBlockTimestamp(rpcUrl, viemChain, blockNum) {
  const key = `${rpcUrl}|${blockNum}`;
  if (blockTimestampCache.has(key)) return blockTimestampCache.get(key);
  const client = createPublicClient({
    ...(viemChain ? { chain: viemChain } : {}),
    transport: http(rpcUrl),
  });
  const pending = client
    .getBlock({ blockNumber: blockNum })
    .then((block) => block.timestamp);
  blockTimestampCache.set(key, pending);
  if (blockTimestampCache.size > BLOCK_TIMESTAMP_CACHE_MAX) {
    blockTimestampCache.delete(blockTimestampCache.keys().next().value);
  }
  // Failures are not cached, so a transient RPC error can be retried.
  pending.catch(() => blockTimestampCache.delete(key));
  return pending;
}

export function clearBlockTimestampCache() {
  blockTimestampCache.clear();
}

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
    const timestamp = await getBlockTimestamp(
      rpcUrl,
      viemChain,
      BigInt(blockNumber),
    );
    if (timestamp) {
      return {
        ...(cheatcodes || {}),
        warp: {
          ...((cheatcodes || {}).warp || {}),
          timestamp: Number(timestamp),
        },
      };
    }
  } catch {
    // Block fetch failed — simulate without warp
  }
  return cheatcodes || {};
}
