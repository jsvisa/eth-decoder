// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createMemoryClient } from "tevm";
import { createCommon, createMockKzg } from "tevm/common";
import { EvmError } from "tevm/evm";
import { bytesToHex, getContractAddress, hexToBytes } from "viem";
import {
  ARBITRUM_PRECOMPILE_REFERENCES,
  createArbitrumPrecompiles,
  createPrecompilesForChain,
} from "../../app/utils/precompiles.js";
import {
  createTevmClient,
  createArbSysPrecompile,
  decodeRevertData,
  ensureTevmNodeCompat,
  findRootCause,
  sanitizeForkRpcResult,
  simulateWithClient,
  collectAllCallAddresses,
  populateTraceToNames,
  resolveTraceSourceLines,
} from "../../app/utils/tevmSimulator.js";

// Pre-encoded revert payloads (selector + ABI-encoded args).
// Generated with viem: keccak256(sig).slice(0,10) + encodeAbiParameters(...)
const HEX = {
  // Error("Ownable: caller is not the owner")
  errorString:
    "0x08c379a0" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572",

  // Panic(1) — assert failed
  panic1:
    "0x4e487b71" +
    "0000000000000000000000000000000000000000000000000000000000000001",

  // Panic(17) — arithmetic overflow/underflow
  panic17:
    "0x4e487b71" +
    "0000000000000000000000000000000000000000000000000000000000000011",

  // Unauthorized() — zero-arg custom error
  unauthorized: "0x82b42900",

  // OwnableUnauthorizedAccount(address)
  ownableUnauthorized:
    "0x118cdaa7" +
    "0000000000000000000000001234567890123456789012345678901234567890",
};

const OWNABLE_UNAUTHORIZED_ABI = [
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [{ name: "account", type: "address" }],
  },
];

const UNAUTHORIZED_ABI = [{ type: "error", name: "Unauthorized", inputs: [] }];
const ERC20_TRANSFER_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const USDT_RECIPIENT = "0x000000000000000000000000000000000000dEaD";
const USDT_TRANSFER_AMOUNT = "1000000";
const MAINNET_FORK_BLOCK = "latest";
const ARBSYS_BLOCK_NUMBER_SELECTOR = "0xa3b1b31d";
const ARBINFO_ADDRESS = "0x0000000000000000000000000000000000000065";
const RETURN_42_INIT_CODE = "0x600a600c600039600a6000f3602a60005260206000f3";
const NESTED_CREATE_INIT_CODE = "0x600060006000f05060006000f3";
const REVERTING_INIT_CODE = "0x60006000fd";

async function createLocalTevmClient() {
  const client = createMemoryClient({
    common: createCommon({
      id: 1,
      name: "ethereum",
      customCrypto: { kzg: createMockKzg() },
    }),
  });
  ensureTevmNodeCompat(client);
  await client.tevmReady();
  return client;
}

async function readTokenBalance(client, blockNumber, tokenAddress, account) {
  const result = await simulateWithClient(client, blockNumber, {
    chain: "ethereum",
    address: tokenAddress,
    functionName: "balanceOf(address)",
    args: [account],
    abi: ERC20_TRANSFER_BALANCE_OF_ABI,
    fromAddress: USDT_HOLDER,
  });

  expect(result.success).toBe(true);
  expect(result.decoded[0]?.value).toBeDefined();
  return BigInt(result.decoded[0].value);
}

