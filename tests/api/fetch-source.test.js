import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { POST } from "../../app/api/fetch-source/route.js";

function makeRequest(params) {
  return new Request("http://localhost/api/fetch-source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ETHERSCAN_API_KEY;
  delete process.env.ROUTESCAN_API_KEY;
});

describe("POST /api/fetch-source", () => {
  it("returns 400 when address is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing address/i);
  });

  it("returns 400 for invalid address", async () => {
    const res = await POST(makeRequest({ address: "not-an-address" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("returns source code from Etherscan with key", async () => {
    process.env.ETHERSCAN_API_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "1",
        result: [
          {
            SourceCode: "pragma solidity ^0.8.0;\ncontract Foo {}",
            CompilerVersion: "v0.8.0+commit.c7d74943",
          },
        ],
      }),
    });

    const res = await POST(
      makeRequest({
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        chain: "ethereum",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceCode).toEqual({
      "Contract.sol": "pragma solidity ^0.8.0;\ncontract Foo {}",
    });
    expect(body.compilerVersion).toBe("v0.8.0+commit.c7d74943");
    expect(body.source).toBe("etherscan");
  });

  it("falls back to Sourcify when Etherscan has no key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sources: { "Token.sol": { content: "contract Token {}" } },
        metadata: { compiler: { version: "0.8.19" } },
      }),
    });

    const res = await POST(
      makeRequest({
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        chain: "ethereum",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceCode).toEqual({ "Token.sol": "contract Token {}" });
    expect(body.compilerVersion).toBe("0.8.19");
    expect(body.source).toBe("sourcify");
  });

  it("returns 404 when no source is found", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 });

    const res = await POST(
      makeRequest({
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        chain: "ethereum",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for unsupported chain", async () => {
    const res = await POST(
      makeRequest({
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        chain: "unknown-chain",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported chain/i);
  });

  it("accepts numeric chain string (e.g. chain=480)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sources: { "Token.sol": { content: "contract Token {}" } },
        metadata: { compiler: { version: "0.8.19" } },
      }),
    });

    const res = await POST(
      makeRequest({
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        chain: "480",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("sourcify");
  });

  it("accepts chain- prefix format (e.g. chain=chain-480)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sources: { "Token.sol": { content: "contract Token {}" } },
        metadata: { compiler: { version: "0.8.19" } },
      }),
    });

    const res = await POST(
      makeRequest({
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        chain: "chain-480",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("sourcify");
  });
});
