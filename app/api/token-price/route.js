import { NextResponse } from "next/server";

// CoinGecko chain mapping (chain_id -> CoinGecko platform id)
const CGC_CHAINS = {
  1: "ethereum",
  10: "optimistic-ethereum",
  56: "binance-smart-chain",
  137: "polygon-pos",
  8453: "base",
  42161: "arbitrum-one",
  43114: "avalanche",
};

// DefiLlama chain mapping
const LMA_CHAINS = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  43114: "avalanche",
};

// Chains whose native token is ETH — use "ethereum" as CoinGecko id
const ETH_NATIVE_CHAIN_IDS = new Set([1, 10, 42161, 8453]);

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

async function fetchFromCoinGecko(tokenAddress, chainId) {
  const chain = CGC_CHAINS[chainId];
  if (!chain) return null;

  try {
    let url;
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN) {
      const cgcId = ETH_NATIVE_CHAIN_IDS.has(chainId) ? "ethereum" : chain;
      url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgcId}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json();
      return data[cgcId]?.usd ?? null;
    } else {
      url = `https://api.coingecko.com/api/v3/simple/token_price/${chain}?contract_addresses=${tokenAddress}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json();
      return data[tokenAddress.toLowerCase()]?.usd ?? null;
    }
  } catch {
    return null;
  }
}

async function fetchFromDefiLlama(tokenAddress, chainId) {
  const chain = LMA_CHAINS[chainId];
  if (!chain) return null;

  const coin = `${chain}:${tokenAddress}`;
  const url = `https://coins.llama.fi/prices/current/${coin}?searchWidth=8h`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.coins?.[coin]?.price ?? null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tokenAddress = searchParams.get("token");
  const chainId = parseInt(searchParams.get("chainId"), 10);

  if (!tokenAddress || !chainId) {
    return NextResponse.json(
      { error: "Missing token or chainId" },
      { status: 400 },
    );
  }

  let price = await fetchFromCoinGecko(tokenAddress, chainId);
  if (price === null) {
    price = await fetchFromDefiLlama(tokenAddress, chainId);
  }

  return NextResponse.json({ price: price ?? null });
}