describe("decodeRevertData", () => {
  describe("Error(string)", () => {
    it("decodes a standard require revert message", () => {
      expect(decodeRevertData(HEX.errorString)).toBe(
        "Ownable: caller is not the owner",
      );
    });

    it("does not need the ABI for Error(string)", () => {
      expect(decodeRevertData(HEX.errorString, [])).toBe(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("Panic(uint256)", () => {
    it("decodes Panic(1) as assert failed", () => {
      expect(decodeRevertData(HEX.panic1)).toBe("Panic: assert failed");
    });

    it("decodes Panic(17) as arithmetic overflow/underflow", () => {
      expect(decodeRevertData(HEX.panic17)).toBe(
        "Panic: arithmetic overflow/underflow",
      );
    });
  });

  describe("custom errors", () => {
    it("decodes a zero-arg custom error by name", () => {
      expect(decodeRevertData(HEX.unauthorized, UNAUTHORIZED_ABI)).toBe(
        "Unauthorized",
      );
    });

    it("decodes a custom error with an address argument", () => {
      expect(
        decodeRevertData(HEX.ownableUnauthorized, OWNABLE_UNAUTHORIZED_ABI),
      ).toBe(
        "OwnableUnauthorizedAccount(0x1234567890123456789012345678901234567890)",
      );
    });

    it("returns null for an unknown custom error selector without ABI", () => {
      expect(decodeRevertData(HEX.ownableUnauthorized, [])).toBeNull();
    });

    it("returns null for an unknown custom error selector with wrong ABI", () => {
      expect(
        decodeRevertData(HEX.ownableUnauthorized, UNAUTHORIZED_ABI),
      ).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for null input", () => {
      expect(decodeRevertData(null)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(decodeRevertData("")).toBeNull();
    });

    it("returns null for bare 0x", () => {
      expect(decodeRevertData("0x")).toBeNull();
    });

    it("returns null for data shorter than 4 bytes", () => {
      expect(decodeRevertData("0x08c379")).toBeNull();
    });
  });
});

describe("findRootCause", () => {
  const node = (output, errorReason, calls = [], error = null) => ({
    output,
    errorReason,
    error,
    calls,
  });

  it("returns null for null node", () => {
    expect(findRootCause(null, "0xdeadbeef")).toBeNull();
  });

  it("returns the deepest frame whose raw output bytes match the tx revert data", () => {
    const root = node(
      "0xdeadbeef",
      null, // root ABI can't decode the bubbled custom error
      [node("0xdeadbeef", "INSUFFICIENT_OUTPUT_AMOUNT", [], "revert")],
      "revert",
    );
    expect(findRootCause(root, "0xdeadbeef")).toBe(
      "INSUFFICIENT_OUTPUT_AMOUNT",
    );
  });

  it("ignores deeper frames that reverted with different bytes (off-path)", () => {
    const root = node(
      "0xaaaa",
      null,
      [
        node("0xbbbb", "STF", [], "revert"), // caught/rewrapped, never reached the tx root
      ],
      "revert",
    );
    expect(findRootCause(root, "0xaaaa")).toBeNull();
  });

  it("returns the parent's reason when it re-wraps the child's error (try/catch)", () => {
    const root = node(
      "0xcafebabe",
      "Multicall: call failed",
      [node("0xdeadbeef", "INSUFFICIENT_OUTPUT_AMOUNT", [], "revert")],
      "revert",
    );
    expect(findRootCause(root, "0xcafebabe")).toBe("Multicall: call failed");
  });

  it("falls back to the deepest decodable reason when the tx reverted empty", () => {
    const root = node(
      "0x",
      null,
      [node("0xdeadbeef", "INSUFFICIENT_OUTPUT_AMOUNT", [], "revert")],
      "revert",
    );
    expect(findRootCause(root, "0x")).toBe("INSUFFICIENT_OUTPUT_AMOUNT");
  });

  it("returns null when the tx reverted with data but nothing decoded it", () => {
    const root = node(
      "0xdeadbeef",
      null,
      [
        node("0xdeadbeef", null, [], "revert"), // same bytes bubbled, but undecodable
      ],
      "revert",
    );
    expect(findRootCause(root, "0xdeadbeef")).toBeNull();
  });

  it("picks the deepest on-path frame in a bubbling chain", () => {
    const root = node(
      "0xdeadbeef",
      null,
      [
        node("0xdeadbeef", "Generic", [
          node("0xdeadbeef", "INSUFFICIENT_OUTPUT_AMOUNT"),
        ]),
      ],
      "revert",
    );
    expect(findRootCause(root, "0xdeadbeef")).toBe(
      "INSUFFICIENT_OUTPUT_AMOUNT",
    );
  });

  it("propagates the reason through a chain where all frames bubble the same bytes", () => {
    const root = node(
      "0xdeadbeef",
      null,
      [
        node(
          "0xdeadbeef",
          null,
          [node("0xdeadbeef", "STF", [], "revert")],
          "revert",
        ),
      ],
      "revert",
    );
    expect(findRootCause(root, "0xdeadbeef")).toBe("STF");
  });

  it("resumes propagation after an intermediate frame bubbles the bytes", () => {
    const root = node(
      "0xdeadbeef",
      null,
      [
        node(
          "0xdeadbeef",
          null,
          [node("0xdeadbeef", "INSUFFICIENT_OUTPUT_AMOUNT", [], "revert")],
          "revert",
        ),
      ],
      "revert",
    );
    expect(findRootCause(root, "0xdeadbeef")).toBe(
      "INSUFFICIENT_OUTPUT_AMOUNT",
    );
  });
});

describe("simulateWithClient", () => {
  it("is exported", () => {
    expect(typeof simulateWithClient).toBe("function");
  });

  it("throws when client is null", async () => {
    await expect(
      simulateWithClient(null, "latest", {
        address: "0x0000000000000000000000000000000000000001",
        functionName: "transfer",
        abi: [],
      }),
    ).rejects.toThrow("client is required");
  });

  it("throws when required params are missing", async () => {
    const fakeClient = {};
    await expect(
      simulateWithClient(fakeClient, "latest", {
        address: "",
        functionName: "transfer",
        abi: [],
      }),
    ).rejects.toThrow("Missing required parameter");
  });

  it("executes CREATE and returns the deployed address", async () => {
    const client = await createLocalTevmClient();
    const result = await simulateWithClient(client, "latest", {
      chain: "ethereum",
      isCreate: true,
      address: null,
      callData: RETURN_42_INIT_CODE,
      persistState: true,
    });

    expect(result.success).toBe(true);
    expect(result.createdAddress).toMatch(/^0x[0-9a-f]{40}$/i);
    expect(result.callTrace.type).toBe("CREATE");
    expect(result.callTrace.to.toLowerCase()).toBe(
      result.createdAddress.toLowerCase(),
    );
  });

  it("persists deployed code and advances CREATE addresses", async () => {
    const client = await createLocalTevmClient();
    const create = () =>
      simulateWithClient(client, "latest", {
        chain: "ethereum",
        isCreate: true,
        address: null,
        callData: RETURN_42_INIT_CODE,
        persistState: true,
      });
    const first = await create();
    const read = await simulateWithClient(client, "latest", {
      chain: "ethereum",
      address: first.createdAddress,
      callData: "0x",
    });
    const second = await create();

    expect(read.rawData).toBe(`0x${"0".repeat(62)}2a`);
    expect(second.createdAddress).not.toBe(first.createdAddress);
  });

  it("traces CREATE executed by constructor init code", async () => {
    const client = await createLocalTevmClient();
    const result = await simulateWithClient(client, "latest", {
      chain: "ethereum",
      isCreate: true,
      address: null,
      callData: NESTED_CREATE_INIT_CODE,
    });

    expect(result.success).toBe(true);
    expect(result.callTrace.calls[0]).toEqual(
      expect.objectContaining({
        type: "CREATE",
        to: expect.stringMatching(/^0x[0-9a-f]{40}$/i),
      }),
    );
  });

  it("returns a null created address when constructor init code reverts", async () => {
    const client = await createLocalTevmClient();
    const result = await simulateWithClient(client, "latest", {
      chain: "ethereum",
      isCreate: true,
      address: null,
      callData: REVERTING_INIT_CODE,
    });

    expect(result.success).toBe(false);
    expect(result.createdAddress).toBeNull();
  });

  it("persists a USDT transfer locally and exposes the new state to balanceOf reads", async () => {
    let client, blockNumber;
    try {
      ({ client, blockNumber } = await createTevmClient(
        "ethereum",
        undefined,
        MAINNET_FORK_BLOCK,
        null,
        1,
      ));
    } catch {
      // Public RPC unavailable — skip rather than fail the suite
      return;
    }

    const senderBalanceBefore = await readTokenBalance(
      client,
      blockNumber,
      USDT_ADDRESS,
      USDT_HOLDER,
    );
    const recipientBalanceBefore = await readTokenBalance(
      client,
      blockNumber,
      USDT_ADDRESS,
      USDT_RECIPIENT,
    );

    const writeResult = await simulateWithClient(client, blockNumber, {
      chain: "ethereum",
      address: USDT_ADDRESS,
      functionName: "transfer(address,uint256)",
      args: [USDT_RECIPIENT, USDT_TRANSFER_AMOUNT],
      abi: ERC20_TRANSFER_BALANCE_OF_ABI,
      fromAddress: USDT_HOLDER,
      cheatcodes: {
        deal: {
          address: USDT_HOLDER,
          amount: "1",
        },
      },
      persistState: true,
    });

    expect(writeResult.success).toBe(true);
    expect(writeResult.error).toBeNull();
    expect(writeResult.logs.length).toBeGreaterThan(0);

    const senderBalanceAfter = await readTokenBalance(
      client,
      blockNumber,
      USDT_ADDRESS,
      USDT_HOLDER,
    );
    const recipientBalanceAfter = await readTokenBalance(
      client,
      blockNumber,
      USDT_ADDRESS,
      USDT_RECIPIENT,
    );

    expect(senderBalanceAfter).toBe(
      senderBalanceBefore - BigInt(USDT_TRANSFER_AMOUNT),
    );
    expect(recipientBalanceAfter).toBe(
      recipientBalanceBefore + BigInt(USDT_TRANSFER_AMOUNT),
    );
  }, 60000);
});

describe("createArbSysPrecompile", () => {
  it("returns the forked Arbitrum block number for arbBlockNumber()", async () => {
    const blockNumber = 484137112n;
    const precompile = createArbSysPrecompile(() => blockNumber).precompile();

    const result = await precompile.function({
      data: hexToBytes(ARBSYS_BLOCK_NUMBER_SELECTOR),
      gasLimit: 1_000_000n,
    });

    expect(result.executionGasUsed).toBe(0x323n);
    expect(bytesToHex(result.returnValue)).toBe(
      "0x000000000000000000000000000000000000000000000000000000001cdb5898",
    );
  });
});

describe("createArbitrumPrecompiles", () => {
  it("is available through the chain-id precompile registry", () => {
    const precompiles = createPrecompilesForChain(42161, {
      request: async () => "0x",
      getBlockTag: () => 1n,
    });

    expect(precompiles).toHaveLength(18);
  });

  it("does not install RPC-backed precompiles for unconfigured chains", () => {
    const precompiles = createPrecompilesForChain(1, {
      request: async () => {
        throw new Error("unexpected rpc call");
      },
      getBlockTag: () => 1n,
    });

    expect(precompiles).toEqual([]);
  });

  it("exports upstream references for the ArbOS address list", () => {
    expect(ARBITRUM_PRECOMPILE_REFERENCES).toEqual(
      expect.objectContaining({
        registry:
          "https://github.com/OffchainLabs/nitro/blob/a618155919315241665356fe60f3cd00d66d5e46/precompiles/precompile.go#L523-L693",
        addressConfig:
          "https://github.com/OffchainLabs/nitro/blob/a618155919315241665356fe60f3cd00d66d5e46/system_tests/eth_config_test.go#L53-L70",
      }),
    );
  });

  it("registers every ArbOS precompile address used by Nitro", () => {
    const precompiles = createArbitrumPrecompiles(
      async () => "0x",
      () => 1n,
    );

    expect(precompiles).toHaveLength(18);
    expect(
      precompiles.map((precompile) => precompile.address.toString()).sort(),
    ).toEqual([
      "0x0000000000000000000000000000000000000064",
      "0x0000000000000000000000000000000000000065",
      "0x0000000000000000000000000000000000000066",
      "0x0000000000000000000000000000000000000067",
      "0x0000000000000000000000000000000000000068",
      "0x0000000000000000000000000000000000000069",
      "0x000000000000000000000000000000000000006b",
      "0x000000000000000000000000000000000000006c",
      "0x000000000000000000000000000000000000006d",
      "0x000000000000000000000000000000000000006e",
      "0x000000000000000000000000000000000000006f",
      "0x0000000000000000000000000000000000000070",
      "0x0000000000000000000000000000000000000071",
      "0x0000000000000000000000000000000000000072",
      "0x0000000000000000000000000000000000000073",
      "0x0000000000000000000000000000000000000074",
      "0x00000000000000000000000000000000000000ff",
      "0x00000000000000000000000000000000000a4b05",
    ]);
  });

  it("delegates non-local ArbOS precompile calls to the fork block", async () => {
    const requests = [];
    const precompile = createArbitrumPrecompiles(
      async (request) => {
        requests.push(request);
        return "0x1234";
      },
      () => 484137112n,
    ).find((candidate) => candidate.address.toString() === ARBINFO_ADDRESS);

    const result = await precompile.function({
      data: hexToBytes("0xabcdef01"),
      gasLimit: 1_000_000n,
    });

    expect(bytesToHex(result.returnValue)).toBe("0x1234");
    expect(requests).toEqual([
      {
        method: "eth_call",
        params: [{ to: ARBINFO_ADDRESS, data: "0xabcdef01" }, "0x1cdb5898"],
      },
    ]);
  });

  it("delegates ArbOS calls through the Tevm execution path", async () => {
    const requests = [];
    const client = createMemoryClient({
      common: createCommon({
        id: 42161,
        name: "arbitrum",
        customCrypto: { kzg: createMockKzg() },
      }),
      customPrecompiles: createPrecompilesForChain(42161, {
        request: async (request) => {
          requests.push(request);
          return "0x1234";
        },
        getBlockTag: () => 484137112n,
      }),
    });
    await client.tevmReady();

    const result = await client.tevmCall({
      to: ARBINFO_ADDRESS,
      data: "0xabcdef01",
      gas: 1_000_000n,
    });

    expect(result.rawData).toBe("0x1234");
    expect(requests).toEqual([
      {
        method: "eth_call",
        params: [{ to: ARBINFO_ADDRESS, data: "0xabcdef01" }, "0x1cdb5898"],
      },
    ]);
  });

  it("handles ArbSys block number locally without an RPC round trip", async () => {
    const precompile = createArbitrumPrecompiles(
      async () => {
        throw new Error("unexpected rpc call");
      },
      () => 484137112n,
    )[0];

    const result = await precompile.function({
      data: hexToBytes(ARBSYS_BLOCK_NUMBER_SELECTOR),
      gasLimit: 1_000_000n,
    });

    expect(bytesToHex(result.returnValue)).toBe(
      "0x000000000000000000000000000000000000000000000000000000001cdb5898",
    );
  });

  it("returns a Tevm EvmError instance when RPC-backed ArbOS calls revert", async () => {
    const precompile = createArbitrumPrecompiles(
      async () => {
        throw new Error("rpc reverted");
      },
      () => 484137112n,
    ).find((candidate) => candidate.address.toString() === ARBINFO_ADDRESS);

    const result = await precompile.function({
      data: hexToBytes("0xabcdef01"),
      gasLimit: 1_000_000n,
    });

    expect(result.exceptionError).toBeInstanceOf(EvmError);
    expect(result.exceptionError.message).toBe("rpc reverted");
  });
});

describe("sanitizeForkRpcResult", () => {
  it("filters blob transactions from forked block responses", () => {
    const block = {
      number: "0x1",
      transactions: [
        { hash: "0xaaa", type: "0x2" },
        { hash: "0xbbb", type: "0x3", blobVersionedHashes: ["0x1234"] },
        { hash: "0xccc", type: "0x03" },
      ],
    };

    expect(sanitizeForkRpcResult("eth_getBlockByNumber", block)).toEqual({
      number: "0x1",
      transactions: [{ hash: "0xaaa", type: "0x2" }],
    });
  });

  it("filters EIP-7702, Optimism and Arbitrum deposit transactions", () => {
    const block = {
      number: "0x1",
      transactions: [
        { hash: "0x001", type: "0x0" },
        { hash: "0x002", type: "0x4" }, // EIP-7702
        { hash: "0x003", type: "0x7e" }, // Optimism deposit
        { hash: "0x004", type: "0x6b" }, // Arbitrum deposit
        { hash: "0x005", type: 4 }, // numeric EIP-7702
      ],
    };

    expect(sanitizeForkRpcResult("eth_getBlockByNumber", block)).toEqual({
      number: "0x1",
      transactions: [{ hash: "0x001", type: "0x0" }],
    });
  });

  it("leaves non-block RPC results unchanged", () => {
    const proof = { address: "0x1234" };
    expect(sanitizeForkRpcResult("eth_getProof", proof)).toBe(proof);
  });
});

describe("ensureTevmNodeCompat", () => {
  it("adds missing block override getters and setters to the tevm node", async () => {
    const client = { transport: { tevm: {} } };

    ensureTevmNodeCompat(client);

    client.transport.tevm.setNextBlockTimestamp(123n);
    client.transport.tevm.setNextBlockGasLimit(456n);
    client.transport.tevm.setNextBlockBaseFeePerGas(789n);
    client.transport.tevm.setNextBlockPrevRandao(321n);
    client.transport.tevm.setBlockTimestampInterval(12n);

    expect(client.transport.tevm.getNextBlockTimestamp()).toBe(123n);
    expect(client.transport.tevm.getNextBlockGasLimit()).toBe(456n);
    expect(client.transport.tevm.getNextBlockBaseFeePerGas()).toBe(789n);
    expect(client.transport.tevm.getNextBlockPrevRandao()).toBe(321n);
    expect(client.transport.tevm.getBlockTimestampInterval()).toBe(12n);
    await expect(
      client.transport.tevm.emitExExEvent(),
    ).resolves.toBeUndefined();
  });

  it("preserves existing tevm node methods", () => {
    const getNextBlockTimestamp = () => 999n;
    const client = {
      transport: {
        tevm: {
          getNextBlockTimestamp,
        },
      },
    };

    ensureTevmNodeCompat(client);

    expect(client.transport.tevm.getNextBlockTimestamp).toBe(
      getNextBlockTimestamp,
    );
  });
});

describe("collectAllCallAddresses", () => {
  const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const ADDR_C = "0xcccccccccccccccccccccccccccccccccccccccc";

  it("returns empty set for null input", () => {
    const result = collectAllCallAddresses(null);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns empty set when node has no calls", () => {
    const node = { to: ADDR_A, calls: [] };
    const result = collectAllCallAddresses(node);
    expect(result.size).toBe(0);
  });

  it("collects addresses from direct children (root excluded)", () => {
    const node = {
      to: ADDR_A,
      calls: [
        { to: ADDR_B, calls: [] },
        { to: ADDR_C, calls: [] },
      ],
    };
    const result = collectAllCallAddresses(node);
    expect(result).toEqual(
      new Set([ADDR_B.toLowerCase(), ADDR_C.toLowerCase()]),
    );
    expect(result.has(ADDR_A.toLowerCase())).toBe(false);
  });

  it("collects addresses from nested children", () => {
    const node = {
      to: ADDR_A,
      calls: [
        {
          to: ADDR_B,
          calls: [{ to: ADDR_C, calls: [] }],
        },
      ],
    };
    const result = collectAllCallAddresses(node);
    expect(result).toEqual(
      new Set([ADDR_B.toLowerCase(), ADDR_C.toLowerCase()]),
    );
  });

  it("skips children without a to field", () => {
    const node = {
      to: ADDR_A,
      calls: [{ calls: [] }, { to: ADDR_B, calls: [] }],
    };
    const result = collectAllCallAddresses(node);
    expect(result).toEqual(new Set([ADDR_B.toLowerCase()]));
  });

  it("deduplicates repeated addresses", () => {
    const node = {
      to: ADDR_A,
      calls: [
        { to: ADDR_B, calls: [] },
        { to: ADDR_B, calls: [] },
      ],
    };
    const result = collectAllCallAddresses(node);
    expect(result.size).toBe(1);
    expect(result.has(ADDR_B.toLowerCase())).toBe(true);
  });

  it("normalizes addresses to lowercase", () => {
    const mixed = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
    const node = {
      to: ADDR_A,
      calls: [{ to: mixed, calls: [] }],
    };
    const result = collectAllCallAddresses(node);
    expect(result.has(mixed.toLowerCase())).toBe(true);
    expect(result.has(mixed)).toBe(false);
  });
});

describe("populateTraceToNames", () => {
  const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  it("does nothing for null input", () => {
    expect(() => populateTraceToNames(null, () => null)).not.toThrow();
  });

  it("sets toName on node when resolveName returns a name", () => {
    const node = { to: ADDR_A, toName: null, calls: [] };
    populateTraceToNames(node, (addr) =>
      addr === ADDR_A.toLowerCase() ? "ContractA" : null,
    );
    expect(node.toName).toBe("ContractA");
  });

  it("does not set toName when resolveName returns null", () => {
    const node = { to: ADDR_A, toName: null, calls: [] };
    populateTraceToNames(node, () => null);
    expect(node.toName).toBeNull();
  });

  it("does not overwrite an existing toName", () => {
    const node = { to: ADDR_A, toName: "Existing", calls: [] };
    populateTraceToNames(node, () => "Override");
    expect(node.toName).toBe("Existing");
  });

  it("does not set toName when node has no to field", () => {
    const node = { to: null, toName: null, calls: [] };
    populateTraceToNames(node, () => "ShouldNotSet");
    expect(node.toName).toBeNull();
  });

  it("resolves names on nested child nodes", () => {
    const node = {
      to: ADDR_A,
      toName: null,
      calls: [
        {
          to: ADDR_B,
          toName: null,
          calls: [],
        },
      ],
    };
    populateTraceToNames(node, (addr) => {
      if (addr === ADDR_A.toLowerCase()) return "Root";
      if (addr === ADDR_B.toLowerCase()) return "Child";
      return null;
    });
    expect(node.toName).toBe("Root");
    expect(node.calls[0].toName).toBe("Child");
  });

  it("calls resolveName with lowercase address", () => {
    const mixedCase = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
    const node = { to: mixedCase, toName: null, calls: [] };
    const calls = [];
    const resolveName = (addr) => {
      calls.push(addr);
      return null;
    };
    populateTraceToNames(node, resolveName);
    expect(calls).toEqual([mixedCase.toLowerCase()]);
  });
});

// ── Local mock fork RPC (no network) ─────────────────────────────────────────
// Serves a single contract whose runtime reads storage slot 0 (SLOAD/MLOAD/
// RETURN), so a raw CALL to it returns the current value of slot 0. Lets the
// prefetch regression test run without hitting a real RPC.
import { createServer } from "node:http";

const SLOT0 = "0x" + "0".repeat(64);
const ZERO32 = "0x" + "0".repeat(64);
const STORAGE_READER_CODE = "0x60005460005260206000f3";

function createForkRpc({
  code,
  balance,
  nonce = "0x0",
  nonceAddress = null,
  storage = {},
}) {
  const requests = [];
  const blockNumber = "0x10";
  const block = {
    number: blockNumber,
    hash: "0x" + "ab".repeat(32),
    parentHash: "0x" + "cd".repeat(32),
    nonce: "0x0000000000000000",
    sha3Uncles:
      "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
    logsBloom: "0x" + "00".repeat(256),
    transactionsRoot: "0x" + "00".repeat(32),
    stateRoot: "0x" + "00".repeat(32),
    receiptsRoot: "0x" + "00".repeat(32),
    miner: "0x" + "00".repeat(20),
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x0",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    timestamp: "0x6611a4c8",
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x7",
    mixHash: "0x" + "00".repeat(32),
  };

  const respond = (r) => {
    requests.push(r.method);
    let result = null;
    switch (r.method) {
      case "eth_chainId":
        result = "0x1";
        break;
      case "eth_blockNumber":
        result = blockNumber;
        break;
      case "eth_gasPrice":
        result = "0x1";
        break;
      case "eth_feeHistory":
        result = {
          oldestBlock: blockNumber,
          baseFeePerGas: ["0x7"],
          gasUsedRatio: [],
        };
        break;
      case "eth_maxPriorityFeePerGas":
        result = "0x0";
        break;
      case "eth_getBalance":
        result = balance;
        break;
      case "eth_getCode":
        result = code;
        break;
      case "eth_getStorageAt": {
        const [addr, slot] = r.params;
        result = storage[addr.toLowerCase()]?.[slot.toLowerCase()] ?? ZERO32;
        break;
      }
      case "eth_getTransactionCount":
        result =
          !nonceAddress ||
          r.params[0].toLowerCase() === nonceAddress.toLowerCase()
            ? nonce
            : "0x0";
        break;
      case "eth_createAccessList": {
        const [tx] = r.params;
        result = { accessList: [{ address: tx.to, storageKeys: [SLOT0] }] };
        break;
      }
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        result = block;
        break;
      default:
        break;
    }
    return { jsonrpc: "2.0", id: r.id, result };
  };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const payload = Array.isArray(parsed)
        ? parsed.map(respond)
        : respond(parsed);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

describe("simulateWithClient — CREATE fork nonce", () => {
  const SENDER = "0x2222222222222222222222222222222222222222";

  it("derives the created address from the forked sender nonce", async () => {
    const fork = await createForkRpc({
      code: "0x",
      balance: "0xde0b6b3a7640000",
      nonce: "0x7",
      nonceAddress: SENDER,
    });

    try {
      const { client, blockNumber } = await createTevmClient(
        "ethereum",
        fork.url,
        "0x10",
        null,
        1,
      );
      const result = await simulateWithClient(client, blockNumber, {
        chain: "ethereum",
        isCreate: true,
        address: null,
        callData: RETURN_42_INIT_CODE,
        fromAddress: SENDER,
        rpcUrl: fork.url,
      });

      expect(result.success, result.error).toBe(true);
      expect(result.createdAddress.toLowerCase()).toBe(
        getContractAddress({ from: SENDER, nonce: 7n }).toLowerCase(),
      );
      expect(fork.requests).toContain("eth_getTransactionCount");
    } finally {
      await fork.close();
    }
  });

  it("does not fetch a nonce for ordinary CALL simulations", async () => {
    const CONTRACT = "0x1111111111111111111111111111111111111111";
    const fork = await createForkRpc({
      code: STORAGE_READER_CODE,
      balance: "0x0",
    });

    try {
      const { client, blockNumber } = await createTevmClient(
        "ethereum",
        fork.url,
        "0x10",
        null,
        1,
      );
      const result = await simulateWithClient(client, blockNumber, {
        chain: "ethereum",
        address: CONTRACT,
        callData: "0x",
        abi: null,
        fromAddress: SENDER,
        rpcUrl: fork.url,
      });

      expect(result.success).toBe(true);
      expect(fork.requests).not.toContain("eth_getTransactionCount");
    } finally {
      await fork.close();
    }
  });
});

describe("simulateWithClient — session state vs prefetch (regression)", () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";
  const SENDER = "0x2222222222222222222222222222222222222222";

  it("does not clobber committed storage with the fork prefetch by default", async () => {
    const forkValue = "0x" + "0".repeat(63) + "1";
    const committedValue = "0x" + "0".repeat(63) + "2";
    const fork = await createForkRpc({
      code: STORAGE_READER_CODE,
      balance: "0x0",
      storage: { [CONTRACT]: { [SLOT0]: forkValue } },
    });

    try {
      const { client, blockNumber } = await createTevmClient(
        "ethereum",
        fork.url,
        "0x10",
        null,
        1,
      );

      // Prior session call committed slot0 = 2
      await client.tevmSetAccount({
        address: CONTRACT,
        state: { [SLOT0]: committedValue },
      });

      // Default session read: prefetch disabled, committed state must survive.
      const read = await simulateWithClient(client, blockNumber, {
        chain: "ethereum",
        address: CONTRACT,
        callData: "0x",
        abi: null,
        fromAddress: SENDER,
        rpcUrl: fork.url,
      });

      expect(read.success).toBe(true);
      expect(read.rawData).toBe(committedValue);
      // eth_createAccessList is only ever issued by the prefetch; its absence
      // proves the fork-state prefetch was skipped.
      expect(fork.requests).not.toContain("eth_createAccessList");
    } finally {
      await fork.close();
    }
  }, 30000);

  it("lets an explicit prefetch: true opt back in (and shows why it must be off by default)", async () => {
    const forkValue = "0x" + "0".repeat(63) + "1";
    const committedValue = "0x" + "0".repeat(63) + "2";
    const fork = await createForkRpc({
      code: STORAGE_READER_CODE,
      balance: "0x0",
      storage: { [CONTRACT]: { [SLOT0]: forkValue } },
    });

    try {
      const { client, blockNumber } = await createTevmClient(
        "ethereum",
        fork.url,
        "0x10",
        null,
        1,
      );
      await client.tevmSetAccount({
        address: CONTRACT,
        state: { [SLOT0]: committedValue },
      });

      const read = await simulateWithClient(client, blockNumber, {
        chain: "ethereum",
        address: CONTRACT,
        callData: "0x",
        abi: null,
        fromAddress: SENDER,
        rpcUrl: fork.url,
        prefetch: true,
      });

      // The prefetch re-applies the fork's original value (tevmSetAccount with
      // `state` clears storage first), reverting the committed session change.
      expect(read.success).toBe(true);
      expect(read.rawData).toBe(forkValue);
    } finally {
      await fork.close();
    }
  }, 30000);
});

describe("resolveTraceSourceLines", () => {
  const sourceMap = new Map([
    [0, { s: 0, l: 0, f: 0, j: "-", m: 0 }],
    [1, { s: 0, l: 1, f: 0, j: "-", m: 0 }],
    [2, { s: 0, l: 2, f: 0, j: "-", m: 0 }],
    [3, { s: 0, l: 5, f: 1, j: "-", m: 0 }],
  ]);
  const sourceFiles = { "Token.sol": "", "Lib.sol": "" };

  it("sets sourceLines and sourceFile on a node with PCs", () => {
    const node = { pcs: [0, 1, 2], calls: [] };
    resolveTraceSourceLines(node, sourceMap, sourceFiles);
    expect(node.sourceLines).toEqual([1, 2, 3]);
    expect(node.sourceFile).toBe("Token.sol");
  });

  it("returns undefined for node with no source mapping", () => {
    const node = { pcs: [], calls: [] };
    resolveTraceSourceLines(node, sourceMap, sourceFiles);
    expect(node.sourceLines).toBeUndefined();
  });

  it("does not crash on null node", () => {
    expect(() =>
      resolveTraceSourceLines(null, sourceMap, sourceFiles),
    ).not.toThrow();
  });

  it("does not crash when sourceMap is null", () => {
    const node = { pcs: [0, 1], calls: [] };
    expect(() =>
      resolveTraceSourceLines(node, null, sourceFiles),
    ).not.toThrow();
    expect(node.sourceLines).toBeUndefined();
  });

  it("recursively processes child nodes", () => {
    const node = {
      pcs: [0],
      calls: [{ pcs: [1, 2], calls: [] }],
    };
    resolveTraceSourceLines(node, sourceMap, sourceFiles);
    expect(node.sourceLines).toEqual([1]);
    expect(node.calls[0].sourceLines).toEqual([2, 3]);
  });

  it("handles PC mapping to a different file index", () => {
    const node = { pcs: [3], calls: [] };
    resolveTraceSourceLines(node, sourceMap, sourceFiles);
    expect(node.sourceFile).toBe("Lib.sol");
  });
});
