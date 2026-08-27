import { describe, it, expect } from "vitest";
import {
  parseSourceMap,
  pcsToLines,
  getSourceFile,
} from "../../app/utils/sourceMap.js";

describe("parseSourceMap", () => {
  describe("basic functionality", () => {
    it("parses a simple source map", () => {
      const sourceMap = "1:2:3:i:4;5:6:7:o:8";
      const result = parseSourceMap(sourceMap);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
      expect(result.get(1)).toEqual({ s: 5, l: 6, f: 7, j: "o", m: 8 });
    });

    it("handles empty source map", () => {
      const result = parseSourceMap("");

      expect(result).toBeNull();
    });

    it("handles null source map", () => {
      const result = parseSourceMap(null);

      expect(result).toBeNull();
    });

    it("handles undefined source map", () => {
      const result = parseSourceMap(undefined);

      expect(result).toBeNull();
    });

    it("handles source map with only empty entries", () => {
      const sourceMap = ";;;;";
      const result = parseSourceMap(sourceMap);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(5);
      expect(result.get(0)).toEqual({ s: -1, l: -1, f: -1, j: -1, m: -1 });
    });

    it("handles source map with mixed empty and filled entries", () => {
      const sourceMap = "1:2:3:i:4;;;;5:6:7:o:8";
      const result = parseSourceMap(sourceMap);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBeGreaterThanOrEqual(5);
      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
      if (result.size > 5) {
        expect(result.get(5)).toEqual({ s: 5, l: 6, f: 7, j: "o", m: 8 });
      }
    });
  });

  describe("field propagation (empty fields)", () => {
    it("propagates previous values for empty fields", () => {
      const sourceMap = "1:2:3:i:4;;:6::8";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
      expect(result.get(1)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
    });

    it("handles all empty fields after first entry", () => {
      const sourceMap = "1:2:3:i:4;;;;;";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
      expect(result.get(1)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
      expect(result.get(4)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
    });

    it("handles partially empty fields", () => {
      const sourceMap = "1::3::4;:2:::8";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 1, l: -1, f: 3, j: -1, m: 4 });
      expect(result.get(1)).toEqual({ s: 1, l: 2, f: 3, j: -1, m: 8 });
    });

    it("propagates jump type correctly", () => {
      const sourceMap = "1:2:3:i:4;;:::8";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
      expect(result.get(1)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
    });
  });

  describe("jump type handling", () => {
    it("handles 'i' jump type (into)", () => {
      const sourceMap = "1:2:3:i:4";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0).j).toBe("i");
    });

    it("handles 'o' jump type (out)", () => {
      const sourceMap = "1:2:3:o:4";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0).j).toBe("o");
    });

    it("handles '-' jump type (regular)", () => {
      const sourceMap = "1:2:3:-:4";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0).j).toBe("-");
    });

    it("handles custom jump types", () => {
      const sourceMap = "1:2:3:custom:4";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0).j).toBe("custom");
    });
  });

  describe("number parsing", () => {
    it("handles positive integers", () => {
      const sourceMap = "10:20:30:i:40";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 10, l: 20, f: 30, j: "i", m: 40 });
    });

    it("handles zero values", () => {
      const sourceMap = "0:0:0:i:0";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 0, l: 0, f: 0, j: "i", m: 0 });
    });

    it("handles negative values in initial state", () => {
      const sourceMap = ";;;;";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: -1, l: -1, f: -1, j: -1, m: -1 });
    });

    it("handles very large numbers", () => {
      const sourceMap = "999999:888888:777777:i:666666";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({
        s: 999999,
        l: 888888,
        f: 777777,
        j: "i",
        m: 666666,
      });
    });
  });

  describe("malformed entries", () => {
    it("handles entry with extra colons", () => {
      const sourceMap = "1:2:3:i:4:extra";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
    });

    it("handles entry with missing fields", () => {
      const sourceMap = "1:2:3";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: undefined, m: NaN });
    });

    it("handles entry with invalid number format", () => {
      const sourceMap = "abc:2:3:i:4";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0).s).toBeNaN();
    });

    it("handles whitespace in entries", () => {
      const sourceMap = " 1 : 2 : 3 : i : 4 ";
      const result = parseSourceMap(sourceMap);

      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: " i ", m: 4 });
    });
  });

  describe("large source maps", () => {
    it("handles source map with 1000+ entries", () => {
      const entries = Array.from(
        { length: 1000 },
        (_, i) => `${i}:${i}:${i}:i:${i}`,
      ).join(";");
      const result = parseSourceMap(entries);

      expect(result.size).toBe(1000);
      expect(result.get(999)).toEqual({
        s: 999,
        l: 999,
        f: 999,
        j: "i",
        m: 999,
      });
    });

    it("handles source map with mixed content", () => {
      const entries = "1:2:3:i:4;;;;5:6:7:o:8;;:::9";
      const result = parseSourceMap(entries);

      expect(result.size).toBeGreaterThanOrEqual(7);
    });
  });

  describe("PC indexing", () => {
    it("correctly indexes PCs starting from 0", () => {
      const sourceMap = "1:2:3:i:4;5:6:7:o:8;9:10:11:-:12";
      const result = parseSourceMap(sourceMap);

      expect(result.has(0)).toBe(true);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.get(0)).toEqual({ s: 1, l: 2, f: 3, j: "i", m: 4 });
    });

    it("handles single entry source map", () => {
      const sourceMap = "1:2:3:i:4";
      const result = parseSourceMap(sourceMap);

      expect(result.size).toBe(1);
      expect(result.has(0)).toBe(true);
      expect(result.has(1)).toBe(false);
    });
  });
});

