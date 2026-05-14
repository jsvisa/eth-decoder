import { describe, it, expect } from "vitest";
import {
  isValidHexData,
  serializeValue,
  extractOutputSign,
  decodeFunctionCalldata,
  decodeEventLog,
} from "../../app/utils/decoder.js";

// ---------------------------------------------------------------------------
// isValidHexData
// ---------------------------------------------------------------------------

describe("isValidHexData", () => {
  it("accepts a valid hex string with 0x prefix", () => {
    expect(isValidHexData("0x1234abcd")).toBe(true);
  });

  it("accepts a valid hex string without 0x prefix", () => {
    expect(isValidHexData("1234abcd")).toBe(true);
  });

  it("rejects a string with invalid hex characters", () => {
    expect(isValidHexData("0xzzzzzzzz")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidHexData("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// serializeValue
// ---------------------------------------------------------------------------

describe("serializeValue", () => {
  it("converts BigInt to a string", () => {
    expect(serializeValue(123n)).toBe("123");
  });

  it("recursively converts BigInts inside arrays", () => {
    expect(serializeValue([1n, [2n, 3n]])).toEqual(["1", ["2", "3"]]);
  });

  it("recursively converts BigInts inside objects", () => {
    expect(serializeValue({ a: 5n, b: 0n })).toEqual({ a: "5", b: "0" });
  });

  it("passes strings through unchanged", () => {
    expect(serializeValue("hello")).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// extractOutputSign
// ---------------------------------------------------------------------------

describe("extractOutputSign", () => {
  it("returns (uint256) for a single uint256 output", () => {
    const abi = { outputs: [{ name: "", type: "uint256" }] };
    expect(extractOutputSign(abi)).toBe("(uint256)");
  });

  it("collapses a tuple output to ((uint128,bool))", () => {
    const abi = {
      outputs: [
        {
          name: "",
          type: "tuple",
          components: [
            { name: "a", type: "uint128" },
            { name: "b", type: "bool" },
          ],
        },
      ],
    };
    expect(extractOutputSign(abi)).toBe("((uint128,bool))");
  });
});

// ---------------------------------------------------------------------------
// decodeFunctionCalldata
// ---------------------------------------------------------------------------

// getAdapters() — no inputs, selector 0xb82e16e3 (from evm.func_sign.csv)
const GET_ADAPTERS_ABI = {
  name: "getAdapters",
  type: "function",
  inputs: [],
  outputs: [],
  stateMutability: "view",
};

// transfer(address,uint256) — selector 0xa9059cbb
// calldata encodes transfer(0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48, 1000000)
const TRANSFER_FUNC_ABI = {
  name: "transfer",
  type: "function",
  inputs: [
    { name: "_to", type: "address" },
    { name: "_value", type: "uint256" },
  ],
  outputs: [],
  stateMutability: "nonpayable",
};
const TRANSFER_CALLDATA =
  "0xa9059cbb" +
  "000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" +
  "00000000000000000000000000000000000000000000000000000000000f4240";

describe("decodeFunctionCalldata", () => {
  it("returns the function text signature for a zero-input function", () => {
    const result = decodeFunctionCalldata(GET_ADAPTERS_ABI, "0xb82e16e3");
    expect(result.func).toBe("getAdapters()");
  });

  it("returns an empty args object for a zero-input function", () => {
    const result = decodeFunctionCalldata(GET_ADAPTERS_ABI, "0xb82e16e3");
    expect(result.args).toEqual({});
  });

  it("decodes calldata arguments using input names from the ABI", () => {
    const result = decodeFunctionCalldata(TRANSFER_FUNC_ABI, TRANSFER_CALLDATA);
    expect(result.func).toBe("transfer(address,uint256)");
    expect(result.args._to.toLowerCase()).toBe(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
  });

  it("serializes uint256 arguments as strings, not BigInt", () => {
    const result = decodeFunctionCalldata(TRANSFER_FUNC_ABI, TRANSFER_CALLDATA);
    expect(result.args._value).toBe("1000000");
  });

  it("throws when the 4-byte selector does not match the ABI", () => {
    // Using getAdapters() calldata (0xb82e16e3) with the transfer ABI
    expect(() =>
      decodeFunctionCalldata(TRANSFER_FUNC_ABI, "0xb82e16e3"),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// decodeEventLog
// ---------------------------------------------------------------------------

// Transfer(address indexed fromAddress, address indexed toAddress, uint256 value)
const TRANSFER_EVENT_ABI = {
  name: "Transfer",
  type: "event",
  inputs: [
    { name: "fromAddress", type: "address", indexed: true },
    { name: "toAddress", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
  anonymous: false,
};

const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_TOPIC1 =
  "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const TRANSFER_TOPIC2 =
  "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const TRANSFER_DATA =
  "0x00000000000000000000000000000000000000000000000000000000000f4240";

describe("decodeEventLog", () => {
  it("returns the event name", () => {
    const result = decodeEventLog(
      TRANSFER_EVENT_ABI,
      [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2],
      TRANSFER_DATA,
    );
    expect(result.event).toBe("Transfer");
  });

  it("serializes uint256 values as strings, not BigInt", () => {
    const result = decodeEventLog(
      TRANSFER_EVENT_ABI,
      [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2],
      TRANSFER_DATA,
    );
    expect(result.args.value).toBe("1000000");
  });

  it("decodes indexed address topics", () => {
    const result = decodeEventLog(
      TRANSFER_EVENT_ABI,
      [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2],
      TRANSFER_DATA,
    );
    expect(result.args.fromAddress.toLowerCase()).toBe(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
  });

  it("throws when ABI input count does not match topics", () => {
    // Transfer ABI expects 2 indexed topics but we only pass 1
    expect(() =>
      decodeEventLog(
        TRANSFER_EVENT_ABI,
        [TRANSFER_TOPIC0, TRANSFER_TOPIC1], // missing toAddress topic
        TRANSFER_DATA,
      ),
    ).toThrow();
  });
});
