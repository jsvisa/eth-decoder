import { describe, it, expect } from "vitest";
import {
  ETHERSCAN_V2_API,
  ROUTESCAN_API_BASE,
  pickApiKey,
  parseEtherscanSourceCode,
} from "../../app/utils/etherscan.js";

describe("exported constants", () => {
  it("exposes the Etherscan V2 endpoint", () => {
    expect(ETHERSCAN_V2_API).toBe("https://api.etherscan.io/v2/api");
  });

  it("exposes the Routescan API base", () => {
    expect(ROUTESCAN_API_BASE).toBe(
      "https://api.routescan.io/v2/network/mainnet/evm",
    );
  });
});

describe("pickApiKey", () => {
  it.each([null, undefined, "", ",,,", " , , "])(
    "returns empty string for %p",
    (input) => {
      expect(pickApiKey(input)).toBe("");
    },
  );

  it("returns the single key, trimmed", () => {
    expect(pickApiKey("only-key")).toBe("only-key");
    expect(pickApiKey("  only-key  ")).toBe("only-key");
  });

  it("picks one of the configured keys across many calls", () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      seen.add(pickApiKey("a,b,c"));
    }
    // Statistical sanity: three distinct keys should all appear within 50 draws.
    expect(seen.size).toBeGreaterThanOrEqual(2);
    for (const key of seen) {
      expect(["a", "b", "c"]).toContain(key);
    }
  });

  it("never invents a key not present in the list", () => {
    for (let i = 0; i < 20; i++) {
      const key = pickApiKey("k1,k2");
      expect(key === "k1" || key === "k2").toBe(true);
    }
  });

  it("coerces non-string input through String()", () => {
    expect(pickApiKey(12345)).toBe("12345");
  });

  it("drops empty segments between commas", () => {
    const key = pickApiKey("real1,,real2,");
    expect(["real1", "real2"]).toContain(key);
  });
});

describe("parseEtherscanSourceCode", () => {
  describe("non-input handling", () => {
    it.each([null, undefined, ""])("returns null for %p", (input) => {
      expect(parseEtherscanSourceCode(input)).toBeNull();
    });

    it('returns null for the exact "not verified" message', () => {
      expect(
        parseEtherscanSourceCode("Contract source code not verified"),
      ).toBeNull();
    });

    it("does NOT treat partial 'not verified' phrasing as unverified", () => {
      const result = parseEtherscanSourceCode("contract NotVerified {}", null);
      expect(result).toHaveProperty("Contract.sol");
    });
  });

  describe("wrapped {{...}} standard-json format", () => {
    const wrap = (json) => `{${json}}`;

    it("parses top-level .sol sources", () => {
      const inner = JSON.stringify({
        "A.sol": { content: "contract A {}" },
        "B.sol": { content: "contract B {}" },
      });
      const result = parseEtherscanSourceCode(wrap(inner));

      expect(result).toEqual({
        "A.sol": "contract A {}",
        "B.sol": "contract B {}",
      });
    });

    it("reads from parsed.sources when the top level has no .sol keys", () => {
      const inner = JSON.stringify({
        language: "Solidity",
        sources: { "C.sol": { content: "pragma solidity ^0.8;" } },
      });
      const result = parseEtherscanSourceCode(wrap(inner));

      expect(result).toEqual({ "C.sol": "pragma solidity ^0.8;" });
    });

    it("returns null when neither level contains any .sol files", () => {
      const inner = JSON.stringify({
        sources: { "notes.txt": { content: "hello" } },
      });
      expect(parseEtherscanSourceCode(wrap(inner))).toBeNull();
    });

    it('keeps non-object source values as-is and maps missing content to ""', () => {
      const inner = JSON.stringify({
        "String.sol": "raw text source",
        "NoContent.sol": { abi: "[]", nope: true },
      });
      const result = parseEtherscanSourceCode(wrap(inner));

      expect(result).toEqual({
        "String.sol": "raw text source",
        "NoContent.sol": "",
      });
    });

    it("falls through to the raw-source path when the wrapped payload is broken JSON", () => {
      // slice(1,-1) leaves "{ not json {", which throws -> raw fallback below.
      const broken = `{{ this is not json {{{`;

      expect(parseEtherscanSourceCode(broken)).toEqual({
        "Contract.sol": broken,
      });
    });
  });

  describe("plain {...} format", () => {
    it("parses a plain standard-json object", () => {
      const body = JSON.stringify({
        sources: { "Plain.sol": { content: "// plain" } },
      });

      expect(parseEtherscanSourceCode(body)).toEqual({
        "Plain.sol": "// plain",
      });
    });

    it("parses when .sol files sit at the top level of a plain object", () => {
      const body = JSON.stringify({
        "Top.sol": { content: "// top" },
        meta: 1,
      });

      expect(parseEtherscanSourceCode(body)).toEqual({
        "Top.sol": "// top",
        meta: 1,
      });
    });

    it("treats JSON arrays as raw source (they do not start with '{')", () => {
      const body = JSON.stringify([{ "Array.sol": { content: "x" } }]);

      // '[' never enters the plain-object branch, so it falls to the
      // raw-source path and is stored verbatim under the default name.
      expect(parseEtherscanSourceCode(body)).toEqual({
        "Contract.sol": body,
      });
    });

    it("falls through to raw source for broken plain JSON", () => {
      const broken = "{ almost json";
      expect(parseEtherscanSourceCode(broken)).toEqual({
        "Contract.sol": broken,
      });
    });
  });

  describe("raw source fallback", () => {
    it("uses the '// File:' header from the first line", () => {
      const src = "// File: token/MyToken.sol\ncontract MyToken {}";
      expect(parseEtherscanSourceCode(src)).toEqual({
        "token/MyToken.sol": src,
      });
    });

    it("prefers the File header over the provided fallback name", () => {
      const src = "// File: HeaderWins.sol\n// code";
      const result = parseEtherscanSourceCode(src, "FallbackIgnored.sol");

      expect(Object.keys(result)).toEqual(["HeaderWins.sol"]);
    });

    it("honours fallbackFileName when there is no File header", () => {
      const src = "pragma solidity ^0.8;\ncontract X {}";
      const result = parseEtherscanSourceCode(src, "X.sol");

      expect(result).toEqual({ "X.sol": src });
    });

    it("defaults to Contract.sol without any hints", () => {
      const src = "pragma solidity ^0.8;";
      expect(parseEtherscanSourceCode(src)).toEqual({ "Contract.sol": src });
    });

    it("ignores File headers that are not on the first line", () => {
      const src = "\n// File: SecondLine.sol\ncontract Y {}";
      const result = parseEtherscanSourceCode(src, "Y.sol");

      expect(result).toEqual({ "Y.sol": src });
    });

    it("does not match lowercase 'file:' headers", () => {
      const src = "// file: lower.sol\nx";
      expect(parseEtherscanSourceCode(src)).toEqual({ "Contract.sol": src });
    });

    it("stops at whitespace after the filename (regex captures only the token)", () => {
      const src = "// File: Stop Here.sol\nx";
      const result = parseEtherscanSourceCode(src);

      expect(Object.keys(result)).toEqual(["Stop"]);
    });
  });

  describe("large inputs", () => {
    it("handles multi-file payloads", () => {
      const sources = {};
      for (let i = 0; i < 100; i++) {
        sources[`File${i}.sol`] = { content: `contract C${i} {}` };
      }

      const result = parseEtherscanSourceCode(JSON.stringify({ sources }));

      expect(Object.keys(result)).toHaveLength(100);
    });
  });
});
