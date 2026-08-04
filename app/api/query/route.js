import { NextResponse } from "next/server";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
} from "../../utils/sourcify.js";

// Parse an abi field into a JSON object when the backend returns it as a string.
function parseAbi(raw) {
  if (raw == null || typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function normalizeBackendItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  return { ...item, abi: parseAbi(item.abi) };
}

function normalizeBackendData(data) {
  return Array.isArray(data)
    ? data.map(normalizeBackendItem)
    : normalizeBackendItem(data);
}

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
          const { data: raw, ...rest } = data;
          const normalized = normalizeBackendData(raw);
          const collapsed =
            Array.isArray(normalized) && normalized.length === 1
              ? normalized[0]
              : normalized;
          return NextResponse.json({ ...rest, data: collapsed });
        }
      }
    } catch (error) {
      console.error("query error:", error);
    }
  }

  return NextResponse.json({ msg: "not found", data: null });
}
