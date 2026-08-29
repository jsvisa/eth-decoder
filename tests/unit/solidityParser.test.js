import { describe, it, expect } from "vitest";
import {
  buildFunctionMap,
  buildFunctionNameSet,
  buildFileSymbols,
  findFunctionSource,
  makeFunctionNamesClickable,
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
      body: "  function transfer(address to, uint256 amount) external {}",
    });
    expect(map.get("balanceOf")).toEqual({
      name: "balanceOf",
      file: "Token.sol",
      line: 3,
      body: "  function balanceOf(address account) external view returns (uint256) {}",
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

  it("captures the full body when the signature spans multiple lines", () => {
    const sources = {
      "Pool.sol":
        "contract Pool {\n" +
        "  function distributeAndSwap(\n" +
        "    address tokenIn,\n" +
        "    address tokenOut,\n" +
        "    uint256 amountIn\n" +
        "  ) internal {\n" +
        "    require(amountIn > 0);\n" +
        "  }\n" +
        "}",
    };
    const map = buildFunctionMap(sources);
    expect(map.get("distributeAndSwap")).toEqual({
      name: "distributeAndSwap",
      file: "Pool.sol",
      line: 2,
      body:
        "  function distributeAndSwap(\n" +
        "    address tokenIn,\n" +
        "    address tokenOut,\n" +
        "    uint256 amountIn\n" +
        "  ) internal {\n" +
        "    require(amountIn > 0);\n" +
        "  }",
    });
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

  it("handles modifiers", () => {
    const sources = {
      "Ownable.sol":
        "contract Ownable {\n  address public owner;\n  modifier onlyOwner() {\n    require(msg.sender == owner);\n    _;\n  }\n  function withdraw() external onlyOwner {}\n}",
    };
    const map = buildFunctionMap(sources);
    expect(map.get("onlyOwner")).toEqual({
      name: "onlyOwner",
      file: "Ownable.sol",
      line: 3,
      body: "  modifier onlyOwner() {\n    require(msg.sender == owner);\n    _;\n  }",
    });
  });

  it("caches results", () => {
    const sources = { "A.sol": "contract A { function f() external {} }" };
    const map1 = buildFunctionMap(sources);
    const map2 = buildFunctionMap(sources);
    expect(map1).toBe(map2);
  });

  it("does not collide when same filename+length but different content", () => {
    const s1 = { "A.sol": "contract A {\n  function foo() external {}\n}" };
    const s2 = { "A.sol": "contract B {\n  function bar() external {}\n}" };
    const m1 = buildFunctionMap(s1);
    const m2 = buildFunctionMap(s2);
    expect(m1).not.toBe(m2);
    expect(m1.has("foo")).toBe(true);
    expect(m2.has("bar")).toBe(true);
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
    expect(result).toEqual({
      name: "transfer",
      file: "Token.sol",
      line: 2,
      body: "  function transfer(address to, uint256 amount) external {}",
    });
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

describe("makeFunctionNamesClickable", () => {
  it("returns html unchanged for empty set", () => {
    expect(makeFunctionNamesClickable("foo()", new Set(), "link")).toBe(
      "foo()",
    );
  });

  it("wraps function names in clickable links", () => {
    const html = "transfer(msg.sender);";
    const out = makeFunctionNamesClickable(html, new Set(["transfer"]), "link");
    expect(out).toBe(
      '<span class="link" data-fn-name="transfer">transfer</span>(msg.sender);',
    );
  });

  it("links the longest name first when names overlap", () => {
    const html = "transferFrom(msg.sender);";
    const out = makeFunctionNamesClickable(
      html,
      new Set(["transfer", "transferFrom"]),
      "link",
    );
    expect(out).toBe(
      '<span class="link" data-fn-name="transferFrom">transferFrom</span>(msg.sender);',
    );
  });

  it("does not link names inside string/comment spans", () => {
    const html = '<span class="s">"transfer not allowed"</span>';
    const out = makeFunctionNamesClickable(
      html,
      new Set(["transfer"]),
      "link",
      ["s"],
    );
    expect(out).toBe(html);
  });

  it("preserves existing highlight tags while linking text", () => {
    const html = '<span class="k">function</span> foo() {}';
    const out = makeFunctionNamesClickable(html, new Set(["foo"]), "link", [
      "k",
    ]);
    expect(out).toBe(
      '<span class="k">function</span> <span class="link" data-fn-name="foo">foo</span>() {}',
    );
  });
});

describe("buildFileSymbols", () => {
  it("returns empty array for empty content", () => {
    expect(buildFileSymbols("")).toEqual([]);
    expect(buildFileSymbols(null)).toEqual([]);
  });

  it("extracts a contract with nested members", () => {
    const content = [
      "contract Token {",
      "  uint256 public totalSupply;",
      "  mapping(address => uint256) balances;",
      "  event Transfer(address indexed from, address to);",
      "  error InsufficientBalance();",
      "  modifier onlyOwner() { _; }",
      "  struct Point { uint256 x; uint256 y; }",
      "  function transfer(address to, uint256 amount) external {}",
      "  constructor() {}",
      "}",
    ].join("\n");
    const symbols = buildFileSymbols(content);
    expect(symbols.length).toBe(1);
    const contract = symbols[0];
    expect(contract.kind).toBe("contract");
    expect(contract.name).toBe("Token");
    expect(contract.line).toBe(1);
    const kinds = contract.children.map((c) => `${c.kind}:${c.name}`);
    expect(kinds).toEqual([
      "var:totalSupply",
      "var:balances",
      "event:Transfer",
      "error:InsufficientBalance",
      "modifier:onlyOwner",
      "struct:Point",
      "function:transfer",
      "constructor:constructor",
    ]);
    expect(contract.children[0].line).toBe(2);
    expect(contract.children[6].line).toBe(8);
  });

  it("separates multiple top-level definitions", () => {
    const content = [
      "interface IToken {",
      "  function transfer(address to) external;",
      "}",
      "library Math {",
      "  function add(uint256 a) internal pure {}",
      "}",
      "error TopLevelError();",
      "contract Impl is IToken {}",
    ].join("\n");
    const symbols = buildFileSymbols(content);
    expect(symbols.map((s) => `${s.kind}:${s.name}`)).toEqual([
      "interface:IToken",
      "library:Math",
      "error:TopLevelError",
      "contract:Impl",
    ]);
    expect(symbols[0].children.map((c) => c.name)).toEqual(["transfer"]);
  });

  it("ignores definitions inside comments and strings", () => {
    const content = [
      "contract A {",
      "  /* function fakeOne() external {} */",
      "  // function fakeTwo() external {}",
      '  string public constant NOTE = "function fakeThree";',
      "  /* multi",
      "     line { brace",
      "  */",
      "  function real() external {}",
      "}",
    ].join("\n");
    const symbols = buildFileSymbols(content);
    expect(symbols.length).toBe(1);
    const children = symbols[0].children.map((c) => c.name);
    expect(children).toContain("NOTE");
    expect(children).toContain("real");
    expect(children).not.toContain("fakeOne");
    expect(children).not.toContain("fakeTwo");
    expect(children).not.toContain("fakeThree");
  });

  it("caches results for identical content", () => {
    const content = "contract C { function f() external {} }";
    expect(buildFileSymbols(content)).toBe(buildFileSymbols(content));
  });
});
