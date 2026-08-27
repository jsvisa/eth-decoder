import {
  CGC_CHAIN_SLUGS,
  ETH_NATIVE_CHAIN_IDS,
  NATIVE_COIN_IDS,
  WETH_ADDRESSES,
} from "./chains";
import { NATIVE_TOKEN_ADDRESS } from "./tokenTransfers";

export async function fetchCoinGeckoPrice(tokenAddress, chainId) {
  // Small in-process TTL cache: CoinGecko's free tier is heavily
  // rate-limited and identical (token, chain) requests often arrive in
  // bursts (e.g. one per balance-change row).
  const key = `${String(tokenAddress).toLowerCase()}:${chainId}`;
  const now = Date.now();
  const cached = PRICE_CACHE.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.price;
  }

  const price = await fetchCoinGeckoPriceUncached(tokenAddress, chainId);

  PRICE_CACHE.set(key, { price, expiresAt: now + PRICE_TTL_MS });
  if (PRICE_CACHE.size > MAX_PRICE_CACHE_ENTRIES) {
    // Drop the oldest entries to keep the map bounded
    const excess = PRICE_CACHE.size - MAX_PRICE_CACHE_ENTRIES;
    let dropped = 0;
    for (const k of PRICE_CACHE.keys()) {
      if (dropped >= excess) break;
      PRICE_CACHE.delete(k);
      dropped++;
    }
  }

  return price;
}

const PRICE_TTL_MS = 60_000;
const MAX_PRICE_CACHE_ENTRIES = 500;
const PRICE_CACHE = new Map();

/** Test-only: clear the in-process price cache between tests. */
export function resetPriceCacheForTests() {
  PRICE_CACHE.clear();
}

async function fetchCoinGeckoPriceUncached(tokenAddress, chainId) {
  try {
    const addr = tokenAddress.toLowerCase();

    // Native token / WETH: use simple/price (coin ID based, no chain slug needed)
    if (addr === NATIVE_TOKEN_ADDRESS || WETH_ADDRESSES.has(addr)) {
      const cgcId = ETH_NATIVE_CHAIN_IDS.has(chainId)
        ? "ethereum"
        : NATIVE_COIN_IDS[chainId];
      if (!cgcId) return null;
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgcId}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json();
      return data[cgcId]?.usd ?? null;
    }

    // ERC-20 token: use simple/token_price (platform slug needed)
    const chainSlug = CGC_CHAIN_SLUGS[chainId];
    if (!chainSlug) return null;

    const url = `https://api.coingecko.com/api/v3/simple/token_price/${chainSlug}?contract_addresses=${addr}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data[addr]?.usd ?? null;
  } catch {
    return null;
  }
}
