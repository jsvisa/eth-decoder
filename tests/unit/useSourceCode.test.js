import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { createElement as h, StrictMode } from "react";
import SourceCodeViewer from "../../app/contract-caller/components/SourceCodeViewer.js";

const SOURCES = {
  "Token.sol":
    "contract Token {\n  function transfer(address to, uint256 amount) external {}\n}",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("SourceCodeViewer loading resolves under StrictMode double-mount", () => {
  beforeEach(() => {
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  });

  it("does not leave a permanent loading spinner", async () => {
    global.fetch = vi.fn(async () => {
      await sleep(30); // in-flight across the strict unmount/remount
      return {
        ok: true,
        json: async () => ({ sourceCode: SOURCES, compilerVersion: "0.8.13" }),
      };
    });

    render(
      h(
        StrictMode,
        null,
        h(SourceCodeViewer, {
          open: true,
          address: "0x1111111111111111111111111111111111111111",
          chain: "ethereum",
          functionName: "transfer(address,uint256)",
          highlightLines: null,
          sourceFile: null,
          onClose: () => {},
        }),
      ),
    );

    await sleep(400);

    const spinners = document.querySelectorAll('[class*="loadingLine"]').length;
    const rows = document.querySelectorAll('[class*="codeLine"]').length;
    expect(spinners).toBe(0);
    expect(rows).toBeGreaterThan(0);
  });
});
