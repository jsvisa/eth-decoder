import { describe, it, expect } from "vitest";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiItem,
} from "viem";
import { encodeFunction, reencodeMulticallInner, reencodeURInput } from "../../app/utils/txEncoder.js";
import {
  decodeMulticall,
  MULTICALL_ABIS,
} from "../../app/utils/multicallDecoder.js";
import {
  decodeUniversalRouter,
  COMMAND_ABI_PARAMS,
  UR_EXECUTE_NO_DEADLINE,
  UR_EXECUTE_WITH_DEADLINE,
} from "../../app/utils/universalRouter.js";

const TRANSFER_DATA =
  "0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000002386f26fc10000";
const VITALIK = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const OTHER = "0x1111111111111111111111111111111111111111";
const TRANSFER_SIG = "transfer(address,uint256)";
const TRANSFER_ABI = parseAbiItem("function transfer(address,uint256)");

describe("encodeFunction", () => {
  it("round-trips an ERC20 transfer byte-for-byte", () => {
    const out = encodeFunction(TRANSFER_SIG, {
      to: VITALIK,
      amount: "10000000000000000",
    });
    expect(out).toBe(TRANSFER_DATA);
  });

  it("accepts plain numbers for small uints", () => {
    const out = encodeFunction(TRANSFER_SIG, { to: VITALIK, amount: 1000 });
    const dec = decodeFunctionData({ abi: [TRANSFER_ABI], data: out });
    expect(dec.args[1]).toBe(1000n);
  });

  it("changes only the recipient word when the recipient is edited", () => {
    const out = encodeFunction(TRANSFER_SIG, {
      to: OTHER,
      amount: "10000000000000000",
    });
    expect(out.slice(0, 10)).toBe(TRANSFER_DATA.slice(0, 10)); // selector
    expect(out.slice(10, 74)).toBe(
      "0000000000000000000000001111111111111111111111111111111111111111",
    );
    expect(out.slice(74)).toBe(TRANSFER_DATA.slice(74)); // amount word
  });

  it("encodes a big uint256 (> 2^53) losslessly", () => {
    const big = "123456789012345678901234567890";
    const out = encodeFunction(TRANSFER_SIG, { to: VITALIK, amount: big });
    const dec = decodeFunctionData({ abi: [TRANSFER_ABI], data: out });
    expect(dec.args[1]).toBe(123456789012345678901234567890n);
  });

  it("encodes max uint256 losslessly", () => {
    const max = (2n ** 256n - 1n).toString();
    const out = encodeFunction(TRANSFER_SIG, { to: VITALIK, amount: max });
    const dec = decodeFunctionData({ abi: [TRANSFER_ABI], data: out });
    expect(dec.args[1]).toBe(2n ** 256n - 1n);
  });

  it("encodes bool and bytes args", () => {
    const out = encodeFunction("setFlag(bool,bytes)", {
      flag: true,
      data: "0x1234",
    });
    const abi = parseAbiItem("function setFlag(bool,bytes)");
    const dec = decodeFunctionData({ abi: [abi], data: out });
    expect(dec.args[0]).toBe(true);
    expect(dec.args[1]).toBe("0x1234");
  });

  it("encodes address[] args", () => {
    const out = encodeFunction("setOwners(address[])", {
      owners: [VITALIK, OTHER],
    });
    const abi = parseAbiItem("function setOwners(address[])");
    const dec = decodeFunctionData({ abi: [abi], data: out });
    expect(dec.args[0]).toEqual([
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "0x1111111111111111111111111111111111111111",
    ]);
  });

  it("encodes tuple args given as objects (positional fallback)", () => {
    const out = encodeFunction("submit((address,uint256))", {
      order: { to: VITALIK, amount: "5" },
    });
    const abi = parseAbiItem("function submit((address,uint256))");
    const dec = decodeFunctionData({ abi: [abi], data: out });
    expect(dec.args[0][0].toLowerCase()).toBe(VITALIK);
    expect(dec.args[0][1]).toBe(5n);
  });

  it("throws a descriptive error on an invalid address", () => {
    expect(() =>
      encodeFunction(TRANSFER_SIG, { to: "0x123", amount: "1" }),
    ).toThrow();
  });
});

const transferCalldata = (to, amount) =>
  encodeFunctionData({
    abi: [parseAbiItem("function transfer(address,uint256)")],
    args: [to, amount],
  });