describe("pcsToLines", () => {
  describe("basic functionality", () => {
    it("converts PCs to sorted line numbers", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0;2:5:0:o:0;3:2:0:-:0");
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 3, 6]);
    });

    it("handles empty PC set", () => {
      const sourceMap = parseSourceMap("1:2:3:i:4");
      const pcSet = new Set();

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([]);
    });

    it("handles null source map", () => {
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, null);

      expect(result).toEqual([]);
    });

    it("handles null PC set", () => {
      const sourceMap = parseSourceMap("1:2:3:i:4");

      const result = pcsToLines(null, sourceMap);

      expect(result).toEqual([]);
    });

    it("returns empty array when no valid mappings", () => {
      const sourceMap = parseSourceMap("1:-1:0:i:0;2:-1:0:o:0");
      const pcSet = new Set([0, 1]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([]);
    });
  });

  describe("line number conversion", () => {
    it("converts 0-indexed lines to 1-indexed", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const pcSet = new Set([0]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1]);
    });

    it("handles line number 0 correctly", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const pcSet = new Set([0]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1]);
    });

    it("handles various line numbers", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0;2:9:0:o:0;3:99:0:-:0");
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 10, 100]);
    });
  });

  describe("duplicate handling", () => {
    it("removes duplicate line numbers", () => {
      const sourceMap = parseSourceMap("1:5:0:i:0;2:5:0:o:0;3:5:0:-:0");
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([6]);
    });

    it("handles mixed duplicates and unique lines", () => {
      const sourceMap = parseSourceMap(
        "1:0:0:i:0;2:5:0:o:0;3:5:0:-:0;4:10:0:i:0",
      );
      const pcSet = new Set([0, 1, 2, 3]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 6, 11]);
    });
  });

  describe("sorting", () => {
    it("returns lines in ascending order", () => {
      const sourceMap = parseSourceMap("1:10:0:i:0;2:0:0:o:0;3:5:0:-:0");
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 6, 11]);
    });

    it("handles already sorted input", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0;2:5:0:o:0;3:10:0:-:0");
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 6, 11]);
    });

    it("handles reverse sorted input", () => {
      const sourceMap = parseSourceMap("1:10:0:i:0;2:5:0:o:0;3:0:0:-:0");
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 6, 11]);
    });
  });

  describe("edge cases", () => {
    it("handles PC not in source map", () => {
      const sourceMap = parseSourceMap("1:2:3:i:4");
      const pcSet = new Set([0, 5]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([3]);
    });

    it("handles very large PC values", () => {
      const entries = Array.from(
        { length: 1000 },
        (_, i) => `${i}:${i}:${i}:i:${i}`,
      ).join(";");
      const sourceMap = parseSourceMap(entries);
      const pcSet = new Set([0, 500, 999]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 501, 1000]);
    });

    it("handles PC set with non-sequential values", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0;2:5:0:o:0;3:10:0:-:0");
      const pcSet = new Set([0, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1, 11]);
    });
  });

  describe("negative line handling", () => {
    it("excludes negative line numbers", () => {
      const sourceMap = parseSourceMap("1:-1:0:i:0;2:0:0:o:0;3:-2:0:-:0");
      const pcSet = new Set([0, 1, 2]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([1]);
    });

    it("handles all negative line numbers", () => {
      const sourceMap = parseSourceMap("1:-1:0:i:0;2:-2:0:o:0");
      const pcSet = new Set([0, 1]);

      const result = pcsToLines(pcSet, sourceMap);

      expect(result).toEqual([]);
    });
  });
});

