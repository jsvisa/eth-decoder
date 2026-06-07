/**
 * Format a raw token amount (BigInt or BigInt-coercible string) using its
 * decimal places, returning a human-readable string.
 *
 * The sign of the input is ignored — pass abs value or let the caller
 * prepend "+"/"-".  Returns null on any conversion error.
 *
 * Fractional digits are trimmed of trailing zeros and capped at 6 characters
 * so that e.g. 1/3 of a token doesn't produce 18 repeating digits.
 */
export function formatTokenAmount(rawValue, decimals) {
  try {
    const val =
      typeof rawValue === "bigint" ? rawValue : BigInt(String(rawValue));
    const absVal = val < 0n ? -val : val;
    if (decimals === 0) return absVal.toLocaleString();
    const divisor = BigInt(10 ** decimals);
    const whole = absVal / divisor;
    const remainder = absVal % divisor;
    if (remainder === 0n) return whole.toLocaleString();
    const fracStr = remainder
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "")
      .slice(0, 6);
    return `${whole.toLocaleString()}.${fracStr}`;
  } catch {
    return null;
  }
}
