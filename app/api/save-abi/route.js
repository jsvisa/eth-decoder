import { NextResponse } from "next/server";

const BACKEND_WRITE_PATH = "/api/v1/write";

export async function POST(request) {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    return NextResponse.json(
      {
        ok: false,
        saved: 0,
        total: 0,
        skipped: 0,
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
        skipped: 0,
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
        skipped: 0,
        error: "Backend API key is not configured",
      },
      { status: 500 },
    );
  }

  const entries = Array.isArray(body?.abi) ? body.abi : [];

  let response;
  try {
    response = await fetch(`${backendUrl}${BACKEND_WRITE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(entries),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      saved: 0,
      skipped: 0,
      total: entries.length,
      error: `Failed to reach backend: ${err.message}`,
    });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const reason = data?.data ?? `HTTP ${response.status}`;
    return NextResponse.json({
      ok: false,
      saved: 0,
      skipped: 0,
      total: entries.length,
      error: `Backend rejected upload: ${reason}`,
    });
  }

  const result = data?.data ?? {};
  const saved = result.saved ?? 0;
  const total = result.total ?? entries.length;
  const skipped = result.skipped ?? 0;
  const failures = Array.isArray(result.failures) ? result.failures : [];

  const error =
    failures.length > 0
      ? `Saved ${saved} of ${total}${skipped ? ` (${skipped} skipped)` : ""}; failed: ${failures
          .map((f) => `entry ${f.index} (${f.reason})`)
          .join("; ")}`
      : null;

  return NextResponse.json({
    ok: saved > 0,
    saved,
    total,
    skipped,
    failures,
    error,
  });
}
