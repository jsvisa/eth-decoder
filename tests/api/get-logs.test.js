import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/get-logs/route.js";
import { BUILT_IN_CHAIN_IDS } from "../../app/utils/chains.js";

const VALID_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function makeRequest(query) {
  return new Request(`http://localhost:3000/api/get-logs${query}`);
}

function stubFetchEtherscan(
  payload = { status: "1", message: "OK", result: [] },
) {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => payload });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GET /api/get-logs", () => {
  const origEnvKey = process.env.ETHERSCAN_API_KEY;

  beforeEach(() => {
    // Success-path tests below send no etherscanApiKey query param and rely
    // on the env fallback. Pin it explicitly — the ambient key comes from a
    // local .env (loaded by vitest.config) that does not exist in CI.
    process.env.ETHERSCAN_API_KEY = "test-env-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (origEnvKey === undefined) delete process.env.ETHERSCAN_API_KEY;
    else process.env.ETHERSCAN_API_KEY = origEnvKey;
  });

  describe("address validation", () => {
    it("returns 400 when address is missing", async () => {
      const res = await GET(makeRequest("?chain=ethereum"));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid address" });
    });

    it.each([
      ["not an address at all", "?address=hello"],
      ["too short hex", "?address=0x1234"],
      ["wrong length (39 chars)", `?address=0x${"a".repeat(39)}`],
      ["non-hex characters", `?address=0x${"z".repeat(40)}`],
    ])("returns 400 for %s", async (_label, query) => {
      const res = await GET(makeRequest(query));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid address" });
    });

    it("accepts a valid mixed-case address", async () => {
      stubFetchEtherscan();

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));

      expect(res.status).toBe(200);
    });
  });

  describe("chain resolution", () => {
    it("rejects chains that have no built-in id and no chainId param", async () => {
      const res = await GET(
        makeRequest(`?address=${VALID_ADDRESS}&chain=mars`),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Unsupported chain" });
    });

    it("defaults to ethereum when no chain is specified", async () => {
      const fetchMock = stubFetchEtherscan();

      await GET(makeRequest(`?address=${VALID_ADDRESS}`));

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get("chainid")).toBe(
        String(BUILT_IN_CHAIN_IDS.ethereum),
      );
    });

    it.each(Object.keys(BUILT_IN_CHAIN_IDS))(
      "resolves built-in chain %s",
      async (chain) => {
        const fetchMock = stubFetchEtherscan();

        const res = await GET(
          makeRequest(`?address=${VALID_ADDRESS}&chain=${chain}`),
        );

        expect(res.status).toBe(200);
        const calledUrl = new URL(fetchMock.mock.calls[0][0]);
        expect(calledUrl.searchParams.get("chainid")).toBe(
          String(BUILT_IN_CHAIN_IDS[chain]),
        );
      },
    );

    it("prefers an explicit chainId over a named chain", async () => {
      const fetchMock = stubFetchEtherscan();

      await GET(
        makeRequest(`?address=${VALID_ADDRESS}&chain=ethereum&chainId=999`),
      );

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get("chainid")).toBe("999");
    });
  });

  describe("API key resolution", () => {
    it("returns 400 when neither query key nor env key exist", async () => {
      delete process.env.ETHERSCAN_API_KEY;

      const res = await GET(
        makeRequest(`?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=`),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "API key required" });
    });

    it("uses the env var when no query key is supplied", async () => {
      process.env.ETHERSCAN_API_KEY = "env-key";
      const fetchMock = stubFetchEtherscan();

      await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get("apikey")).toBe("env-key");
    });

    it("prefers the query-param key over the env var", async () => {
      process.env.ETHERSCAN_API_KEY = "env-key";
      const fetchMock = stubFetchEtherscan();

      await GET(
        makeRequest(
          `?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=query-key`,
        ),
      );

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get("apikey")).toBe("query-key");
    });
  });

  describe("request passthrough to Etherscan", () => {
    it("sets module/action defaults", async () => {
      const fetchMock = stubFetchEtherscan();

      await GET(
        makeRequest(`?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=k`),
      );

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.pathname).toBe("/v2/api");
      expect(calledUrl.searchParams.get("module")).toBe("logs");
      expect(calledUrl.searchParams.get("action")).toBe("getLogs");
      expect(calledUrl.searchParams.get("address")).toBe(VALID_ADDRESS);
    });

    it("applies block/page/offset defaults", async () => {
      const fetchMock = stubFetchEtherscan();

      await GET(
        makeRequest(`?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=k`),
      );

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get("fromBlock")).toBe("0");
      expect(calledUrl.searchParams.get("toBlock")).toBe("latest");
      expect(calledUrl.searchParams.get("page")).toBe("1");
      expect(calledUrl.searchParams.get("offset")).toBe("1000");
    });

    it.each([
      ["2000", "1000"], // capped
      ["250", "250"], // preserved
      ["abc", "NaN"], // parseInt yields NaN -> stringified
    ])("caps offset %p to %p", async (requested, sent) => {
      const fetchMock = stubFetchEtherscan();

      await GET(
        makeRequest(
          `?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=k&offset=${requested}`,
        ),
      );

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get("offset")).toBe(sent);
    });

    it("omits topic0 unless provided; includes it when given", async () => {
      const withoutTopic = stubFetchEtherscan();
      await GET(
        makeRequest(`?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=k`),
      );
      expect(
        new URL(withoutTopic.mock.calls[0][0]).searchParams.has("topic0"),
      ).toBe(false);

      const withTopic = stubFetchEtherscan();
      await GET(
        makeRequest(
          `?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=k&topic0=${TRANSFER_TOPIC}`,
        ),
      );
      expect(
        new URL(withTopic.mock.calls[0][0]).searchParams.get("topic0"),
      ).toBe(TRANSFER_TOPIC);
    });

    it("forwards fromBlock/toBlock values verbatim", async () => {
      const fetchMock = stubFetchEtherscan();

      await GET(
        makeRequest(
          `?address=${VALID_ADDRESS}&chainId=1&etherscanApiKey=k&fromBlock=18000000&toBlock=18000100`,
        ),
      );

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get("fromBlock")).toBe("18000000");
      expect(calledUrl.searchParams.get("toBlock")).toBe("18000100");
    });
  });

  describe("upstream response handling", () => {
    it("passes successful results through unchanged", async () => {
      const logs = [{ blockNumber: "1", topics: [TRANSFER_TOPIC], data: "0x" }];
      stubFetchEtherscan({ status: "1", message: "OK", result: logs });

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));
      const body = await res.json();

      expect(body).toEqual({ result: logs, status: "1", message: "OK" });
    });

    it('treats status "0" with "No records found" as success', async () => {
      stubFetchEtherscan({
        status: "0",
        message: "No records found",
        result: [],
      });

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result).toEqual([]);
      expect(body.message).toBe("No records found");
    });

    it('returns 400 for status "0" with any other message', async () => {
      stubFetchEtherscan({
        status: "0",
        message: "Invalid API Key",
        result: [],
      });

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid API Key" });
    });

    it('falls back to "API error" when the upstream message is missing', async () => {
      stubFetchEtherscan({ status: "0", result: [] });

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "API error" });
    });

    it("coerces a null result into [] on success", async () => {
      stubFetchEtherscan({ status: "1", message: "OK", result: null });

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));
      const body = await res.json();

      expect(body.result).toEqual([]);
    });
  });

  describe("network failures", () => {
    it("returns 500 with the error message when fetch rejects", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNRESET")),
      );

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "ECONNRESET" });
    });

    it("falls back to a generic message when the thrown value has no message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue("boom"));

      const res = await GET(makeRequest(`?address=${VALID_ADDRESS}&chainId=1`));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to fetch logs" });
    });
  });
});
