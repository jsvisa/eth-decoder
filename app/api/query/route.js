import { NextResponse } from "next/server";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
} from "../../utils/sourcify.js";
import { isValidSelector, isValidTopic0 } from "../../utils/serverSigCache";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sign = searchParams.get("sign");

  if (!sign) {
    return NextResponse.json(
      { error: "Missing sign parameter" },
      { status: 400 },
    );
  }

  if (!isValidSelector(sign) && !isValidTopic0(sign)) {
    return NextResponse.json(
      {
        error:
          "Invalid sign parameter — must be a 4-byte selector (0x + 8 hex chars) or a topic0 hash (0x + 64 hex chars)",
      },
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
      const response = await fetchWithTimeout(
        `${backendUrl}/api/v1/query?${params}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data?.data != null) {
          const { data: raw, ...rest } = data;
          const normalized =
            Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
          return NextResponse.json({ ...rest, data: normalized });
        }
      }
    } catch (error) {
      console.error("query error:", error);
    }
  }

  return NextResponse.json({ msg: "not found", data: null });
}
