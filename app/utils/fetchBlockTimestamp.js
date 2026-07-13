import { createPublicClient, http } from "viem";

/**
 * Fetches the timestamp of a given block via RPC.
 * Returns null on RPC errors or if the block has no timestamp.
 *
 * @param {string|bigint} blockNumber - Block number (decimal, hex, or bigint)
 * @param {string} rpcUrl - RPC URL to query
 * @param {import("viem").Chain} [chain] - Optional viem Chain object
 * @returns {Promise<number|null>} Block timestamp in seconds, or null
 */
export async function fetchBlockTimestamp(blockNumber, rpcUrl, chain = null) {
  try {
    const client = chain
      ? createPublicClient({ chain, transport: http(rpcUrl) })
      : createPublicClient({ transport: http(rpcUrl) });
    const block = await client.getBlock({
      blockNumber: BigInt(blockNumber),
    });
    return block.timestamp ? Number(block.timestamp) : null;
  } catch {
    return null;
  }
}
