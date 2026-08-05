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
  return backendResponse(200, {
    saved: 0,
    total: 0,
    skipped: 0,
    rows: [],
    failures: [],
    ...data,
  });
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

  it("posts the ABI entries as a single array and reports saved count", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(
      backendWriteResult({
        saved: 2,
        total: 3,
        skipped: 1,
        rows: [],
        failures: [],
      }),
    );

    const res = await POST(
      makeRequest({
        abi: [TRANSFER, { type: "constructor" }, TRANSFER_EVENT],
        apiKey: "secret",
      }),
    );
    const body = await res.json();

    expect(body.saved).toBe(2);
    expect(body.total).toBe(3);
    expect(body.skipped).toBe(1);
    expect(body.failures).toEqual([]);
    expect(body.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [call] = global.fetch.mock.calls;
    expect(call[0]).toBe("https://backend.test/api/v1/write");
    expect(call[1].headers.authorization).toBe("Bearer secret");
    expect(call[1].headers["content-type"]).toBe("application/json");

    const sent = JSON.parse(call[1].body);
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual(TRANSFER);
    expect(sent[1].type).toBe("constructor");
    expect(sent[2]).toEqual(TRANSFER_EVENT);
  });

  it("reports failures when the backend rejects malformed entries", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(
      backendWriteResult({
        saved: 1,
        total: 2,
        skipped: 0,
        rows: [],
        failures: [{ index: 0, reason: "abi.name must be a non-empty string" }],
      }),
    );

    const res = await POST(
      makeRequest({ abi: [TRANSFER, TRANSFER_EVENT], apiKey: "secret" }),
    );
    const body = await res.json();

    expect(body.saved).toBe(1);
    expect(body.total).toBe(2);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].index).toBe(0);
    expect(body.error).toMatch(/Saved 1 of 2/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns an error when the backend rejects the upload", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValue(
      backendResponse(400, "entries array must not be empty"),
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
