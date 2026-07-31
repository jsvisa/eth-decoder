import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { promises as fs } from "fs";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
  sigToFunctionAbi,
  sigToEventAbi,
} from "../../app/utils/sourcify.js";
import {
  serverCacheTestDir,
  resetServerCacheTestDir,
  removeServerCacheTestDir,
} from "../utils/serverCacheTestEnv.js";

const CACHE_DIR = serverCacheTestDir("sourcify");

beforeEach(async () => {
  process.env.CACHE_DIR = CACHE_DIR;
  await resetServerCacheTestDir(CACHE_DIR);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.CACHE_DIR;
  await removeServerCacheTestDir(CACHE_DIR);
});

// ---------------------------------------------------------------------------
// lookupFunctionSignatures
// ---------------------------------------------------------------------------

describe("lookupFunctionSignatures", () => {
  it("returns an array of signature strings on success", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          function: {
            "0x8612372a": [
              {
                name: "withdraw(uint256,uint32,bytes,bytes32[])",
                filtered: false,
              },
            ],
          },
          event: {},
        },
      }),
    });

    const sigs = await lookupFunctionSignatures("0x8612372a");
    expect(sigs).toEqual(["withdraw(uint256,uint32,bytes,bytes32[])"]);
  });

  it("returns an empty array when the selector has no matches", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { function: { "0xdeadbeef": [] }, event: {} },
      }),
    });

    expect(await lookupFunctionSignatures("0xdeadbeef")).toEqual([]);
  });

  it("returns an empty array when fetch fails", async () => {
    global.fetch.mockRejectedValueOnce(new Error("network error"));
    expect(await lookupFunctionSignatures("0xdeadbeef")).toEqual([]);
  });

  it("returns an empty array when the API returns ok:false", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false }),
    });
    expect(await lookupFunctionSignatures("0xdeadbeef")).toEqual([]);
  });

  it("reuses the local cache and skips the network", async () => {
    const sigs = ["withdraw(uint256,uint32,bytes,bytes32[])"];
    const dir = join(CACHE_DIR, "signatures");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, "0x8612372a.json"), JSON.stringify(sigs));

    const result = await lookupFunctionSignatures("0x8612372a");

    expect(result).toEqual(sigs);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// lookupEventSignatures
// ---------------------------------------------------------------------------

const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

describe("lookupEventSignatures", () => {
  it("returns an array of event signature strings on success", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          event: {
            [TRANSFER_TOPIC0]: [
              { name: "Transfer(address,address,uint256)", filtered: false },
            ],
          },
          function: {},
        },
      }),
    });

    const sigs = await lookupEventSignatures(TRANSFER_TOPIC0);
    expect(sigs).toEqual(["Transfer(address,address,uint256)"]);
  });

  it("returns an empty array when fetch fails", async () => {
    global.fetch.mockRejectedValueOnce(new Error("network error"));
    expect(await lookupEventSignatures(TRANSFER_TOPIC0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sigToFunctionAbi
// ---------------------------------------------------------------------------

describe("sigToFunctionAbi", () => {
  it("builds a function ABI for a simple signature", () => {
    const abi = sigToFunctionAbi("transfer(address,uint256)");
    expect(abi.type).toBe("function");
    expect(abi.name).toBe("transfer");
    expect(abi.inputs).toEqual([
      { name: "arg0", type: "address" },
      { name: "arg1", type: "uint256" },
    ]);
  });

  it("handles array types", () => {
    const abi = sigToFunctionAbi("withdraw(uint256,uint32,bytes,bytes32[])");
    expect(abi.inputs.map((i) => i.type)).toEqual([
      "uint256",
      "uint32",
      "bytes",
      "bytes32[]",
    ]);
  });

  it("handles zero-argument signatures", () => {
    const abi = sigToFunctionAbi("name()");
    expect(abi.inputs).toEqual([]);
  });

  it("handles tuple types", () => {
    const abi = sigToFunctionAbi("foo((uint256,address),bytes32)");
    expect(abi.inputs[0].type).toBe("tuple");
    expect(abi.inputs[0].components).toEqual([
      { name: "arg0", type: "uint256" },
      { name: "arg1", type: "address" },
    ]);
    expect(abi.inputs[1].type).toBe("bytes32");
  });

  it("handles tuple array types", () => {
    const abi = sigToFunctionAbi("bar((uint256,address)[])");
    expect(abi.inputs[0].type).toBe("tuple[]");
    expect(abi.inputs[0].components).toHaveLength(2);
  });

  it("throws on an invalid signature", () => {
    expect(() => sigToFunctionAbi("not-a-sig")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// sigToEventAbi
// ---------------------------------------------------------------------------

describe("sigToEventAbi", () => {
  it("builds an event ABI with the correct number of indexed params", () => {
    const abi = sigToEventAbi("Transfer(address,address,uint256)", 2);
    expect(abi.type).toBe("event");
    expect(abi.name).toBe("Transfer");
    expect(abi.inputs[0].indexed).toBe(true);
    expect(abi.inputs[1].indexed).toBe(true);
    expect(abi.inputs[2].indexed).toBe(false);
  });

  it("marks no params as indexed when numIndexed is 0", () => {
    const abi = sigToEventAbi("Foo(uint256,address)", 0);
    expect(abi.inputs.every((i) => !i.indexed)).toBe(true);
  });

  it("sets anonymous to false", () => {
    expect(sigToEventAbi("Foo(uint256)", 0).anonymous).toBe(false);
  });
});
