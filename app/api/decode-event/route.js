import { NextResponse } from "next/server";
import { decodeEventWithCandidates } from "../../utils/decodeWithCandidates.js";

export async function GET(request) {
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

  const decoded = await decodeEventWithCandidates(sign, topics, data);
  if (!decoded) {
    return NextResponse.json({ msg: "not found", data: null });
  }

  return NextResponse.json({ msg: "ok", data: decoded });
}
