import {
  CGC_CHAIN_SLUGS,
  ETH_NATIVE_CHAIN_IDS,
  NATIVE_COIN_IDS,
  WETH_ADDRESSES,
} from "./chains";
import { NATIVE_TOKEN_ADDRESS } from "./tokenTransfers";

export async function fetchCoinGeckoPrice(tokenAddress, chainId) {
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
