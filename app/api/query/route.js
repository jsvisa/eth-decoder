import { NextResponse } from "next/server";

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
    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("query error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to query signature" },
      { status: 500 },
    );
  }
}
