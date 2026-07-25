import { NextResponse } from "next/server";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
} from "../../utils/sourcify.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sign = searchParams.get("sign");

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
    const item = {
      text_sign: names[0],
      output: null,
      abi: null,
    };
    return NextResponse.json({ msg: "ok", data: item });
  }

  // 2. Fall back to backend
  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    try {
      const params = new URLSearchParams({ sign });
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
