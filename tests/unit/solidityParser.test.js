import { describe, it, expect } from "vitest";
import {
  buildFunctionMap,
  buildFunctionNameSet,
  findFunctionSource,
} from "../../app/utils/solidityParser.js";

describe("buildFunctionMap", () => {
  it("returns null for null sources", () => {
    expect(buildFunctionMap(null)).toBeNull();
  });

  it("parses functions from a single file", () => {
    const sources = {
      "Token.sol":
        "contract Token {\n  function transfer(address to, uint256 amount) external {}\n  function balanceOf(address account) external view returns (uint256) {}\n}",
    };
    const map = buildFunctionMap(sources);
    expect(map.get("transfer")).toEqual({
      name: "transfer",
      file: "Token.sol",
      line: 2,
    });
    expect(map.get("balanceOf")).toEqual({
      name: "balanceOf",
      file: "Token.sol",
      line: 3,
    });
  });

  it("parses multi-file contracts", () => {
    const sources = {
      "Token.sol":
        "contract Token {\n  function transfer(address to, uint256 amount) external {}\n}",
      "Lib.sol":
        "library Lib {\n  function add(uint256 a, uint256 b) external pure returns (uint256) {}\n}",
    };
    const map = buildFunctionMap(sources);
    expect(map.get("transfer").file).toBe("Token.sol");
    expect(map.get("add").file).toBe("Lib.sol");
  });

  it("handles events and errors", () => {
    const sources = {
      "C.sol":
        "contract C {\n  event Transfer(address indexed from, address indexed to, uint256 value);\n  error InsufficientBalance(uint256 available, uint256 required);\n  function foo() external {}\n}",
    };
    const map = buildFunctionMap(sources);
    expect(map.get("Transfer")).toBeDefined();
    expect(map.get("InsufficientBalance")).toBeDefined();
    expect(map.get("foo")).toBeDefined();
  });

  it("caches results", () => {
    const sources = { "A.sol": "contract A { function f() external {} }" };
    const map1 = buildFunctionMap(sources);
    const map2 = buildFunctionMap(sources);
    expect(map1).toBe(map2);
  });

  it("handles invalid source without throwing", () => {
    const sources = { "Bad.sol": "not valid solidity {{{" };
    expect(() => buildFunctionMap(sources)).not.toThrow();
    const map = buildFunctionMap(sources);
    expect(map.size).toBe(0);
  });
});

describe("findFunctionSource", () => {
  const sources = {
    "Token.sol":
      "contract Token {\n  function transfer(address to, uint256 amount) external {}\n}",
  };

  it("finds a function by full signature", () => {
    const result = findFunctionSource("transfer(address,uint256)", sources);
    expect(result).toEqual({ name: "transfer", file: "Token.sol", line: 2 });
  });

  it("returns null for unknown function", () => {
    expect(findFunctionSource("unknown()", sources)).toBeNull();
  });

  it("returns null for null functionName", () => {
    expect(findFunctionSource(null, sources)).toBeNull();
  });

  it("returns null for null sources", () => {
    expect(findFunctionSource("transfer()", null)).toBeNull();
  });
});

describe("buildFunctionNameSet", () => {
  it("returns empty set for null sources", () => {
    const s = buildFunctionNameSet(null);
    expect(s).toBeInstanceOf(Set);
    expect(s.size).toBe(0);
  });

  it("builds a set of function names from sources", () => {
    const sources = {
      "Token.sol":
        "contract Token {\n  function transfer(address to, uint256 amount) external {}\n  function balanceOf(address account) external view returns (uint256) {}\n}",
    };
    const s = buildFunctionNameSet(sources);
    expect(s.has("transfer")).toBe(true);
    expect(s.has("balanceOf")).toBe(true);
    expect(s.has("unknown")).toBe(false);
  });

  it("caches results", () => {
    const sources = { "A.sol": "contract A { function f() external {} }" };
    const s1 = buildFunctionNameSet(sources);
    const s2 = buildFunctionNameSet(sources);
    expect(s1).toBe(s2);
  });
});
