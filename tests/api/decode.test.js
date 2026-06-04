import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/decode/route.js";

// transfer(address,uint256) — selector 0xa9059cbb
const TRANSFER_CALLDATA =
  "0xa9059cbb" +
  "000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" +
  "00000000000000000000000000000000000000000000000000000000000f4240";

const OPENCHAIN_TRANSFER_RESPONSE = {
  ok: true,
  result: {
    function: {
      "0xa9059cbb": [{ name: "transfer(address,uint256)", filtered: false }],
    },
    event: {},
  },
};

function makeRequest(params) {
  const url = new URL("http://localhost/api/decode");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/decode", () => {
  it("returns 400 when the data param is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing data/i);
  });

  it("returns 500 when BACKEND_URL env var is not set", async () => {
    const res = await GET(makeRequest({ data: "0x12345678" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/backend url/i);
  });

  it("forwards data, with_abi, with_sign params to the backend (multicall not forwarded)", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const mockResult = { function: "transfer", params: [] };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const res = await GET(
      makeRequest({
        data: "0x12345678",
        with_abi: "true",
        with_sign: "false",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockResult);

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("data=0x12345678");
    expect(calledUrl).not.toContain("multicall");
    expect(calledUrl).toContain("with_abi=true");
    expect(calledUrl).toContain("with_sign=false");
  });

  it("returns 500 with an error message when the backend returns a non-OK status and OpenChain has no match", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { function: { "0x12345678": [] }, event: {} },
      }),
    });

    const res = await GET(makeRequest({ data: "0x12345678" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe("GET /api/decode — OpenChain fallback", () => {
  it("returns decoded result from OpenChain when backend returns non-OK", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => OPENCHAIN_TRANSFER_RESPONSE,
    });

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    expect(body.data[0].source).toBe("openchain");
  });

  it("returns decoded result from OpenChain when backend returns empty data array (real behavior)", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "ok", data: [] }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => OPENCHAIN_TRANSFER_RESPONSE,
    });

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    expect(body.data[0].source).toBe("openchain");
  });

  it("returns decoded result from OpenChain when backend returns msg !== ok", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "not found" }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => OPENCHAIN_TRANSFER_RESPONSE,
    });

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    expect(body.data[0].source).toBe("openchain");
  });

  it("returns the original backend response when OpenChain also has no match", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "ok", data: [] }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { function: { "0xa9059cbb": [] }, event: {} },
      }),
    });

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data).toEqual([]);
  });
});

// Minimal ABI with just the transfer function (named params)
const SOURCIFY_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

function sourcifyCheckResponse(address, chainId) {
  return {
    ok: true,
    json: async () => [
      { address, chainIds: [{ chainId: String(chainId), status: "perfect" }] },
    ],
  };
}

function sourcifyFilesResponse(abi) {
  return {
    ok: true,
    json: async () => ({
      files: [
        {
          name: "metadata.json",
          content: JSON.stringify({
            output: { abi },
            settings: { compilationTarget: { "Token.sol": "Token" } },
          }),
        },
      ],
    }),
  };
}

describe("GET /api/decode — Sourcify ABI path", () => {
  it("decodes with named params from Sourcify when address is provided", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      // 1. backend returns empty
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ msg: "ok", data: [] }),
      })
      // 2. Sourcify check-by-addresses
      .mockResolvedValueOnce(
        sourcifyCheckResponse("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 1),
      )
      // 3. Sourcify files
      .mockResolvedValueOnce(sourcifyFilesResponse(SOURCIFY_TRANSFER_ABI));

    const res = await GET(
      makeRequest({
        data: TRANSFER_CALLDATA,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    // Named params from Sourcify ABI instead of generic arg0/arg1
    expect(body.data[0].args.recipient).toBeDefined();
    expect(body.data[0].args.amount).toBe("1000000");
    expect(body.data[0].source).toBe("sourcify");
  });

  it("falls back to OpenChain when Sourcify has no match for the address", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      // 1. backend empty
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ msg: "ok", data: [] }),
      })
      // 2. Sourcify check — no match
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ address: "0xa0b...", chainIds: [] }],
      })
      // 3. Etherscan — no ABI
      .mockResolvedValueOnce({ ok: false })
      // 4. OpenChain
      .mockResolvedValueOnce({
        ok: true,
        json: async () => OPENCHAIN_TRANSFER_RESPONSE,
      });

    const res = await GET(
      makeRequest({
        data: TRANSFER_CALLDATA,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    expect(body.data[0].source).toBe("openchain");
  });
});
