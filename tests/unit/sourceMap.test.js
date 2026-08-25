import { describe, it, expect } from "vitest";
import {
  parseSourceMap,
  pcsToLines,
  getSourceFile,
} from "../../app/utils/sourceMap.js";

describe("parseSourceMap", () => {
  it("returns null for null/undefined input", () => {
    expect(parseSourceMap(null)).toBeNull();
    expect(parseSourceMap(undefined)).toBeNull();
  });

  it("parses a single entry", () => {
    const map = parseSourceMap("0:1:2:-:4");
    expect(map.get(0)).toEqual({ s: 0, l: 1, f: 2, j: "-", m: 4 });
  });

  it("parses multiple semicolon-separated entries", () => {
    const map = parseSourceMap("0:1:2:-:4;5:6:7:i:9");
    expect(map.get(0)).toEqual({ s: 0, l: 1, f: 2, j: "-", m: 4 });
    expect(map.get(1)).toEqual({ s: 5, l: 6, f: 7, j: "i", m: 9 });
  });

  it("fills empty fields from the previous entry", () => {
    const map = parseSourceMap("0:1:2:-:4;::5:o:7");
    expect(map.get(0)).toEqual({ s: 0, l: 1, f: 2, j: "-", m: 4 });
    expect(map.get(1)).toEqual({ s: 0, l: 1, f: 5, j: "o", m: 7 });
  });

  it("handles -1 sentinel values", () => {
    const map = parseSourceMap("-1:-1:-1:-:-1;0:0:0:-:0");
    expect(map.get(0)).toEqual({ s: -1, l: -1, f: -1, j: "-", m: -1 });
    expect(map.get(1)).toEqual({ s: 0, l: 0, f: 0, j: "-", m: 0 });
  });

  it("maps PC indices correctly", () => {
    const map = parseSourceMap("0:10:0:0:0;1:20:0:0:0;2:30:0:0:0");
    expect(map.get(0).l).toBe(10);
    expect(map.get(1).l).toBe(20);
    expect(map.get(2).l).toBe(30);
  });

  it("handles empty entry (no-op instruction)", () => {
    const map = parseSourceMap("0:1:0:0:0;;2:3:0:0:0");
    expect(map.get(0).l).toBe(1);
    // Empty entry inherits from previous
    expect(map.get(1).l).toBe(1);
    expect(map.get(2).l).toBe(3);
  });

  it("handles jump type as string", () => {
    const map = parseSourceMap("0:1:0:i:0");
    expect(map.get(0).j).toBe("i");
  });
});

describe("pcsToLines", () => {
  const sourceMap = parseSourceMap("0:0:0:0:0;0:1:0:0:0;0:2:0:0:0;0:3:0:0:0");

  it("converts PCs to 1-indexed lines", () => {
    const lines = pcsToLines(new Set([0, 1, 2]), sourceMap);
    expect(lines).toEqual([1, 2, 3]);
  });

  it("returns empty array for empty PC set", () => {
    expect(pcsToLines(new Set(), sourceMap)).toEqual([]);
  });

  it("returns empty array when sourceMap is null", () => {
    expect(pcsToLines(new Set([0]), null)).toEqual([]);
  });

  it("deduplicates lines when multiple PCs map to same line", () => {
    const map = parseSourceMap("0:0:0:0:0;0:0:0:0:0;0:1:0:0:0");
    const lines = pcsToLines(new Set([0, 1, 2]), map);
    expect(lines).toEqual([1, 2]);
  });

  it("excludes lines with -1 mapping", () => {
    const map = parseSourceMap("-1:-1:-1:-1:-1;0:0:0:0:0");
    const lines = pcsToLines(new Set([0, 1]), map);
    expect(lines).toEqual([1]);
  });

  it("returns sorted lines", () => {
    const map = parseSourceMap("0:5:0:0:0;0:2:0:0:0;0:8:0:0:0");
    const lines = pcsToLines(new Set([0, 1, 2]), map);
    expect(lines).toEqual([3, 6, 9]);
  });
});

describe("getSourceFile", () => {
  const sourceFiles = {
    "Token.sol": "contract Token {}",
    "Lib.sol": "library Lib {}",
  };
  const sourceMap = parseSourceMap("0:0:0:0:0;0:0:1:0:0");

  it("returns the file name for a given PC", () => {
    expect(getSourceFile(0, sourceMap, sourceFiles)).toBe("Token.sol");
    expect(getSourceFile(1, sourceMap, sourceFiles)).toBe("Lib.sol");
  });

  it("returns null when sourceMap is null", () => {
    expect(getSourceFile(0, null, sourceFiles)).toBeNull();
  });

  it("returns null when sourceFiles is null", () => {
    expect(getSourceFile(0, sourceMap, null)).toBeNull();
  });

  it("returns null for file index out of range", () => {
    const map = parseSourceMap("0:0:99:0:0");
    expect(getSourceFile(0, map, sourceFiles)).toBeNull();
  });
});
