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

  it("posts records for each function/event and reports saved count", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(backendResponse(200, { pkey: "0xabc" }));

    const res = await POST(
      makeRequest({ abi: [TRANSFER, TRANSFER_EVENT], apiKey: "secret" }),
    );
    const body = await res.json();

    expect(body.saved).toBe(2);
    expect(body.total).toBe(2);
    expect(body.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const [call] = global.fetch.mock.calls;
    expect(call[0]).toBe("https://backend.test/api/v1/write");
    expect(call[1].headers.authorization).toBe("Bearer secret");
    expect(call[1].headers["content-type"]).toBe("application/json");

    const firstBody = JSON.parse(call[1].body);
    expect(firstBody.text_sign).toBe("transfer(address,uint256)");
    expect(firstBody.byte_sign).toBe("0xa9059cbb");
    expect(firstBody.abi).toEqual(TRANSFER);

    const [, secondCall] = global.fetch.mock.calls;
    const secondBody = JSON.parse(secondCall[1].body);
    expect(secondBody.text_sign).toBe("Transfer(address,address,uint256)");
    expect(secondBody.byte_sign).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
  });

  it("skips non function/event ABI items", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(backendResponse(200, {}));

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
  });

  it("reports failures when the backend rejects a record", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce(backendResponse(200, {}))
      .mockResolvedValueOnce(
        backendResponse(400, "byte_sign must equal 0xabcdef12"),
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
  });
});
