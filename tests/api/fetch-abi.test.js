import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/fetch-abi/route.js";
import etherscanErc20 from "./__fixtures__/etherscan-erc20.json";
import etherscanProxy from "./__fixtures__/etherscan-proxy.json";
import etherscanImpl from "./__fixtures__/etherscan-impl.json";
import sourcifyV2 from "./__fixtures__/sourcify-v2.json";
import { keccak256, toHex } from "viem";

const VALID_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DIAMOND_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const FACET1 = "0x1111111111111111111111111111111111111111";
const FACET2 = "0x2222222222222222222222222222222222222222";

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

// Stub global.fetch to route JSON-RPC POSTs (viem) to rpcHandlers and all other
// requests (Etherscan getsourcecode) to etherscanByAddress keyed by lowercase address.
function mockFetchWithRpc(rpcHandlers, etherscanByAddress) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url, options) => {
      if (options && options.body) {
        const body = JSON.parse(options.body);
        const reqs = Array.isArray(body) ? body : [body];
        const responses = reqs.map((req) => {
          const handler = rpcHandlers[req.method];
          return handler
            ? { jsonrpc: "2.0", id: req.id, result: handler(req) }
            : {
                jsonrpc: "2.0",
                id: req.id,
                error: { code: -32601, message: "Method not found" },
              };
        });
        const responseData = Array.isArray(body) ? responses : responses[0];
        return {
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => responseData,
        };
      }
      const address = new URL(url).searchParams.get("address").toLowerCase();
      const info = etherscanByAddress[address];
      return { ok: true, json: async () => info };
    }),
  );
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

  it("returns 400 when the custom rpcUrl is not an http(s) URL", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await GET(
      makeRequest({
        address: VALID_ADDRESS,
        chain: "custom-chain",
        chainId: "100",
        rpcUrl: "file:///etc/passwd",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/rpcUrl/i);
  });

  it("falls back to RouteScan without a key when Etherscan is skipped and Sourcify has no match", async () => {
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

  it("returns ABI from Sourcify when not verified on Etherscan", async () => {
    // {} → Etherscan: no abi/status → null; sourcifyV2 → Sourcify: success
    mockFetch([{}, sourcifyV2]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, etherscanApiKey: "test-key" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.abi).toBeDefined();
    expect(body.abi.length).toBeGreaterThan(0);
    expect(body.abi.some((item) => item.name === "decimals")).toBe(true);
  });

  it("uses Etherscan directly when it has the contract verified", async () => {
    // Etherscan succeeds first (Sourcify/RouteScan never consulted)
    mockFetch([etherscanErc20]);

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, etherscanApiKey: "test-key" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.abi).toBeDefined();
    expect(body.abi.length).toBeGreaterThan(0);
    expect(body.isProxy).toBe(false);
    expect(body.contractName).toBe("ERC20");
    expect(body.source).toBe("etherscan");
  });

  it("detects a proxy via Etherscan and returns merged proxy + implementation ABI", async () => {
    // Etherscan proxy info, then Etherscan impl info (Sourcify/RouteScan never consulted)
    mockFetch([etherscanProxy, etherscanImpl]);

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
    expect(body.source).toBe("etherscan");
    expect(body.implSource).toBe("etherscan");
  });

  it("detects a diamond proxy and merges all facet ABIs", async () => {
    const diamondEtherscan = {
      status: "1",
      message: "OK",
      result: [
        {
          ABI: JSON.stringify([
            {
              type: "function",
              name: "facets",
              inputs: [],
              outputs: [],
              stateMutability: "view",
            },
          ]),
          ContractName: "DiamondProxy",
          Proxy: "1",
          Implementation: "",
        },
      ],
    };
    const facet1Etherscan = {
      status: "1",
      message: "OK",
      result: [
        {
          ABI: JSON.stringify([
            {
              type: "function",
              name: "mint",
              inputs: [],
              outputs: [],
              stateMutability: "nonpayable",
            },
          ]),
          ContractName: "MintFacet",
          Proxy: "0",
          Implementation: "",
        },
      ],
    };
    const facet2Etherscan = {
      status: "1",
      message: "OK",
      result: [
        {
          ABI: JSON.stringify([
            {
              type: "function",
              name: "burn",
              inputs: [],
              outputs: [],
              stateMutability: "nonpayable",
            },
          ]),
          ContractName: "BurnFacet",
          Proxy: "0",
          Implementation: "",
        },
      ],
    };

    // facetAddresses() -> address[]: offset, length, then two padded addresses
    const pad = (addr) => "000000000000000000000000" + addr.slice(2);
    const encodedFacets =
      "0x" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000002" +
      pad(FACET1) +
      pad(FACET2);

    const zeroSlot =
      "0x0000000000000000000000000000000000000000000000000000000000000000";

    // standard DiamondStorage.facetAddresses array: length slot + element slots
    const storageSlot = BigInt(
      keccak256(toHex("diamond.standard.diamond.storage")),
    );
    const arrSlot = toHex(storageSlot + 2n, { size: 32 });
    const elementBase = BigInt(
      keccak256(toHex(storageSlot + 2n, { size: 32 })),
    );
    const len2 = "0x" + 2n.toString(16).padStart(64, "0");

    mockFetchWithRpc(
      {
        eth_getStorageAt: (req) => {
          const slot = req.params[1];
          if (slot === arrSlot) return len2; // facet array length
          if (slot === toHex(elementBase, { size: 32 })) return pad(FACET1);
          if (slot === toHex(elementBase + 1n, { size: 32 }))
            return pad(FACET2);
          return zeroSlot;
        },
        eth_getCode: () => "0x",
        eth_call: (req) => {
          const data = req.params[0].data;
          if (data === "0x52ef6b2c") return encodedFacets; // facetAddresses()
          return "0x";
        },
      },
      {
        [DIAMOND_ADDRESS.toLowerCase()]: diamondEtherscan,
        [FACET1.toLowerCase()]: facet1Etherscan,
        [FACET2.toLowerCase()]: facet2Etherscan,
      },
    );

    const res = await GET(
      makeRequest({
        address: DIAMOND_ADDRESS,
        chain: "ethereum",
        rpcUrl: "https://eth.llamarpc.com",
        etherscanApiKey: "test-key",
        detectProxy: "true",
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isProxy).toBe(true);
    expect(body.isDiamond).toBe(true);
    expect(body.contractName).toBe("DiamondProxy");
    expect(body.facetAddresses).toEqual([FACET1, FACET2]);

    const fnNames = body.abi.map((item) => item.name);
    expect(fnNames).toContain("facets"); // from diamond's own ABI
    expect(fnNames).toContain("mint"); // from facet 1
    expect(fnNames).toContain("burn"); // from facet 2
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
