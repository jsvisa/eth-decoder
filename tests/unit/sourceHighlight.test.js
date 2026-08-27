import { describe, it, expect } from "vitest";
import {
  detectLang,
  tokenizeToLines,
  renderLineSegments,
  highlightText,
  compileSearch,
  searchContent,
  searchAllFiles,
} from "../../app/utils/sourceHighlight.js";

const CLASS_MAP = {
  comment: "c-comment",
  natspec: "c-natspec",
  string: "c-string",
  keyword: "c-keyword",
  number: "c-number",
  key: "c-key",
  literal: "c-literal",
};

describe("detectLang", () => {
  it("detects by extension", () => {
    expect(detectLang("Token.sol")).toBe("solidity");
    expect(detectLang("meta.json")).toBe("json");
    expect(detectLang("Vault.vy")).toBe("vyper");
    expect(detectLang("inline.yul")).toBe("yul");
    expect(detectLang("README.md")).toBe("plain");
    expect(detectLang("")).toBe("plain");
  });
});

describe("tokenizeToLines", () => {
  it("returns empty array for empty content", () => {
    expect(tokenizeToLines("", "solidity")).toEqual([]);
    expect(tokenizeToLines(null, "solidity")).toEqual([]);
  });

  it("highlights solidity keywords, strings and comments", () => {
    const lines = tokenizeToLines(
      'uint256 x = 1; // note\nstring s = "hi";',
      "solidity",
    );
    expect(renderLineSegments(lines[0], CLASS_MAP)).toBe(
      '<span class="c-keyword">uint256</span> x = <span class="c-number">1</span>; <span class="c-comment">// note</span>',
    );
    expect(renderLineSegments(lines[1], CLASS_MAP)).toBe(
      '<span class="c-keyword">string</span> s = <span class="c-string">&quot;hi&quot;</span>;',
    );
  });

  it("keeps the type on continuation lines of multi-line comments", () => {
    const lines = tokenizeToLines("/* start\nmiddle\nend */ code", "solidity");
    expect(lines.length).toBe(3);
    expect(renderLineSegments(lines[0], CLASS_MAP)).toBe(
      '<span class="c-comment">/* start</span>',
    );
    expect(renderLineSegments(lines[1], CLASS_MAP)).toBe(
      '<span class="c-comment">middle</span>',
    );
    expect(renderLineSegments(lines[2], CLASS_MAP)).toBe(
      '<span class="c-comment">end */</span> code',
    );
  });

  it("highlights JSON keys separately from values", () => {
    const lines = tokenizeToLines(
      '{"name": "vault", "n": 3, "ok": true}',
      "json",
    );
    const html = renderLineSegments(lines[0], CLASS_MAP);
    expect(html).toContain('<span class="c-key">&quot;name&quot;</span>');
    expect(html).toContain('<span class="c-string">&quot;vault&quot;</span>');
    expect(html).toContain('<span class="c-number">3</span>');
    expect(html).toContain('<span class="c-literal">true</span>');
  });

  it("highlights vyper decorators and comments", () => {
    const lines = tokenizeToLines(
      "@external\ndef foo() -> uint256:  # cfg",
      "vyper",
    );
    expect(renderLineSegments(lines[0], CLASS_MAP)).toContain(
      '<span class="c-keyword">@external</span>',
    );
    expect(renderLineSegments(lines[1], CLASS_MAP)).toContain(
      '<span class="c-keyword">def</span>',
    );
    expect(renderLineSegments(lines[1], CLASS_MAP)).toContain(
      '<span class="c-comment"># cfg</span>',
    );
  });

  it("escapes HTML in plain text", () => {
    const lines = tokenizeToLines('<script>&"x"</script>', "plain");
    expect(renderLineSegments(lines[0], CLASS_MAP)).toBe(
      "&lt;script&gt;&amp;&quot;x&quot;&lt;/script&gt;",
    );
  });

  it("escapes HTML entities inside tokens", () => {
    const lines = tokenizeToLines('string s = "<b>&</b>";', "solidity");
    expect(renderLineSegments(lines[0], CLASS_MAP)).toContain(
      "&lt;b&gt;&amp;&lt;/b&gt;",
    );
  });
});

