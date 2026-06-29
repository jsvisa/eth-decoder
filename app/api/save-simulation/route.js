import { NextResponse } from "next/server";
import {
  createShareableSimulationId,
  pruneExpiredResults,
} from "../../utils/simulationCache";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  pruneExpiredResults().catch(() => {});

  try {
    const simulationId = await createShareableSimulationId(body);
    return NextResponse.json({ simulationId });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save simulation: ${error.message}` },
      { status: 500 },
    );
  }
}
