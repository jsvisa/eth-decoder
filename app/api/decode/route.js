import { NextResponse } from "next/server";
import {
  lookupFunctionSignatures,
  sigToFunctionAbi,
} from "../../utils/openchain.js";
import { decodeFunctionCalldata } from "../../utils/decoder.js";
import { isMulticallData } from "../../utils/multicall.js";
import { decodeMulticall } from "../../utils/multicallDecoder.js";
import { decodeUniversalRouter } from "../../utils/universalRouter.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data");

  if (!data) {
    return NextResponse.json(
      { error: "Missing data parameter" },
      { status: 400 },
    );
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    return NextResponse.json(
      {
        error:
          "Backend URL is not configured. Please set BACKEND_URL environment variable.",
      },
      { status: 500 },
    );
  }

  const withAbi = searchParams.get("with_abi") === "true";
  const withSign = searchParams.get("with_sign") === "true";

  const params = new URLSearchParams({
    data,
    with_abi: withAbi,
    with_sign: withSign,
  });

  try {
    const response = await fetch(`${backendUrl}/api/v1/decode?${params}`);

    if (!response.ok) {
      throw new Error(
        `Backend returned ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();

    // data[0] must be a non-empty object with func (not [[]] from backend multicall mode)
    const d0 = result?.data?.[0];
    const backendDecoded =
      d0 && typeof d0 === "object" && !Array.isArray(d0) && d0.func;
    if (result?.msg === "ok" && backendDecoded)
      return NextResponse.json(await augmentMulticall(data, result));

    const fallback = await buildFallback(data);
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json(result);
  } catch (error) {
    const fallback = await buildFallback(data);
    if (fallback) return NextResponse.json(fallback);

    console.error("Decode API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to decode data" },
      { status: 500 },
    );
  }
}

// When backend decoded the outer call, augment with inner_calls.
async function augmentMulticall(data, backendResult) {
  if (!isMulticallData(data)) return backendResult;
  const d0 = backendResult.data[0];

  const mc = decodeMulticall(data);
  if (mc?.inner_calls?.length) {
    const inner_calls = await decodeInnerCalls(mc.inner_calls);
    return { ...backendResult, data: [{ ...d0, inner_calls }] };
  }

  const ur = decodeUniversalRouter(data);
  if (ur?.inner_calls?.length) {
    return { ...backendResult, data: [{ ...d0, inner_calls: ur.inner_calls }] };
  }

  return backendResult;
}

// For known multicall/UR selectors: decode fully client-side.
// Falls through to OpenChain for everything else.
async function buildFallback(data) {
  if (isMulticallData(data)) {
    const mc = decodeMulticall(data);
    if (mc) {
      const inner_calls = await decodeInnerCalls(mc.inner_calls);
      return { msg: "ok", data: [{ ...mc, inner_calls, source: "client" }] };
    }

    const ur = decodeUniversalRouter(data);
    if (ur) {
      return { msg: "ok", data: [{ ...ur, source: "client" }] };
    }
  }
  return tryOpenChainFunctionFallback(data);
}

// Decode each inner call's data via OpenChain (parallel, best-effort).
async function decodeInnerCalls(inner_calls) {
  return Promise.all(
    inner_calls.map(async (call) => {
      const d = call.data;
      if (!d || d === "0x" || d.length < 10) return call;
      const decoded = await tryOpenChainFunctionFallback(d);
      return decoded?.data?.[0] ? { ...call, decoded: decoded.data[0] } : call;
    }),
  );
}

async function tryOpenChainFunctionFallback(data) {
  const hex = data.startsWith("0x") ? data : "0x" + data;
  const selector = hex.slice(0, 10);
  const sigs = await lookupFunctionSignatures(selector);
  for (const sig of sigs) {
    try {
      const abiItem = sigToFunctionAbi(sig);
      const decoded = decodeFunctionCalldata(abiItem, data);
      return { msg: "ok", data: [{ ...decoded, source: "openchain" }] };
    } catch {
      // selector mismatch or ABI mismatch — try next candidate
    }
  }
  return null;
}
