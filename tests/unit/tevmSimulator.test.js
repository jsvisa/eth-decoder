// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  createTevmClient,
  decodeRevertData,
  ensureTevmNodeCompat,
  sanitizeForkRpcResult,
  simulateWithClient,
  collectAllCallAddresses,
  populateTraceToNames,
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

  it("persists a USDT transfer locally and exposes the new state to balanceOf reads", async () => {
    const { client, blockNumber } = await createTevmClient(
      "ethereum",
      undefined,
      MAINNET_FORK_BLOCK,
      null,
      1,
    );

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
