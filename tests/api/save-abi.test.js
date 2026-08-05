import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../../app/api/save-abi/route.js";

function makeRequest(body) {
  return {
    json: async () => body,
  };
}

function backendResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ msg: data ? "ok" : "error", data }),
  };
}

function backendWriteResult(data) {
  return backendResponse(200, { saved: 0, total: 0, failures: [], ...data });
}

beforeEach(() => {
  delete process.env.BACKEND_URL;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/save-abi", () => {
  const TRANSFER = {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  };
  const TRANSFER_EVENT = {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  };

  it("returns an error when BACKEND_URL is missing", async () => {
    const res = await POST(makeRequest({ abi: [TRANSFER], apiKey: "secret" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns an error when the API key is missing", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const res = await POST(makeRequest({ abi: [TRANSFER] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/api key/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const res = await POST({
      json: async () => {
        throw new Error("bad json");
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid JSON/i);
  });

  it("posts all records as a single array and reports saved count", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(
      backendWriteResult({ saved: 2, total: 2, failures: [] }),
    );

    const res = await POST(
      makeRequest({ abi: [TRANSFER, TRANSFER_EVENT], apiKey: "secret" }),
    );
    const body = await res.json();

    expect(body.saved).toBe(2);
    expect(body.total).toBe(2);
    expect(body.failures).toEqual([]);
    expect(body.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [call] = global.fetch.mock.calls;
    expect(call[0]).toBe("https://backend.test/api/v1/write");
    expect(call[1].headers.authorization).toBe("Bearer secret");
    expect(call[1].headers["content-type"]).toBe("application/json");

    const sent = JSON.parse(call[1].body);
    expect(sent).toHaveLength(2);
    expect(sent[0].text_sign).toBe("transfer(address,uint256)");
    expect(sent[0].byte_sign).toBe("0xa9059cbb");
    expect(sent[0].abi).toEqual(TRANSFER);
    expect(sent[1].text_sign).toBe("Transfer(address,address,uint256)");
    expect(sent[1].byte_sign).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
  });

  it("skips non function/event ABI items", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(
      backendWriteResult({ saved: 1, total: 1, failures: [] }),
    );

    const res = await POST(
      makeRequest({
        abi: [TRANSFER, { type: "constructor" }],
        apiKey: "secret",
      }),
    );
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.saved).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent).toHaveLength(1);
  });

  it("reports failures when the backend skips invalid records", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(
      backendWriteResult({
        saved: 1,
        total: 2,
        failures: [
          {
            text_sign: "Transfer(address,address,uint256)",
            reason: "byte_sign must equal 0xabcdef12",
          },
        ],
      }),
    );

    const res = await POST(
      makeRequest({ abi: [TRANSFER, TRANSFER_EVENT], apiKey: "secret" }),
    );
    const body = await res.json();

    expect(body.saved).toBe(1);
    expect(body.total).toBe(2);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].text_sign).toBe(
      "Transfer(address,address,uint256)",
    );
    expect(body.error).toMatch(/Saved 1 of 2/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns an error when the backend rejects the upload", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(
      backendResponse(400, "byte_sign must equal 0xa9059cbb"),
    );

    const res = await POST(makeRequest({ abi: [TRANSFER], apiKey: "secret" }));
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.saved).toBe(0);
    expect(body.total).toBe(1);
    expect(body.error).toMatch(/Backend rejected upload/i);
  });

  it("returns an error when the backend is unreachable", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockRejectedValue(new Error("network down"));

    const res = await POST(makeRequest({ abi: [TRANSFER], apiKey: "secret" }));
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Failed to reach backend/i);
  });
});
