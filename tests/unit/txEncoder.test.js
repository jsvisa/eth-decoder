import { describe, it, expect } from "vitest";
import {
  decodeFunctionData,
  parseAbiItem,
} from "viem";
import { encodeFunction } from "../../app/utils/txEncoder.js";

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
