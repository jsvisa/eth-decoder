import { NextResponse } from "next/server";
import { fetchCoinGeckoPrice } from "../../utils/coingecko";

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

  const price = await fetchCoinGeckoPrice(tokenAddress, chainId);
  return NextResponse.json({ price });
}