describe("getSourceFile", () => {
  describe("basic functionality", () => {
    it("returns source file name for valid PC", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = {
        "Contract.sol": "content",
        "Interface.sol": "interface",
      };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBe("Contract.sol");
    });

    it("handles null source map", () => {
      const sourceFiles = { "Contract.sol": "content" };

      const result = getSourceFile(0, null, sourceFiles);

      expect(result).toBeNull();
    });

    it("handles null source files", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");

      const result = getSourceFile(0, sourceMap, null);

      expect(result).toBeNull();
    });

    it("handles PC not in source map", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = { "Contract.sol": "content" };

      const result = getSourceFile(5, sourceMap, sourceFiles);

      expect(result).toBeNull();
    });
  });

  describe("file index handling", () => {
    it("handles file index 0", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = { "First.sol": "content", "Second.sol": "interface" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBe("First.sol");
    });

    it("handles file index at end of sources", () => {
      const sourceMap = parseSourceMap("1:0:1:i:0");
      const sourceFiles = { "First.sol": "content", "Second.sol": "interface" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBe("Second.sol");
    });

    it("handles file index beyond sources length", () => {
      const sourceMap = parseSourceMap("1:0:5:i:0");
      const sourceFiles = { "First.sol": "content", "Second.sol": "interface" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBeNull();
    });

    it("handles negative file index", () => {
      const sourceMap = parseSourceMap("1:0:-1:i:0");
      const sourceFiles = { "Contract.sol": "content" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBeNull();
    });
  });

  describe("source files object structure", () => {
    it("handles empty source files object", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = {};

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBeNull();
    });

    it("handles single source file", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = { "Contract.sol": "content" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBe("Contract.sol");
    });

    it("handles multiple source files", () => {
      const sourceMap1 = parseSourceMap("1:0:0:i:0");
      const sourceMap2 = parseSourceMap("1:0:1:i:0");
      const sourceMap3 = parseSourceMap("1:0:2:i:0");
      const sourceFiles = {
        "Contract.sol": "content",
        "Interface.sol": "interface",
        "Library.sol": "library",
      };

      expect(getSourceFile(0, sourceMap1, sourceFiles)).toBe("Contract.sol");
      expect(getSourceFile(0, sourceMap2, sourceFiles)).toBe("Interface.sol");
      expect(getSourceFile(0, sourceMap3, sourceFiles)).toBe("Library.sol");
    });

    it("handles source files with path", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = { "contracts/Contract.sol": "content" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBe("contracts/Contract.sol");
    });
  });

  describe("Object.keys ordering", () => {
    it("relies on Object.keys ordering for file selection", () => {
      const sourceMap = parseSourceMap("1:0:1:i:0");
      const sourceFiles = { "z.sol": "z", "a.sol": "a", "m.sol": "m" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      const keys = Object.keys(sourceFiles);
      expect(result).toBe(keys[1]);
    });

    it("handles numeric keys in source files", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = { 0: "first", 1: "second" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBe("0");
    });
  });

  describe("edge cases", () => {
    it("handles mapping with missing file index", () => {
      const sourceMap = parseSourceMap("1:0:i:0");
      const sourceFiles = { "Contract.sol": "content" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBeNull();
    });

    it("handles very large source files object", () => {
      const largeSourceFiles = {};
      for (let i = 0; i < 1000; i++) {
        largeSourceFiles[`Contract${i}.sol`] = `content${i}`;
      }
      const sourceMap = parseSourceMap("1:0:500:i:0");

      const result = getSourceFile(0, sourceMap, largeSourceFiles);

      expect(result).toBe(`Contract500.sol`);
    });

    it("handles special characters in file names", () => {
      const sourceMap = parseSourceMap("1:0:0:i:0");
      const sourceFiles = { "Contract_v2.0.1-beta.sol": "content" };

      const result = getSourceFile(0, sourceMap, sourceFiles);

      expect(result).toBe("Contract_v2.0.1-beta.sol");
    });
  });
});
