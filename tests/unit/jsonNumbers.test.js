import { describe, it, expect } from "vitest";
import {
  parseJsonWithBigNumbers,
  stringifyForEditor,
} from "../../app/utils/jsonNumbers.js";

describe("parseJsonWithBigNumbers", () => {
  it("keeps small numbers as numbers", () => {
    expect(parseJsonWithBigNumbers('{"a":123,"b":-45.6,"c":0}')).toEqual({
      a: 123,
      b: -45.6,
      c: 0,
    });
  });

  it("keeps 15-digit (safe) integers as numbers", () => {
    expect(parseJsonWithBigNumbers('{"a":999999999999999}')).toEqual({
      a: 999999999999999,
    });
  });

  it("converts 16+ digit integers to strings losslessly", () => {
    const out = parseJsonWithBigNumbers(
      '{"amount":123456789012345678901234567890}',
    );
    expect(out.amount).toBe("123456789012345678901234567890");
  });

  it("handles big integers inside arrays", () => {
    const out = parseJsonWithBigNumbers('{"vals":[10000000000000000000,1]}');
    expect(out.vals).toEqual(["10000000000000000000", 1]);
  });

  it("handles negative big integers", () => {
    expect(parseJsonWithBigNumbers('{"a":-9999999999999999999}')).toEqual({
      a: "-9999999999999999999",
    });
  });

  it("leaves already-quoted digit strings alone", () => {
    expect(parseJsonWithBigNumbers('{"a":"12345678901234567890"}')).toEqual({
      a: "12345678901234567890",
    });
  });

  it("does not mangle 16+ digit numbers with a fraction", () => {
    // lookahead requires , } ] or whitespace after the integer, so the "."
    // stops the match and the value stays a (lossy) JS number — acceptable,
    // ABI args are never fractional
    const out = parseJsonWithBigNumbers('{"a":12345678901234567.5}');
    expect(typeof out.a).toBe("number");
  });

  it("keeps an 18-decimal token amount lossless in a realistic decode response", () => {
    const body =
      '{"msg":"ok","data":[{"func":"transfer(address,uint256)",' +
      '"args":{"to":"0xd8da6bf26964af9d7eed9e03e53415d37aa96045",' +
      '"amount":12345678901234567890123}}]}';
    const out = parseJsonWithBigNumbers(body);
    expect(out.data[0].args.amount).toBe("12345678901234567890123");
  });

  it("works with pretty-printed JSON (whitespace after colon/bracket)", () => {
    const out = parseJsonWithBigNumbers(
      '{\n  "amount": 99999999999999999999,\n  "vals": [\n    88888888888888888888\n  ]\n}',
    );
    expect(out.amount).toBe("99999999999999999999");
    expect(out.vals).toEqual(["88888888888888888888"]);
  });
});

describe("stringifyForEditor", () => {
  it("renders BigInt values as quoted strings", () => {
    expect(stringifyForEditor({ amount: 10000000000000000n })).toBe(
      '{\n  "amount": "10000000000000000"\n}',
    );
  });

  it("keeps small numbers unquoted and nests objects/arrays", () => {
    const out = stringifyForEditor({ a: 1, b: { c: [2n, "x"] } });
    expect(JSON.parse(out)).toEqual({ a: 1, b: { c: ["2", "x"] } });
  });

  it("renders unsafe JS numbers as full-digit strings (no scientific notation)", () => {
    const out = stringifyForEditor({ amount: 1e21 });
    expect(out).toContain('"1000000000000000000000"');
  });
});
