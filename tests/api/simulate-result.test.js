import { describe, it, expect, vi } from "vitest";
import { GET } from "../../app/api/simulate-result/[id]/route.js";

vi.mock("../../app/utils/simulationCache.js", () => ({
  getSimulationResult: vi.fn(),
}));

import { getSimulationResult } from "../../app/utils/simulationCache.js";

const MOCK_RESULT = {
  success: true,
  simulated: true,
  gasUsed: 63086,
};

describe("GET /api/simulate-result/:id", () => {
  it("returns 400 when id is too short", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: { id: "short" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid simulation id/i);
  });

  it("returns 400 when id is empty", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: { id: "" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when simulation result is not found", async () => {
    getSimulationResult.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), {
      params: { id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found or expired/i);
  });

  it("returns cached data on success", async () => {
    getSimulationResult.mockResolvedValue(MOCK_RESULT);
    const res = await GET(new Request("http://localhost"), {
      params: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(MOCK_RESULT);
  });
});