describe("renderLineSegments with marks", () => {
  const content = "uint256 balance = 100; // balance tracker";
  const lines = tokenizeToLines(content, "solidity");

  it("marks the exact match range preserving syntax colors", () => {
    const html = renderLineSegments(lines[0], CLASS_MAP, [
      { col: 8, length: 7, cls: "mark" },
    ]);
    expect(html).toBe(
      '<span class="c-keyword">uint256</span> <mark class="mark">balance</mark> = <span class="c-number">100</span>; <span class="c-comment">// balance tracker</span>',
    );
  });

  it("marks inside a string token", () => {
    const lines2 = tokenizeToLines('string s = "abcabc";', "solidity");
    const html = renderLineSegments(lines2[0], CLASS_MAP, [
      { col: 15, length: 3, cls: "mark" },
    ]);
    expect(html).toBe(
      '<span class="c-keyword">string</span> s = <span class="c-string">&quot;abc</span><mark class="mark">abc</mark><span class="c-string">&quot;</span>;',
    );
  });

  it("handles multiple marks on one line", () => {
    const html = renderLineSegments(lines[0], CLASS_MAP, [
      { col: 0, length: 7, cls: "m1" },
      { col: 18, length: 3, cls: "m2", current: true },
    ]);
    expect(html).toContain('<mark class="m1">uint256</mark>');
    expect(html).toContain('<mark class="m2">100</mark>');
  });

  it("escapes marked text", () => {
    const lines2 = tokenizeToLines("x < y", "plain");
    const html = renderLineSegments(lines2[0], CLASS_MAP, [
      { col: 2, length: 1, cls: "mark" },
    ]);
    expect(html).toBe('x <mark class="mark">&lt;</mark> y');
  });
});

describe("highlightText", () => {
  it("renders multi-line snippets with newlines preserved", () => {
    const html = highlightText("uint256 a;\nuint256 b;", "solidity", CLASS_MAP);
    expect(html.split("\n").length).toBe(2);
    expect(html).toContain('<span class="c-keyword">uint256</span>');
  });
});

describe("compileSearch + searchContent", () => {
  it("finds multiple case-insensitive literal matches", () => {
    const matcher = compileSearch("AB", {});
    expect(matcher.error).toBeNull();
    expect(matcher.find("ab ab ab")).toEqual([
      { col: 0, length: 2 },
      { col: 3, length: 2 },
      { col: 6, length: 2 },
    ]);
  });

  it("respects caseSensitive", () => {
    const matcher = compileSearch("Ab", { caseSensitive: true });
    expect(matcher.find("ab Ab ab")).toEqual([{ col: 3, length: 2 }]);
  });

  it("supports regex mode and reports invalid patterns", () => {
    const matcher = compileSearch("b\\d+", { regex: true });
    expect(matcher.find("a b12 b34")).toEqual([
      { col: 2, length: 3 },
      { col: 6, length: 3 },
    ]);
    const bad = compileSearch("([", { regex: true });
    expect(bad.error).toBeTruthy();
    expect(bad.find("test")).toEqual([]);
  });

  it("handles zero-length regex matches without hanging", () => {
    const matcher = compileSearch("a*", { regex: true });
    expect(matcher.find("bab").length).toBeGreaterThan(0);
  });

  it("searchContent returns per-line matches with line numbers", () => {
    const matcher = compileSearch("foo", {});
    const content = "foo\nbar foo\nbaz";
    expect(searchContent(content, matcher)).toEqual([
      { line: 1, col: 0, length: 3 },
      { line: 2, col: 4, length: 3 },
    ]);
  });

  it("searchContent respects the cap", () => {
    const matcher = compileSearch("x", {});
    const content = "x\nx\nx\nx";
    expect(searchContent(content, matcher, 2).length).toBe(2);
  });

  it("searchContent returns empty for null matcher/content", () => {
    expect(searchContent("foo", null)).toEqual([]);
    expect(searchContent("", compileSearch("f", {}))).toEqual([]);
  });
});

describe("searchAllFiles", () => {
  const sources = {
    "A.sol": "alpha\nbeta",
    "B.sol": "beta beta",
    "C.sol": "nothing here",
  };

  it("groups matches by file", () => {
    const groups = searchAllFiles(sources, compileSearch("beta", {}));
    expect(groups.map((g) => g.file)).toEqual(["A.sol", "B.sol"]);
    expect(groups[1].matches).toEqual([
      { line: 1, col: 0, length: 4 },
      { line: 1, col: 5, length: 4 },
    ]);
  });

  it("respects per-file and total caps", () => {
    const many = { "D.sol": "hit\nhit\nhit" };
    const groups = searchAllFiles(many, compileSearch("hit", {}), 2, 5);
    expect(groups[0].matches.length).toBe(2);
  });

  it("returns empty for invalid matcher", () => {
    expect(
      searchAllFiles(sources, compileSearch("([", { regex: true })),
    ).toEqual([]);
  });
});
