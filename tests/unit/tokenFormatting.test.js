import { describe, it, expect } from "vitest";
import { formatTokenAmount } from "../../app/utils/tokenFormatting.js";

describe("formatTokenAmount", () => {
  describe("zero decimals", () => {
    it("returns the whole number as a locale string", () => {
      expect(formatTokenAmount(1000n, 0)).toBe("1,000");
    });

    it("handles zero value", () => {
      expect(formatTokenAmount(0n, 0)).toBe("0");
    });
  });

  describe("whole amounts (no remainder)", () => {
    it("formats 1 USDC (6 decimals)", () => {
      expect(formatTokenAmount(1_000_000n, 6)).toBe("1");
    });

    it("formats 1,000 USDC (6 decimals)", () => {
      expect(formatTokenAmount(1_000_000_000n, 6)).toBe("1,000");
    });

    it("formats 1 ETH (18 decimals)", () => {
      expect(formatTokenAmount(10n ** 18n, 18)).toBe("1");
    });

    it("formats 1,234 ETH (18 decimals)", () => {
      expect(formatTokenAmount(1234n * 10n ** 18n, 18)).toBe("1,234");
    });
  });

  describe("fractional amounts", () => {
    it("formats 1.5 USDC (6 decimals)", () => {
      expect(formatTokenAmount(1_500_000n, 6)).toBe("1.5");
    });

    it("trims trailing fractional zeros: 1.50 → 1.5", () => {
      expect(formatTokenAmount(1_500_000n, 6)).toBe("1.5");
    });

    it("formats 0.001 ETH (18 decimals)", () => {
      expect(formatTokenAmount(10n ** 15n, 18)).toBe("0.001");
    });

    it("caps fractional digits at 6 characters", () => {
      // 1 / 3 of a token with 18 decimals — would be repeating without cap
      const oneThird = 10n ** 18n / 3n;
      const result = formatTokenAmount(oneThird, 18);
      const fracPart = result.split(".")[1] ?? "";
      expect(fracPart.length).toBeLessThanOrEqual(6);
    });

    it("pads remainder correctly for small fractions", () => {
      // 0.000001 USDC (6 decimals) = 1 raw
      expect(formatTokenAmount(1n, 6)).toBe("0.000001");
    });
  });

  describe("sign handling", () => {
    it("treats negative BigInt as positive (caller handles sign)", () => {
      expect(formatTokenAmount(-1_000_000n, 6)).toBe("1");
    });

    it("treats negative string as positive", () => {
      expect(formatTokenAmount("-1000000", 6)).toBe("1");
    });
  });

  describe("string input coercion", () => {
    it("accepts a decimal string", () => {
      expect(formatTokenAmount("1000000000", 6)).toBe("1,000");
    });

    it("accepts a BigInt-formatted string", () => {
      expect(formatTokenAmount("1000000", 6)).toBe("1");
    });
  });

  describe("error handling", () => {
    it("returns null for non-numeric string", () => {
      expect(formatTokenAmount("not-a-number", 6)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(formatTokenAmount(undefined, 6)).toBeNull();
    });
  });
});
