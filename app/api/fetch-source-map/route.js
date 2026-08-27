import { NextResponse } from "next/server";
import { isValidEthAddress } from "../../utils/validation";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chainId = searchParams.get("chainId");

    if (!address) {
      return NextResponse.json(
        { error: "Missing address parameter" },
        { status: 400 },
      );
    }

    if (!isValidEthAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 },
      );
    }

    if (!chainId) {
      return NextResponse.json(
        { error: "Missing chainId parameter" },
        { status: 400 },
      );
    }

    if (!/^\d{1,12}$/.test(chainId)) {
      return NextResponse.json(
        { error: "Invalid chainId format" },
        { status: 400 },
      );
    }

    const response = await fetchWithTimeout(
      `https://sourcify.dev/server/v2/contract/${encodeURIComponent(
        chainId,
      )}/${address}/files`,
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Source map not found" },
        { status: 404 },
      );
    }

    const data = await response.json();

    if (!data) {
      return NextResponse.json(
        { error: "Empty response from Sourcify" },
        { status: 404 },
      );
    }

    const sourceMap = data?.evm?.deployedBytecode?.sourceMap || null;

    let sources = null;
    if (data?.sources) {
      sources = {};
      for (const [file, info] of Object.entries(data.sources)) {
        sources[file] = typeof info === "object" ? info.content || "" : info;
      }
    }

    return NextResponse.json({ sourceMap, sources });
  } catch (error) {
    console.error("Fetch source map error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch source map" },
      { status: 500 },
    );
  }
}
