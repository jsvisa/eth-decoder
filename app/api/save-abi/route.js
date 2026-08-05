import { NextResponse } from "next/server";
import {
  toEventSelector,
  toEventSignature,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";

const BACKEND_WRITE_PATH = "/api/v1/write";

// Build the storage record (byte_sign, text_sign, abi) for a single ABI entry.
function recordFromAbiItem(item) {
  if (!item || typeof item !== "object") return null;

  if (item.type === "function") {
    return {
      byte_sign: toFunctionSelector(item),
      text_sign: toFunctionSignature(item),
      abi: item,
    };
  }

  if (item.type === "event") {
    return {
      byte_sign: toEventSelector(item),
      text_sign: toEventSignature(item),
      abi: item,
    };
  }

  return null;
}

export async function POST(request) {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    return NextResponse.json(
      {
        ok: false,
        saved: 0,
        total: 0,
        error: "Backend not configured (BACKEND_URL missing)",
      },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        saved: 0,
        total: 0,
        error: "Request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  const apiKey = body?.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        saved: 0,
        total: 0,
        error: "Backend API key is not configured",
      },
      { status: 500 },
    );
  }

  const abi = Array.isArray(body?.abi) ? body.abi : [];
  const records = abi.map(recordFromAbiItem).filter(Boolean);
  const total = records.length;

  let saved = 0;
  const failures = [];
  for (const record of records) {
    try {
      const response = await fetch(`${backendUrl}${BACKEND_WRITE_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(record),
      });
      if (!response.ok) {
        failures.push({
          text_sign: record.text_sign,
          status: response.status,
          reason:
            (await response.json().catch(() => null))?.data ?? "unknown error",
        });
        continue;
      }
      saved += 1;
    } catch (err) {
      failures.push({ text_sign: record.text_sign, reason: err.message });
    }
  }

  const error =
    failures.length > 0
      ? `Saved ${saved} of ${total}; failed: ${failures
          .map((f) => `${f.text_sign} (${f.reason})`)
          .join("; ")}`
      : null;

  return NextResponse.json({
    ok: saved > 0,
    saved,
    total,
    failures,
    error,
  });
}
