// tests/api/decode-event.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/decode-event/route.js";
import {
  serverCacheTestDir,
  resetServerCacheTestDir,
  removeServerCacheTestDir,
} from "../utils/serverCacheTestEnv.js";

const CACHE_DIR = serverCacheTestDir("decode-event");

// Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_TOPIC1 =
  "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const TRANSFER_TOPIC2 =
  "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const TRANSFER_DATA =
  "0x00000000000000000000000000000000000000000000000000000000000f4240";
const ALL_TOPICS = [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2].join(
  ",",
);

function makeRequest(params) {
  const url = new URL("http://localhost/api/decode-event");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

function backendResponse(rows) {
  return { ok: true, json: async () => ({ msg: "ok", data: rows }) };
}

function backendNotFound() {
  return { ok: true, json: async () => ({ msg: "not found", data: null }) };
}

function sourcifyEventResponse(topic0, names) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        event: { [topic0]: names.map((n) => ({ name: n, filtered: false })) },
      },
    }),
  };
}

beforeEach(async () => {
  process.env.CACHE_DIR = CACHE_DIR;
  await resetServerCacheTestDir(CACHE_DIR);
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.CACHE_DIR;
  await removeServerCacheTestDir(CACHE_DIR);
});

describe("GET /api/decode-event", () => {
  it("returns 400 when sign param is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing sign/i);
  });

  it("decodes via Sourcify when BACKEND_URL is not set", async () => {
    global.fetch.mockResolvedValueOnce(
      sourcifyEventResponse(TRANSFER_TOPIC0, [
        "Transfer(address,address,uint256)",
      ]),
    );

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
    expect(body.data.inputs).toHaveLength(3);
  });

  it("prefers a DB candidate over Sourcify when both match", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const abi = {
      type: "event",
      name: "Transfer",
      anonymous: false,
      inputs: [
        { name: "from", type: "address", indexed: true },
        { name: "to", type: "address", indexed: true },
        { name: "value", type: "uint256", indexed: false },
      ],
    };
    global.fetch
      .mockResolvedValueOnce(
        backendResponse([
          {
            text_sign: "Transfer(address,address,uint256)",
            abi: JSON.stringify(abi),
          },
        ]),
      )
      .mockResolvedValueOnce(
        sourcifyEventResponse(TRANSFER_TOPIC0, [
          "Transfer(address,address,uint256)",
        ]),
      );

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    const body = await res.json();
    expect(body.data.source).toBe("cfd1");
    expect(body.data.args.from.toLowerCase()).toBe(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
    expect(body.data.inputs).toEqual(abi.inputs);
  });

  it("skips a DB candidate whose indexed count doesn't match the topics", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const wrongAbi = {
      type: "event",
      name: "Transfer",
      anonymous: false,
      inputs: [
        { name: "from", type: "address", indexed: false },
        { name: "to", type: "address", indexed: false },
        { name: "value", type: "uint256", indexed: false },
      ],
    };
    global.fetch
      .mockResolvedValueOnce(
        backendResponse([
          {
            text_sign: "Transfer(address,address,uint256)",
            abi: JSON.stringify(wrongAbi),
          },
        ]),
      )
      .mockResolvedValueOnce(
        sourcifyEventResponse(TRANSFER_TOPIC0, [
          "Transfer(address,address,uint256)",
        ]),
      );

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    const body = await res.json();
    expect(body.data.source).toBe("sourcify");
  });

  it("returns not found when nothing decodes", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce(backendNotFound())
      .mockResolvedValueOnce(sourcifyEventResponse(TRANSFER_TOPIC0, []));

    const res = await GET(
      makeRequest({
        sign: TRANSFER_TOPIC0,
        topics: ALL_TOPICS,
        data: TRANSFER_DATA,
      }),
    );
    const body = await res.json();
    expect(body.msg).toBe("not found");
    expect(body.data).toBeNull();
  });
});
