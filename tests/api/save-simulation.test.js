import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../app/api/save-simulation/route.js";

vi.mock("../../app/utils/simulationCache.js", () => ({
  saveSimulationResult: vi.fn(),
  pruneExpiredResults: vi.fn(),
}));

import {
  saveSimulationResult,
  pruneExpiredResults,
} from "../../app/utils/simulationCache.js";

const FAKE_SIMULATION_ID = "vb1_fake-share-token";
const SIM_RESULT = {
  success: true,
  simulated: true,
  gasUsed: 63086,
  balanceChanges: [
    {
      address: "0xb826224b742ead5cf91ea432340e3763fac09cdd",
      tokenAddress: "0x0000000000000000000000000000000000000000",
      name: "ETH",
      amount: "-1",
      price: 2500,
      valueUsd: -2500,
      diff: "-1000000000000000000",
    },
  ],
  _tokenMeta: {
    tokenSymbols: {},
    tokenDecimals: {},
    tokenPrices: {
      "0x0000000000000000000000000000000000000000": 2500,
    },
  },
};

function makeRequest(body) {
  return { json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  saveSimulationResult.mockResolvedValue(FAKE_SIMULATION_ID);
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

  it("saves the simulation result and returns its id", async () => {
    const res = await POST(makeRequest(SIM_RESULT));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ simulationId: FAKE_SIMULATION_ID });
    expect(saveSimulationResult).toHaveBeenCalledWith(SIM_RESULT);
  });
});
