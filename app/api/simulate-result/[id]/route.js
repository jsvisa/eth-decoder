import { NextResponse } from "next/server";
import { getSimulationResult } from "../../../utils/simulationCache";

export async function GET(request, { params }) {
  const { id } = params;

  if (!id || typeof id !== "string" || id.length < 8) {
    return NextResponse.json(
      { error: "Invalid simulation ID" },
      { status: 400 },
    );
  }

  const data = await getSimulationResult(id);
  if (!data) {
    return NextResponse.json(
      { error: "Simulation result not found or expired" },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
