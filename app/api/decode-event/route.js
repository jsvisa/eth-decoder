import { NextResponse } from "next/server";
import { lookupEventSignatures, sigToEventAbi } from "../../utils/sourcify.js";
import { decodeEventLog } from "../../utils/decoder.js";

export async function GET(request) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const sign = searchParams.get("sign");
  const topics = searchParams.get("topics");
  const data = searchParams.get("data") || "0x";

  if (!sign) {
    return NextResponse.json(
      { error: "Missing sign (topic0) parameter" },
      { status: 400 },
    );
  }

  try {
    const params = new URLSearchParams({ sign, data });
    if (topics) params.set("topics", topics);

    const response = await fetch(`${backendUrl}/api/v1/decode-event?${params}`);
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const result = await response.json();
    if (result?.msg === "ok") return NextResponse.json(result);

    // Backend found no match — try Sourcify
    const fallback = await trySourcifyEventFallback(sign, topics, data);
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json(result);
  } catch (error) {
    const fallback = await trySourcifyEventFallback(sign, topics, data);
    if (fallback) return NextResponse.json(fallback);

    console.error("decode-event error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to decode event" },
      { status: 500 },
    );
  }
}

async function trySourcifyEventFallback(sign, topics, data) {
  const sigs = await lookupEventSignatures(sign);
  // topics param includes topic0 as first element; count remaining for numIndexed
  const allTopics = topics ? topics.split(",") : [sign];
  const numIndexed = allTopics.length - 1;

  for (const sig of sigs) {
    try {
      const abiItem = sigToEventAbi(sig, numIndexed);
      const decoded = decodeEventLog(abiItem, allTopics, data);
      return { msg: "ok", data: { ...decoded, source: "sourcify" } };
    } catch {
      // ABI mismatch — try next candidate
    }
  }
  return null;
}
