import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/fetch-abi/route.js";
import etherscanErc20 from "./__fixtures__/etherscan-erc20.json";
import etherscanProxy from "./__fixtures__/etherscan-proxy.json";
import etherscanImpl from "./__fixtures__/etherscan-impl.json";
import sourcifyV2 from "./__fixtures__/sourcify-v2.json";

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
  delete process.env.ROUTESCAN_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/fetch-abi", () => {
  it("returns 400 when the address param is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await GET(makeRequest({ etherscanApiKey: "test-key" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing address/i);
  });

  it("returns 400 when the address is not a valid Ethereum address", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await GET(
      makeRequest({ address: "not-an-address", etherscanApiKey: "test-key" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("falls back to RouteScan without a key when Sourcify has no match", async () => {
    // No apiKey → Etherscan is skipped; Sourcify fails; RouteScan (keyless) succeeds
    mockFetch([
      { status: "404" }, // Sourcify
      etherscanErc20, // RouteScan (keyless)
    ]);
    const res = await GET(makeRequest({ address: VALID_ADDRESS }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.abi).toBeDefined();
  });

  it("returns ABI from Sourcify when verified there", async () => {
    mockFetch([sourcifyV2]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, etherscanApiKey: "test-key" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.abi).toBeDefined();
    expect(body.abi.length).toBeGreaterThan(0);
    expect(body.abi.some((item) => item.name === "decimals")).toBe(true);
  });

  it("falls back to Etherscan when Sourcify has no match", async () => {
    // {} → Sourcify: no abi field → null; etherscanErc20 → Etherscan: success
    mockFetch([{}, etherscanErc20]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, etherscanApiKey: "test-key" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.abi).toBeDefined();
    expect(body.abi.length).toBeGreaterThan(0);
    expect(body.isProxy).toBe(false);
    expect(body.contractName).toBe("ERC20");
  });

  it("detects a proxy via Etherscan and returns merged proxy + implementation ABI", async () => {
    // Sourcify miss for proxy, Etherscan proxy info, Sourcify miss for impl, Etherscan impl info
    mockFetch([{}, etherscanProxy, {}, etherscanImpl]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, etherscanApiKey: "test-key" }),
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
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }) // Sourcify
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" }) // Etherscan
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }); // RouteScan
    vi.stubGlobal("fetch", failFetch);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, etherscanApiKey: "test-key" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch abi/i);
  });
});