describe("reencodeMulticallInner", () => {
  const inner0 = TRANSFER_DATA;
  const inner1 = transferCalldata(OTHER, 5n);
  const bytesOuter = encodeFunctionData({
    abi: [MULTICALL_ABIS["0xac9650d8"].abi],
    args: [[inner0, inner1]],
  });

  it("round-trips an unchanged inner call byte-for-byte (bytes[])", () => {
    expect(reencodeMulticallInner(bytesOuter, 1, inner1)).toBe(bytesOuter);
  });

  it("replaces only the edited inner call (bytes[])", () => {
    const newInner = transferCalldata(
      "0x3333333333333333333333333333333333333333",
      7n,
    );
    const out = reencodeMulticallInner(bytesOuter, 1, newInner);
    const dec = decodeMulticall(out);
    expect(dec.inner_calls[0].data).toBe(inner0);
    expect(dec.inner_calls[1].data).toBe(newInner);
  });

  it("replaces inner callData in an aggregate3 tuple array, preserving other fields", () => {
    const agg3Outer = encodeFunctionData({
      abi: [MULTICALL_ABIS["0x82ad56cb"].abi],
      args: [[{ target: VITALIK, allowFailure: true, callData: inner0 }]],
    });
    const newInner = transferCalldata(OTHER, 7n);
    const out = reencodeMulticallInner(agg3Outer, 0, newInner);
    const dec = decodeMulticall(out);
    expect(dec.inner_calls[0].data).toBe(newInner);
    expect(dec.inner_calls[0].target.toLowerCase()).toBe(VITALIK);
    expect(dec.inner_calls[0].allowFailure).toBe(true);
  });

  it("handles a big uint256 amount in the edited inner call", () => {
    const big = 123456789012345678901234567890n;
    const newInner = transferCalldata(OTHER, big);
    const out = reencodeMulticallInner(bytesOuter, 0, newInner);
    const dec = decodeMulticall(out);
    expect(dec.inner_calls[0].data).toBe(newInner);
    const innerDec = decodeFunctionData({
      abi: [parseAbiItem("function transfer(address,uint256)")],
      data: dec.inner_calls[0].data,
    });
    expect(innerDec.args[1]).toBe(big);
  });

  it("throws on an unknown selector", () => {
    expect(() => reencodeMulticallInner(TRANSFER_DATA, 0, "0x")).toThrow(
      /multicall/i,
    );
  });

  it("throws on an out-of-range index", () => {
    expect(() => reencodeMulticallInner(bytesOuter, 5, "0x")).toThrow(
      /out of range/i,
    );
  });
});

describe("reencodeURInput", () => {
  const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  // TRANSFER (0x05): token, recipient, value
  const transferInput = encodeAbiParameters(COMMAND_ABI_PARAMS[0x05], [
    TOKEN,
    VITALIK,
    1000n,
  ]);
  const outerWithDeadline = encodeFunctionData({
    abi: [UR_EXECUTE_WITH_DEADLINE],
    args: ["0x05", [transferInput], 1700000000n],
  });

  it("round-trips unchanged args byte-for-byte", () => {
    const out = reencodeURInput(outerWithDeadline, 0, {
      token: TOKEN,
      recipient: VITALIK,
      value: "1000",
    });
    expect(out).toBe(outerWithDeadline);
  });

  it("changes the recipient of a TRANSFER command, preserving deadline", () => {
    const out = reencodeURInput(outerWithDeadline, 0, {
      token: TOKEN,
      recipient: OTHER,
      value: "1000",
    });
    const dec = decodeUniversalRouter(out);
    expect(dec.inner_calls[0].args.recipient.toLowerCase()).toBe(OTHER);
    expect(dec.args.deadline).toBe(1700000000);
  });

  it("handles a big uint256 value losslessly", () => {
    const big = "987654321098765432109876543210";
    const out = reencodeURInput(outerWithDeadline, 0, {
      token: TOKEN,
      recipient: VITALIK,
      value: big,
    });
    const dec = decodeUniversalRouter(out);
    expect(dec.inner_calls[0].args.value).toBe(big);
  });

  it("ignores display-only keys (name, allow_revert, path_decoded)", () => {
    const out = reencodeURInput(outerWithDeadline, 0, {
      token: TOKEN,
      recipient: VITALIK,
      value: "1000",
      name: "TRANSFER",
      allow_revert: false,
      path_decoded: ["0xabc", 3000],
    });
    expect(out).toBe(outerWithDeadline);
  });

  it("supports the no-deadline execute selector", () => {
    const outer = encodeFunctionData({
      abi: [UR_EXECUTE_NO_DEADLINE],
      args: ["0x05", [transferInput]],
    });
    const out = reencodeURInput(outer, 0, {
      token: TOKEN,
      recipient: OTHER,
      value: "1000",
    });
    const dec = decodeUniversalRouter(out);
    expect(dec.inner_calls[0].args.recipient.toLowerCase()).toBe(OTHER);
    expect(dec.args.deadline).toBeUndefined();
  });

  it("passes through {raw} for commands without known ABI params", () => {
    // V4_SWAP (0x10) has no entry in COMMAND_ABI_PARAMS
    const outer = encodeFunctionData({
      abi: [UR_EXECUTE_WITH_DEADLINE],
      args: ["0x10", ["0x1234"], 1700000000n],
    });
    const out = reencodeURInput(outer, 0, { raw: "0xdeadbeef" });
    const dec = decodeUniversalRouter(out);
    expect(dec.inner_calls[0].args.raw).toBe("0xdeadbeef");
  });

  it("throws for a command without ABI params when args are not {raw}", () => {
    const outer = encodeFunctionData({
      abi: [UR_EXECUTE_WITH_DEADLINE],
      args: ["0x10", ["0x1234"], 1700000000n],
    });
    expect(() => reencodeURInput(outer, 0, { foo: 1 })).toThrow(/raw/);
  });

  it("throws for a non-UR selector", () => {
    expect(() => reencodeURInput(TRANSFER_DATA, 0, {})).toThrow(
      /Universal Router/i,
    );
  });

  it("honors {raw} for a known-params command whose input failed to decode", () => {
    // decoder falls back to {raw} when a TRANSFER input is malformed
    const outer = encodeFunctionData({
      abi: [UR_EXECUTE_WITH_DEADLINE],
      args: ["0x05", ["0x1234"], 1700000000n],
    });
    const out = reencodeURInput(outer, 0, { raw: "0x1234" });
    expect(out).toBe(outer);
  });
});
