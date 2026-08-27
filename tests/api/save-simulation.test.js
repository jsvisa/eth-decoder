import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../app/api/save-simulation/route.js";

vi.mock("../../app/utils/simulationCache.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    SimulationPayloadTooLargeError: actual.SimulationPayloadTooLargeError,
    saveSimulationResult: vi.fn(),
    pruneExpiredResults: vi.fn(),
  };
});

import {
  saveSimulationResult,
  pruneExpiredResults,
  SimulationPayloadTooLargeError,
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
      value: "-1000000000000000000",
      amount: "-1",
      price: 2500,
      valueUsd: -2500,
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
  return {
    url: "https://eth-decoder.vercel.app/api/save-simulation",
    json: async () => body,
  };
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
    expect(await res.json()).toEqual({
      simulationId: FAKE_SIMULATION_ID,
      simulationLink: `https://eth-decoder.vercel.app/?simulationId=${FAKE_SIMULATION_ID}`,
    });
    expect(saveSimulationResult).toHaveBeenCalledWith(SIM_RESULT);
  });
});

describe("POST /api/save-simulation — size cap", () => {
  it("returns 413 when the payload exceeds the 2MB limit", async () => {
    vi.mocked(saveSimulationResult).mockRejectedValue(
      new SimulationPayloadTooLargeError(2 * 1024 * 1024),
    );

    const res = await POST(
      makeRequest({ success: true, huge: "x".repeat(100) }),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/maximum allowed size \(2MB\)/);
    expect(body.simulationId).toBeUndefined();
  });

  it("returns a generic 500 (no internals) when saving fails unexpectedly", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(saveSimulationResult).mockRejectedValue(
      new Error("disk on fire /tmp secret details"),
    );
    try {
      const res = await POST(makeRequest({ success: true }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to save simulation");
      expect(body.error).not.toMatch(/disk on fire/);
      errSpy.mockRestore();
    } finally {
      errSpy.mockRestore();
    }
  });
});
