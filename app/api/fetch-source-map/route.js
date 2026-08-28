import { NextResponse } from "next/server";
import { isValidEthAddress } from "../../utils/validation";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";

// TODO: Sourcify-only coverage — many verified contracts exist on Etherscan
// but not Sourcify, and Etherscan's API never serves compile output, so
// pc -> source line mapping is impossible from it directly. Fallback plan
// when we need it:
//   1. Etherscan getsourcecode -> sources + CompilerVersion +
//      OptimizationUsed/Runs + EVMVersion + libraries + viaIR
//   2. Recompile with the matching solc-js version (binaries loaded on
//      demand per version, ~10-30 MB each — needs caching; mind Vercel
//      serverless bundle-size/timeout limits)
//   3. Diff the recompiled evm.deployedBytecode.object against on-chain
//      eth_getCode — only if identical is the recompiled sourceMap valid
//      for mapping pcs; otherwise discard
// Applies equally to the server-side resolver in
// app/utils/traceSourceLines.js (resolveTraceSourceLinesForSave), which
// shares this Sourcify-only gap.

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
