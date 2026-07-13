import { NextResponse } from "next/server";
import { CGC_CHAIN_SLUGS, ETH_NATIVE_CHAIN_IDS } from "../../utils/chains";
import { NATIVE_TOKEN_ADDRESS } from "../../utils/tokenTransfers";

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

  const chain = CGC_CHAIN_SLUGS[chainId];
  if (!chain) {
    return NextResponse.json({ price: null });
  }

  try {
    let url;
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
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
