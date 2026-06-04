import { NextResponse } from "next/server";
import {
  lookupFunctionSignatures,
  sigToFunctionAbi,
} from "../../utils/openchain.js";
import { decodeFunctionCalldata } from "../../utils/decoder.js";
import { isMulticallData } from "../../utils/multicall.js";
import { decodeMulticall } from "../../utils/multicallDecoder.js";

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

  // Never forward multicall=true to the backend: the backend's multicall mode
  // is for WAF rule recursion and changes the response format — it drops the
  // outer func/args entirely, returning only inner decoded calls (or [[]] when
  // the contract isn't in its DB).  We do inner-call decoding ourselves.
  const params = new URLSearchParams({
    data,
    multicall: false,
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

    // data[0] must be a non-empty object (not an empty array like [[]] from the
    // backend's multicall mode leaking through)
    const d0 = result?.data?.[0];
    const backendDecoded =
      d0 && typeof d0 === "object" && !Array.isArray(d0) && d0.func;
    if (result?.msg === "ok" && backendDecoded)
      return NextResponse.json(await augmentMulticall(data, result));

    // Backend returned ok but empty — use our decoder for known multicall types,
    // otherwise fall back to OpenChain
    const fallback = await buildFallback(data);
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json(result);
  } catch (error) {
    // Backend unreachable — same fallback chain
    const fallback = await buildFallback(data);
    if (fallback) return NextResponse.json(fallback);

    console.error("Decode API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to decode data" },
      { status: 500 },
    );
  }
}

// When backend successfully decoded the outer call, augment with inner_calls
// for known multicall types (outer func/args stay from backend).
async function augmentMulticall(data, backendResult) {
  if (!isMulticallData(data)) return backendResult;
  const mc = decodeMulticall(data);
  if (!mc?.inner_calls?.length) return backendResult;
  const inner_calls = await Promise.all(
    mc.inner_calls.map(async (call) => {
      const d = call.data;
      if (!d || d === "0x" || d.length < 10) return call;
      const decoded = await tryOpenChainFunctionFallback(d);
      return decoded?.data?.[0] ? { ...call, decoded: decoded.data[0] } : call;
    }),
  );
  const d0 = backendResult.data[0];
  return { ...backendResult, data: [{ ...d0, inner_calls }] };
}

// For known multicall selectors: decode outer structure with named fields,
// then decode each inner call's data via OpenChain.
// Falls through to plain OpenChain for everything else.
async function buildFallback(data) {
  if (isMulticallData(data)) {
    const mc = decodeMulticall(data);
    if (mc) {
      const inner_calls = await Promise.all(
        mc.inner_calls.map(async (call) => {
          const d = call.data;
          if (!d || d === "0x" || d.length < 10) return call;
          const decoded = await tryOpenChainFunctionFallback(d);
          return decoded?.data?.[0]
            ? { ...call, decoded: decoded.data[0] }
            : call;
        }),
      );
      return { msg: "ok", data: [{ ...mc, inner_calls, source: "client" }] };
    }
  }
  return tryOpenChainFunctionFallback(data);
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
