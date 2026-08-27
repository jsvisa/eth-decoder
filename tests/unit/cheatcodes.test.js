import { describe, it, expect, vi, beforeEach } from "vitest";
import { autoFillWarpTimestamp } from "../../app/utils/cheatcodes.js";
import { createPublicClient, http } from "viem";

vi.mock("viem", () => ({
  createPublicClient: vi.fn(),
  http: vi.fn(),
}));

function mockClient({ timestamp } = {}) {
  const client = {
    getBlock: vi
      .fn()
      .mockResolvedValue(timestamp === undefined ? {} : { timestamp }),
  };
  vi.mocked(createPublicClient).mockReturnValue(client);
  return client;
}

describe("autoFillWarpTimestamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early (no RPC) when blockNumber is null", async () => {
    const result = await autoFillWarpTimestamp(
      null,
      { deal: {} },
      "http://rpc",
    );

    expect(result).toEqual({ deal: {} });
    expect(createPublicClient).not.toHaveBeenCalled();
  });

  it("returns early (no RPC) when blockNumber is undefined", async () => {
    const result = await autoFillWarpTimestamp(
      undefined,
      undefined,
      "http://rpc",
    );

    expect(result).toEqual({});
    expect(createPublicClient).not.toHaveBeenCalled();
  });

  it('returns early (no RPC) when blockNumber is "latest"', async () => {
    const result = await autoFillWarpTimestamp("latest", null, "http://rpc");

    expect(result).toEqual({});
    expect(createPublicClient).not.toHaveBeenCalled();
  });

  it("returns existing cheatcodes untouched when warp.timestamp already set", async () => {
    const cheatcodes = {
      warp: { timestamp: 1234567890 },
      deal: { address: "0xabc", amount: "100" },
    };
    const result = await autoFillWarpTimestamp(
      "12345",
      cheatcodes,
      "http://rpc",
    );

    // Same reference back — not cloned or modified.
    expect(result).toBe(cheatcodes);
    expect(createPublicClient).not.toHaveBeenCalled();
  });

  it.each([
    ["decimal string", "12345", 12345n],
    ["hex string", "0x3039", 12345n],
    ["number", 12345, 12345n],
  ])(
    "fetches block for %s block numbers and fills timestamp",
    async (_label, input, expectedBlockNumber) => {
      const client = mockClient({ timestamp: 1700000000n });

      const result = await autoFillWarpTimestamp(input, null, "http://rpc");

      expect(client.getBlock).toHaveBeenCalledWith({
        blockNumber: expectedBlockNumber,
      });
      expect(result).toEqual({ warp: { timestamp: 1700000000 } });
    },
  );

  it("merges timestamp into an existing warp object without dropping other keys", async () => {
    mockClient({ timestamp: 1700000000n });

    const result = await autoFillWarpTimestamp(
      "12345",
      { warp: { timeUnit: "seconds" }, prank: { address: "0xdef" } },
      "http://rpc",
    );

    expect(result).toEqual({
      warp: { timeUnit: "seconds", timestamp: 1700000000 },
      prank: { address: "0xdef" },
    });
  });

  it("passes viemChain into createPublicClient only when provided", async () => {
    const chain = { id: 8453, name: "Base" };
    mockClient({ timestamp: 1n });

    await autoFillWarpTimestamp("100", null, "http://rpc", chain);

    expect(createPublicClient).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(createPublicClient).mock.calls[0][0];
    expect(arg.chain).toBe(chain);
    expect(http).toHaveBeenCalledWith("http://rpc");
  });

  it("omits the chain key when no viemChain is given but still uses the rpcUrl transport", async () => {
    mockClient({ timestamp: 1n });

    await autoFillWarpTimestamp("100", null, "http://rpc");

    const arg = vi.mocked(createPublicClient).mock.calls[0][0];
    expect(arg).not.toHaveProperty("chain");
    expect(http).toHaveBeenCalledWith("http://rpc");
  });

  it("does not overwrite anything when block has no timestamp", async () => {
    mockClient({}); // block.timestamp undefined -> truthiness check fails

    const cheatcodes = { deal: { address: "0xabc" } };
    const result = await autoFillWarpTimestamp(
      "12345",
      cheatcodes,
      "http://rpc",
    );

    expect(result).toBe(cheatcodes);
  });

  it("treats a zero timestamp as missing (falsy) and leaves cheatcodes alone", async () => {
    mockClient({ timestamp: 0n });

    const result = await autoFillWarpTimestamp("12345", null, "http://rpc");

    expect(result).toEqual({});
  });

  it("falls back to input cheatcodes when getBlock rejects", async () => {
    const client = mockClient();
    client.getBlock.mockRejectedValue(new Error("boom"));

    const cheatcodes = { deal: { address: "0xabc" } };
    const result = await autoFillWarpTimestamp(
      "12345",
      cheatcodes,
      "http://rpc",
    );

    expect(result).toBe(cheatcodes);
  });

  it("falls back to empty object for unparseable block numbers (no RPC call)", async () => {
    mockClient({ timestamp: 1n });

    const result = await autoFillWarpTimestamp(
      "not-a-number",
      null,
      "http://rpc",
    );

    expect(result).toEqual({});
    expect(createPublicClient).not.toHaveBeenCalled();
  });

  it("converts BigInt timestamps to JS Numbers", async () => {
    mockClient({ timestamp: 9999999999n });

    const result = await autoFillWarpTimestamp("1", null, "http://rpc");

    expect(typeof result.warp.timestamp).toBe("number");
    expect(result.warp.timestamp).toBe(9999999999);
  });

  it("handles negative block numbers (valid BigInt)", async () => {
    const client = mockClient();

    // BigInt("-5") parses fine; getBlock then fails on the forked node.
    client.getBlock.mockRejectedValue(new Error("invalid block"));

    const result = await autoFillWarpTimestamp("-5", null, "http://rpc");

    expect(client.getBlock).toHaveBeenCalledWith({ blockNumber: -5n });
    expect(result).toEqual({});
  });
});
