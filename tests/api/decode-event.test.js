import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/decode-event/route.js";

// Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_TOPIC1 =
  "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const TRANSFER_TOPIC2 =
  "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const TRANSFER_DATA =
  "0x00000000000000000000000000000000000000000000000000000000000f4240";
// comma-joined topics including topic0 (as sent by the frontend)
const ALL_TOPICS = [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2].join(
  ",",
);

const SOURCIFY_TRANSFER_EVENT_RESPONSE = {
  ok: true,
  result: {
    event: {
      [TRANSFER_TOPIC0]: [
        { name: "Transfer(address,address,uint256)", filtered: false },
      ],
    },
    function: {},
  },
};

function makeRequest(params) {
  const url = new URL("http://localhost/api/decode-event");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
});

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/decode-event — basics", () => {
  it("returns 500 when BACKEND_URL is not set", async () => {
    const res = await GET(makeRequest({ sign: TRANSFER_TOPIC0 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/backend_url/i);
  });

  it("returns 400 when sign param is missing", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sign/i);
  });

  it("returns backend result when backend succeeds", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const mockResult = { msg: "ok", data: { event: "Transfer", args: {} } };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockResult);
  });
});

describe("GET /api/decode-event — Sourcify fallback", () => {
  it("returns decoded event from Sourcify when backend returns non-OK", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SOURCIFY_TRANSFER_EVENT_RESPONSE,
    });

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data.event).toBe("Transfer");
    expect(body.data.source).toBe("sourcify");
  });

  it("returns decoded event from Sourcify when backend returns msg !== ok", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "not found" }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SOURCIFY_TRANSFER_EVENT_RESPONSE,
    });

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data.event).toBe("Transfer");
    expect(body.data.source).toBe("sourcify");
    // serialized as strings, not BigInt
    expect(body.data.args.arg2).toBe("1000000");
  });

  it("returns original backend response when Sourcify also has no match", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "not found" }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { event: { [TRANSFER_TOPIC0]: [] }, function: {} },
      }),
    });

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("not found");
  });

  it("returns 500 when backend non-OK and Sourcify also has no match", async () => {
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
        result: { event: { [TRANSFER_TOPIC0]: [] }, function: {} },
      }),
    });

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    expect(res.status).toBe(500);
  });
});
