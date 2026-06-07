import { NextResponse } from "next/server";

// CoinGecko asset platform ids keyed by EVM chain id
// Full list: https://api.coingecko.com/api/v3/asset_platforms
const CGC_CHAINS = {
  1: "ethereum",
  10: "optimistic-ethereum",
  25: "cronos",
  56: "binance-smart-chain",
  100: "xdai",
  137: "polygon-pos",
  250: "fantom",
  324: "zksync",
  1088: "metis-andromeda",
  1284: "moonbeam",
  1285: "moonriver",
  2222: "kava",
  5000: "mantle",
  8453: "base",
  34443: "mode",
  42161: "arbitrum-one",
  42220: "celo",
  43114: "avalanche",
  59144: "linea",
  81457: "blast",
  534352: "scroll",
  1313161554: "aurora",
};

// Chains whose native token is ETH — override to "ethereum" for native price
const ETH_NATIVE_CHAIN_IDS = new Set([
  1, 10, 42161, 8453, 324, 59144, 534352, 81457, 34443, 1088,
]);

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

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

  const chain = CGC_CHAINS[chainId];
  if (!chain) {
    return NextResponse.json({ price: null });
  }

  try {
    let url;
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN) {
      const cgcId = ETH_NATIVE_CHAIN_IDS.has(chainId) ? "ethereum" : chain;
      url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgcId}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return NextResponse.json({ price: null });
      const data = await res.json();
      return NextResponse.json({ price: data[cgcId]?.usd ?? null });
    } else {
      url = `https://api.coingecko.com/api/v3/simple/token_price/${chain}?contract_addresses=${tokenAddress}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return NextResponse.json({ price: null });
      const data = await res.json();
      return NextResponse.json({
        price: data[tokenAddress.toLowerCase()]?.usd ?? null,
      });
    }
  } catch {
    return NextResponse.json({ price: null });
  }
}
