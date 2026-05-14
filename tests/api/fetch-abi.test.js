import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/fetch-abi/route.js";
import etherscanErc20 from "./__fixtures__/etherscan-erc20.json";
import etherscanUnverified from "./__fixtures__/etherscan-unverified.json";
import etherscanProxy from "./__fixtures__/etherscan-proxy.json";
import etherscanImpl from "./__fixtures__/etherscan-impl.json";
import sourcifyCheck from "./__fixtures__/sourcify-check.json";
import sourcifyFiles from "./__fixtures__/sourcify-files.json";

const VALID_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function makeRequest(params) {
  const url = new URL("http://localhost/api/fetch-abi");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

function mockFetch(responses) {
  const mock = vi.fn();
  for (const r of responses) {
    mock.mockResolvedValueOnce({ ok: true, json: async () => r });
  }
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  delete process.env.ETHERSCAN_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/fetch-abi", () => {
  it("returns 400 when the address param is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await GET(makeRequest({ apiKey: "test-key" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing address/i);
  });

  it("returns 400 when the address is not a valid Ethereum address", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await GET(
      makeRequest({ address: "not-an-address", apiKey: "test-key" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("returns 400 when no API key is provided and env var is not set", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await GET(makeRequest({ address: VALID_ADDRESS }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/api key/i);
  });

  it("returns ABI from Etherscan for a verified non-proxy contract", async () => {
    mockFetch([etherscanErc20]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, apiKey: "test-key" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.abi).toBeDefined();
    expect(body.abi.length).toBeGreaterThan(0);
    expect(body.isProxy).toBe(false);
    expect(body.contractName).toBe("ERC20");
  });

  it("falls back to Sourcify when Etherscan returns an unverified ABI", async () => {
    mockFetch([etherscanUnverified, sourcifyCheck, sourcifyFiles]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, apiKey: "test-key" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.abi).toBeDefined();
    expect(body.abi.length).toBeGreaterThan(0);
    // ABI from sourcify-files.json fixture has the 'decimals' function
    expect(body.abi.some((item) => item.name === "decimals")).toBe(true);
  });

  it("detects a proxy via Etherscan and returns merged proxy + implementation ABI", async () => {
    // Call 1: fetch proxy contract info → Proxy: "1" with Implementation address
    // Call 2: fetch implementation contract info
    mockFetch([etherscanProxy, etherscanImpl]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, apiKey: "test-key" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isProxy).toBe(true);
    expect(body.implAddress).toBe("0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC");
    expect(body.contractName).toBe("TransparentUpgradeableProxy");

    const fnNames = body.abi.map((item) => item.name);
    expect(fnNames).toContain("upgradeTo"); // from proxy ABI
    expect(fnNames).toContain("transfer"); // from implementation ABI
    expect(body.implContractName).toBe("ERC20Implementation");
  });

  it("returns 400 when both Etherscan and Sourcify fail", async () => {
    const failFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" }) // Etherscan
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }); // Sourcify check
    vi.stubGlobal("fetch", failFetch);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, apiKey: "test-key" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch abi/i);
  });
});
