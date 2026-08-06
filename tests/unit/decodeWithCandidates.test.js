// tests/unit/decodeWithCandidates.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decodeFunctionWithCandidates,
  decodeEventWithCandidates,
} from "../../app/utils/decodeWithCandidates.js";
import {
  serverCacheTestDir,
  resetServerCacheTestDir,
  removeServerCacheTestDir,
} from "../utils/serverCacheTestEnv.js";

const CACHE_DIR = serverCacheTestDir("decode-with-candidates");

// transfer(address,uint256) — selector 0xa9059cbb
const TRANSFER_CALLDATA =
  "0xa9059cbb" +
  "000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" +
  "00000000000000000000000000000000000000000000000000000000000f4240";

function backendResponse(rows) {
  return { ok: true, json: async () => ({ msg: "ok", data: rows }) };
}

function sourcifyFunctionResponse(selector, names) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        function: {
          [selector]: names.map((n) => ({ name: n, filtered: false })),
        },
      },
    }),
  };
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

describe("decodeFunctionWithCandidates", () => {
  it("returns null when no candidate decodes", async () => {
    global.fetch.mockResolvedValueOnce(
      sourcifyFunctionResponse("0xa9059cbb", []),
    );
    expect(await decodeFunctionWithCandidates(TRANSFER_CALLDATA)).toBeNull();
  });

  it("decodes via Sourcify when there is no DB candidate", async () => {
    global.fetch.mockResolvedValueOnce(
      sourcifyFunctionResponse("0xa9059cbb", ["transfer(address,uint256)"]),
    );

    const result = await decodeFunctionWithCandidates(TRANSFER_CALLDATA);
    expect(result.func).toBe("transfer(address,uint256)");
    expect(result.source).toBe("sourcify");
  });

  it("prefers a DB candidate with real parameter names over Sourcify", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const abi = {
      type: "function",
      name: "transfer",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    };
    global.fetch
      .mockResolvedValueOnce(
        backendResponse([
          { text_sign: "transfer(address,uint256)", abi: JSON.stringify(abi) },
        ]),
      )
      .mockResolvedValueOnce(
        sourcifyFunctionResponse("0xa9059cbb", ["transfer(address,uint256)"]),
      );

    const result = await decodeFunctionWithCandidates(TRANSFER_CALLDATA);
    expect(result.source).toBe("cfd1");
    expect(result.args.to.toLowerCase()).toBe(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
    expect(result.abi).toEqual(abi);
  });

  it("prefers a DB candidate whose abi is an object (not a string)", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const abi = {
      type: "function",
      name: "transfer",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    };
    global.fetch
      .mockResolvedValueOnce(
        backendResponse([{ text_sign: "transfer(address,uint256)", abi }]),
      )
      .mockResolvedValueOnce(
        sourcifyFunctionResponse("0xa9059cbb", ["transfer(address,uint256)"]),
      );

    const result = await decodeFunctionWithCandidates(TRANSFER_CALLDATA);
    expect(result.source).toBe("cfd1");
    expect(result.abi).toEqual(abi);
  });

  it("skips a DB candidate with unparsable ABI JSON and falls through to Sourcify", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce(
        backendResponse([
          { text_sign: "transfer(address,uint256)", abi: "not json" },
        ]),
      )
      .mockResolvedValueOnce(
        sourcifyFunctionResponse("0xa9059cbb", ["transfer(address,uint256)"]),
      );

    const result = await decodeFunctionWithCandidates(TRANSFER_CALLDATA);
    expect(result.source).toBe("sourcify");
  });
});

describe("decodeEventWithCandidates", () => {
  const TOPIC0 =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const TOPIC1 =
    "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const TOPIC2 =
    "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const TOPICS = [TOPIC0, TOPIC1, TOPIC2].join(",");
  const DATA =
    "0x00000000000000000000000000000000000000000000000000000000000f4240";

  it("returns null when no candidate decodes", async () => {
    global.fetch.mockResolvedValueOnce(sourcifyEventResponse(TOPIC0, []));
    expect(await decodeEventWithCandidates(TOPIC0, TOPICS, DATA)).toBeNull();
  });

  it("decodes via Sourcify and includes inputs", async () => {
    global.fetch.mockResolvedValueOnce(
      sourcifyEventResponse(TOPIC0, ["Transfer(address,address,uint256)"]),
    );

    const result = await decodeEventWithCandidates(TOPIC0, TOPICS, DATA);
    expect(result.event).toBe("Transfer");
    expect(result.source).toBe("sourcify");
    expect(result.inputs).toHaveLength(3);
  });

  it("prefers a DB candidate whose indexed count matches the topics", async () => {
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
        sourcifyEventResponse(TOPIC0, ["Transfer(address,address,uint256)"]),
      );

    const result = await decodeEventWithCandidates(TOPIC0, TOPICS, DATA);
    expect(result.source).toBe("cfd1");
    expect(result.inputs).toEqual(abi.inputs);
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
        sourcifyEventResponse(TOPIC0, ["Transfer(address,address,uint256)"]),
      );

    const result = await decodeEventWithCandidates(TOPIC0, TOPICS, DATA);
    expect(result.source).toBe("sourcify");
  });
});
