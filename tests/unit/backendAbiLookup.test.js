// tests/unit/backendAbiLookup.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lookupFunctionCandidates,
  lookupEventCandidates,
} from "../../app/utils/backendAbiLookup.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
});

afterEach(() => vi.unstubAllGlobals());

describe("lookupFunctionCandidates", () => {
  it("returns an empty array when BACKEND_URL is not set", async () => {
    expect(await lookupFunctionCandidates("0xa9059cbb")).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns the data array on success", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const rows = [{ text_sign: "transfer(address,uint256)", abi: "{}" }];
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "ok", data: rows }),
    });

    expect(await lookupFunctionCandidates("0xa9059cbb")).toEqual(rows);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("backend.test/api/v1/query");
    expect(calledUrl).toContain("sign=0xa9059cbb");
  });

  it("returns an empty array when the response is not ok", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await lookupFunctionCandidates("0xa9059cbb")).toEqual([]);
  });

  it("returns an empty array when msg is not ok", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "not found", data: null }),
    });
    expect(await lookupFunctionCandidates("0xa9059cbb")).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockRejectedValueOnce(new Error("network error"));
    expect(await lookupFunctionCandidates("0xa9059cbb")).toEqual([]);
  });
});

describe("lookupEventCandidates", () => {
  const TOPIC0 =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  it("returns an empty array when BACKEND_URL is not set", async () => {
    expect(await lookupEventCandidates(TOPIC0)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns the data array on success", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const rows = [
      { text_sign: "Transfer(address,address,uint256)", abi: "{}" },
    ];
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "ok", data: rows }),
    });

    expect(await lookupEventCandidates(TOPIC0)).toEqual(rows);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("backend.test/api/v1/query-event");
    expect(calledUrl).toContain(`sign=${TOPIC0}`);
  });

  it("returns an empty array when fetch throws", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockRejectedValueOnce(new Error("network error"));
    expect(await lookupEventCandidates(TOPIC0)).toEqual([]);
  });
});
