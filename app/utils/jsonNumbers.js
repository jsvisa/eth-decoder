/**
 * Lossless JSON parsing and serialization for big integers (16+ digits)
 * that exceed Number.MAX_SAFE_INTEGER (9007199254740991, 15-16 digits)
 */

// JSON integer literals of 16+ digits exceed Number.MAX_SAFE_INTEGER
// and silently lose precision in JSON.parse.
// Quote them in the raw text first so they parse as lossless strings.
// Matches: optional whitespace/colon/bracket, optional minus sign, 16+ digits,
// lookahead for , } ] or whitespace (not a decimal point)
const BIG_INT_LITERAL = /([:,[]\s*)(-?\d{16,})(?=\s*[,}\]])/g;

export function parseJsonWithBigNumbers(text) {
  return JSON.parse(text.replace(BIG_INT_LITERAL, '$1"$2"'));
}

export function stringifyForEditor(value) {
  const json = JSON.stringify(
    value,
    (key, v) => {
      if (typeof v === "bigint") return `__BIG__${v.toString()}__BIG__`;
      if (
        typeof v === "number" &&
        !Number.isSafeInteger(v) &&
        Number.isFinite(v)
      ) {
        return `__BIG__${v.toLocaleString("en-US", {
          useGrouping: false,
          maximumFractionDigits: 0,
        })}__BIG__`;
      }
      return v;
    },
    2,
  );
  // Integers display bare; precision is safe because parseJsonWithBigNumbers
  // re-quotes 16+ digit literals before JSON.parse on the way back in.
  return json
    .replace(/"__BIG__(-?\d+)__BIG__"/g, "$1")
    .replace(/"(-?\d{16,})"(?!\s*:)/g, "$1");
}
