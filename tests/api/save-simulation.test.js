import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../app/api/save-simulation/route.js";

vi.mock("../../app/utils/simulationCache.js", () => ({
  createShareableSimulationId: vi.fn(),
  pruneExpiredResults: vi.fn(),
}));

import {
  createShareableSimulationId,
  pruneExpiredResults,
} from "../../app/utils/simulationCache.js";

const FAKE_SIMULATION_ID = "z1_fake-share-token";
const SIM_RESULT = {
  success: true,
  simulated: true,
  gasUsed: 63086,
};

function makeRequest(body) {
  return { json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  createShareableSimulationId.mockResolvedValue(FAKE_SIMULATION_ID);
  pruneExpiredResults.mockResolvedValue(0);
});

describe("POST /api/save-simulation", () => {
  it("returns 400 for invalid JSON", async () => {
    const res = await POST({
      json: async () => {
        throw new Error("Unexpected token");
      },
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid json/i);
  });

  it("returns 400 when the body is not an object", async () => {
    const res = await POST(makeRequest(null));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/json object/i);
  });

  it("creates a shareable simulation id", async () => {
    const res = await POST(makeRequest(SIM_RESULT));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ simulationId: FAKE_SIMULATION_ID });
    expect(createShareableSimulationId).toHaveBeenCalledWith(SIM_RESULT);
  });
});
