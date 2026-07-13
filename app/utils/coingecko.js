import {
  CGC_CHAIN_SLUGS,
  ETH_NATIVE_CHAIN_IDS,
  NATIVE_COIN_IDS,
} from "./chains";
import { NATIVE_TOKEN_ADDRESS } from "./tokenTransfers";

export async function fetchCoinGeckoPrice(tokenAddress, chainId) {
  const chainSlug = CGC_CHAIN_SLUGS[chainId];
  if (!chainSlug) return null;

  try {
    let url;
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
      const cgcId = ETH_NATIVE_CHAIN_IDS.has(chainId)
        ? "ethereum"
        : NATIVE_COIN_IDS[chainId];
      if (!cgcId) return null;
      url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgcId}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json();
      return data[cgcId]?.usd ?? null;
    }

    url = `https://api.coingecko.com/api/v3/simple/token_price/${chainSlug}?contract_addresses=${tokenAddress}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data[tokenAddress.toLowerCase()]?.usd ?? null;
  } catch {
    return null;
  }
}
