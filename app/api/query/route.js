import { NextResponse } from "next/server";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
} from "../../utils/sourcify.js";

async function fallbackToSourcify(sign, count) {
  // 4-byte selectors ("0x" + 8 hex chars = 10) are function selectors; longer are event topics
  const isEvent = sign.length > 10;
  const names = isEvent
    ? await lookupEventSignatures(sign)
    : await lookupFunctionSignatures(sign);

  if (names.length === 0) {
    return { msg: "not found", data: null };
  }

  const n = Math.max(1, parseInt(count, 10));
  const items = names.slice(0, n).map((name) => ({
    text_sign: name,
    output: null,
    abi: null,
  }));

  return { msg: "ok", data: n === 1 ? items[0] : items };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sign = searchParams.get("sign");
  const count = searchParams.get("count") || "1";

  if (!sign) {
    return NextResponse.json(
      { error: "Missing sign parameter" },
      { status: 400 },
    );
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL not configured" },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({ sign, count });

  try {
    const response = await fetch(`${backendUrl}/api/v1/query?${params}`);
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    const data = await response.json();
    if (data?.data != null) {
      return NextResponse.json(data);
    }
    // Backend returned not found; fall through to Sourcify
  } catch (error) {
    console.error("query error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to query signature" },
      { status: 500 },
    );
  }

  // Sourcify fallback when backend has no match
  return NextResponse.json(await fallbackToSourcify(sign, count));
}
