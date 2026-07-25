import { NextResponse } from "next/server";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
} from "../../utils/sourcify.js";

function toResponse(names, count) {
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

  // 1. Try Sourcify first
  const isEvent = sign.length > 10;
  const names = isEvent
    ? await lookupEventSignatures(sign)
    : await lookupFunctionSignatures(sign);

  if (names.length > 0) {
    return NextResponse.json(toResponse(names, count));
  }

  // 2. Fall back to backend
  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    try {
      const params = new URLSearchParams({ sign, count });
      const response = await fetch(`${backendUrl}/api/v1/query?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data?.data != null) {
          return NextResponse.json(data);
        }
      }
    } catch (error) {
      console.error("query error:", error);
    }
  }

  return NextResponse.json({ msg: "not found", data: null });
}
